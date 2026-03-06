#!/usr/bin/env node
/**
 * Sync trailHead.isPrimary with trailSystem.primaryTrailHeadId.
 * For each system with primaryTrailHeadId set, finds matching heads by systemRef === extSystemRef
 * and sets isPrimary true for the primary head, false for others (or only updates null/undefined if not --force).
 *
 * Options: --limit N, --write (default dry-run), --force (overwrite existing isPrimary).
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

// ── main ───────────────────────────────────────────────────────────────────

const BATCH = 200;
const SYS_LIMIT = 5000;
const TH_LIMIT = 50000;

async function main() {
  const db = init({ appId, adminToken });
  console.log("Admin SDK initialized OK");
  console.log("Mode:", write ? "WRITE" : "DRY RUN (use --write to persist)");
  if (limit != null) console.log("Limit:", limit);
  if (write && force) console.log("Force: overwrite existing isPrimary on all matching heads");
  console.log("");

  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: SYS_LIMIT } } });
  let systems = entityList(sysRes, "trailSystems");
  if (limit != null && limit > 0) systems = systems.slice(0, limit);
  console.log(`  ${systems.length} systems`);

  console.log("Fetching trailHeads...");
  const thRes = await db.query({ trailHeads: { $: { limit: TH_LIMIT } } });
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
  let systemsMissingPrimaryId = 0;
  let systemsWithPrimaryId = 0;
  let trailHeadsScanned = 0;
  let wouldSetTrue = 0;
  let wouldSetFalse = 0;
  const samples = [];
  const updates = [];

  for (const sys of systems) {
    systemsProcessed++;
    const primaryId = sys.primaryTrailHeadId;
    if (primaryId == null || primaryId === "") {
      systemsMissingPrimaryId++;
      continue;
    }
    systemsWithPrimaryId++;

    const ref = sys.extSystemRef;
    if (ref == null || ref === "") {
      systemsMissingPrimaryId++;
      continue;
    }
    const heads = headsBySystemRef.get(ref) ?? [];
    const systemSlug = sys.slug ?? sys.name ?? sys.id;

    for (const head of heads) {
      trailHeadsScanned++;
      const shouldBePrimary = head.id === primaryId;
      const currentPrimary = head.isPrimary;
      const canUpdate = force || currentPrimary === undefined || currentPrimary === null;
      if (!canUpdate) continue;

      const needsUpdate = currentPrimary !== shouldBePrimary;
      if (needsUpdate) {
        if (shouldBePrimary) wouldSetTrue++;
        else wouldSetFalse++;
        updates.push({ headId: head.id, isPrimary: shouldBePrimary });
      }

      if (samples.length < 10) {
        samples.push({
          systemSlug,
          primaryTrailHeadId: primaryId,
          headId: head.id,
          headName: head.name,
          googleCanonicalName: head.googleCanonicalName,
          googleMapsUrl: head.googleMapsUrl,
          shouldBePrimary,
        });
      }
    }
  }

  // ── dry run output ───────────────────────────────────────────────────────

  console.log("\n=== SUMMARY ===");
  console.log("systemsProcessed:", systemsProcessed);
  console.log("systemsMissingPrimaryId:", systemsMissingPrimaryId);
  console.log("systemsWithPrimaryId:", systemsWithPrimaryId);
  console.log("trailHeadsScanned:", trailHeadsScanned);
  console.log("wouldSetTrue:", wouldSetTrue);
  console.log("wouldSetFalse:", wouldSetFalse);

  console.log("\n--- 10 sample decisions ---");
  for (const s of samples) {
    console.log(
      `  system: ${s.systemSlug} | primaryTrailHeadId: ${s.primaryTrailHeadId} | head.id: ${s.headId} | head.name: ${s.headName ?? "(none)"} | googleCanonicalName: ${s.googleCanonicalName ?? "(none)"} | googleMapsUrl: ${s.googleMapsUrl ?? "(none)"} | shouldBePrimary: ${s.shouldBePrimary}`
    );
  }

  // ── write mode ───────────────────────────────────────────────────────────

  if (!write) {
    console.log("\nDone (dry run). Use --write to persist.");
    return;
  }

  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    const steps = chunk.map((u) => db.tx.trailHeads[u.headId].update({ isPrimary: u.isPrimary }));
    try {
      await db.transact(steps);
      written += chunk.length;
    } catch (err) {
      console.error("Write error:", err);
      if (err?.body) console.error("API body:", JSON.stringify(err.body, null, 2));
      process.exit(1);
    }
    const done = Math.min(i + BATCH, updates.length);
    console.log(`  Updated ${done}/${updates.length} trailHeads...`);
  }

  console.log("\n=== WRITE SUMMARY ===");
  console.log("written:", written);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  if (err?.body) console.error("API body:", JSON.stringify(err.body, null, 2));
  process.exit(1);
});
