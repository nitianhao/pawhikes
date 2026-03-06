#!/usr/bin/env node
/**
 * Backfill primary trailhead per trailSystem from existing trailHeads.
 * Matches trailHeads by systemRef === trailSystem.extSystemRef, picks one by deterministic sort,
 * computes linkConfidence/linkReason, then in --write mode updates trailSystems.
 *
 * Options: --limit N (default no limit), --write (default dry-run), --force (overwrite existing primaryTrailHeadId).
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnvLocal(root);

const appId = process.env.INSTANT_APP_ID || process.env.INSTANTDB_APP_ID;
const adminToken =
  process.env.INSTANT_APP_ADMIN_TOKEN ||
  process.env.INSTANT_ADMIN_TOKEN ||
  process.env.INSTANTDB_ADMIN_TOKEN;

if (!appId) {
  console.error("Error: INSTANT_APP_ID or INSTANTDB_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!adminToken) {
  console.error("Error: INSTANT_ADMIN_TOKEN (or INSTANT_APP_ADMIN_TOKEN / INSTANTDB_ADMIN_TOKEN) must be set in .env.local");
  process.exit(1);
}

// ── parse args ─────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
let limit = null;
let write = false;
let force = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--limit" && argv[i + 1] != null) {
    limit = Math.max(0, parseInt(argv[i + 1], 10));
    if (Number.isNaN(limit)) limit = null;
    i++;
  } else if (argv[i] === "--write") {
    write = true;
  } else if (argv[i] === "--force") {
    force = true;
  }
}
if (force && !write) {
  console.error("Error: --force is only used with --write");
  process.exit(1);
}

// ── helpers ────────────────────────────────────────────────────────────────

function entityList(res, name) {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

const MISS_RANK = 999;
const MISS_SCORE = -1;
const MISS_DIST = 1e12;
const MISS_REVIEWS = -1;

function sortKey(head) {
  const raw = head.raw && typeof head.raw === "object" ? head.raw : {};
  const rank = raw.rank != null && Number.isFinite(Number(raw.rank)) ? Number(raw.rank) : MISS_RANK;
  const score = raw.score != null && Number.isFinite(Number(raw.score)) ? Number(raw.score) : MISS_SCORE;
  const gConf =
    head.googleMatchConfidence != null && Number.isFinite(head.googleMatchConfidence)
      ? head.googleMatchConfidence
      : MISS_SCORE;
  const distM =
    raw.distanceMeters != null && Number.isFinite(Number(raw.distanceMeters))
      ? Number(raw.distanceMeters)
      : MISS_DIST;
  const reviews =
    head.googleReviewCount != null && Number.isFinite(head.googleReviewCount)
      ? head.googleReviewCount
      : MISS_REVIEWS;
  return { rank, score, gConf, distM, reviews };
}

function compareHeads(a, b) {
  const ka = sortKey(a);
  const kb = sortKey(b);
  if (ka.rank !== kb.rank) return ka.rank - kb.rank;
  if (kb.score !== ka.score) return kb.score - ka.score;
  if (kb.gConf !== ka.gConf) return kb.gConf - ka.gConf;
  if (ka.distM !== kb.distM) return ka.distM - kb.distM;
  return kb.reviews - ka.reviews;
}

function linkConfidence(head) {
  const raw = head.raw && typeof head.raw === "object" ? head.raw : {};
  let c = 0.5;
  if (raw.rank === 1) c += 0.2;
  const g = head.googleMatchConfidence;
  if (g != null && Number(g) >= 0.8) c += 0.2;
  const d = raw.distanceMeters;
  if (d != null && Number(d) <= 100) c += 0.1;
  return Math.max(0, Math.min(1, c));
}

function linkReason(head) {
  const raw = head.raw && typeof head.raw === "object" ? head.raw : {};
  const rank = raw.rank != null ? raw.rank : "?";
  const score = raw.score != null ? raw.score : "?";
  const g = head.googleMatchConfidence != null ? head.googleMatchConfidence : "?";
  const d = raw.distanceMeters != null ? raw.distanceMeters : "?";
  const r = head.googleReviewCount != null ? head.googleReviewCount : "?";
  return `rank=${rank} score=${score} gConf=${g} distM=${d} reviews=${r}`;
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const db = init({ appId, adminToken });
  console.log("Admin SDK initialized OK");
  console.log("Mode:", write ? "WRITE" : "DRY RUN (use --write to persist)");
  if (limit != null) console.log("Limit:", limit);
  if (write && force) console.log("Force: overwrite existing primaryTrailHeadId");
  console.log("");

  const sysLimit = limit != null ? Math.min(limit, 5000) : 5000;
  const thLimit = 50000;

  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: sysLimit } } });
  let systems = entityList(sysRes, "trailSystems");
  if (limit != null && limit > 0) systems = systems.slice(0, limit);
  console.log(`  ${systems.length} systems`);

  console.log("Fetching trailHeads...");
  const thRes = await db.query({ trailHeads: { $: { limit: thLimit } } });
  const trailHeads = entityList(thRes, "trailHeads");
  console.log(`  ${trailHeads.length} trailHeads`);

  const headsBySystemRef = new Map();
  for (const h of trailHeads) {
    const ref = h.systemRef;
    if (ref == null || ref === "") continue;
    if (!headsBySystemRef.has(ref)) headsBySystemRef.set(ref, []);
    headsBySystemRef.get(ref).push(h);
  }

  let systemsProcessed = 0;
  let with0Heads = 0;
  let with1Head = 0;
  let withManyHeads = 0;
  const decisions = [];
  const lowConfidence = [];

  for (const sys of systems) {
    const ref = sys.extSystemRef;
    if (ref == null || ref === "") {
      with0Heads++;
      systemsProcessed++;
      continue;
    }
    const heads = headsBySystemRef.get(ref) ?? [];
    if (heads.length === 0) {
      with0Heads++;
      systemsProcessed++;
      continue;
    }
    if (heads.length === 1) with1Head++;
    else withManyHeads++;
    systemsProcessed++;

    heads.sort(compareHeads);
    const chosen = heads[0];
    const confidence = linkConfidence(chosen);
    const reason = linkReason(chosen);

    decisions.push({
      systemSlug: sys.slug ?? sys.name ?? sys.id,
      systemName: sys.name,
      chosenHeadId: chosen.id,
      confidence,
      reason,
    });
    if (confidence < 0.6) lowConfidence.push(decisions[decisions.length - 1]);
  }

  // ── dry run output ───────────────────────────────────────────────────────

  console.log("\n=== SUMMARY ===");
  console.log("systemsProcessed:", systemsProcessed);
  console.log("with0Heads:", with0Heads);
  console.log("with1Head:", with1Head);
  console.log("withManyHeads:", withManyHeads);

  console.log("\n--- 10 sample decisions ---");
  const samples = decisions.slice(0, 10);
  for (const d of samples) {
    console.log(`  system: ${d.systemSlug} | headId: ${d.chosenHeadId} | confidence: ${d.confidence.toFixed(2)} | ${d.reason}`);
  }

  console.log("\n--- All low-confidence picks (confidence < 0.6) ---");
  if (lowConfidence.length === 0) {
    console.log("  (none)");
  } else {
    for (const d of lowConfidence) {
      console.log(`  ${d.systemSlug} | headId: ${d.chosenHeadId} | confidence: ${d.confidence.toFixed(2)} | ${d.reason}`);
    }
  }

  // ── write mode ───────────────────────────────────────────────────────────

  if (!write) {
    console.log("\nDone (dry run). Use --write to persist.");
    return;
  }

  const nowIso = new Date().toISOString();
  let written = 0;
  let skipped = 0;

  for (const sys of systems) {
    const ref = sys.extSystemRef;
    if (ref == null || ref === "") continue;
    const heads = headsBySystemRef.get(ref) ?? [];
    if (heads.length === 0) continue;

    const existingPrimary = sys.primaryTrailHeadId;
    if (existingPrimary != null && existingPrimary !== "" && !force) {
      skipped++;
      continue;
    }

    heads.sort(compareHeads);
    const chosen = heads[0];
    const confidence = linkConfidence(chosen);
    const reason = linkReason(chosen);

    const payload = {
      primaryTrailHeadId: chosen.id,
      trailHeadsLastLinkedAt: nowIso,
      trailHeadsLinkConfidence: confidence,
      trailHeadsLinkReason: reason,
    };

    try {
      await db.transact([db.tx.trailSystems[sys.id].update(payload)]);
      written++;
    } catch (err) {
      console.error("Write error for system", sys.id, sys.slug ?? sys.name, err);
      if (err?.body) console.error("API body:", JSON.stringify(err.body, null, 2));
      process.exit(1);
    }
  }

  console.log("\n=== WRITE SUMMARY ===");
  console.log("written:", written);
  console.log("skipped (already had primary, use --force to overwrite):", skipped);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  if (err?.body) console.error("API body:", JSON.stringify(err.body, null, 2));
  process.exit(1);
});
