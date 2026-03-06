#!/usr/bin/env npx tsx
/**
 * Seed official dog policy fields onto trailSystems.
 * DRY RUN by default — no DB writes until --commit is passed.
 *
 * Usage:
 *   npx tsx scripts/policy/seed-policy-austin.ts \
 *     --city "Austin" --state "TX" \
 *     [--dataset "austin_socrata_jdwm-wfps"] \
 *     [--limit 10] \
 *     [--onlySlugs "slug-a,slug-b"] \
 *     [--skipSlugs "slug-c,slug-d"] \
 *     [--minConfidence 0.7] \
 *     [--allowUnknown] \
 *     [--commit]           <-- actually write to DB (default: dry run)
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { POLICY_SEEDS, POLICY_SEED_SKIP_SLUGS, type PolicySeed } from "./policy-seeds.js";
import { validatePolicySeed } from "./validate-policy-seed.js";

// ── ENV LOADING ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");

function loadEnvLocal(rootDir: string): void {
  const envPath = join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvLocal(ROOT);

// ── ARG PARSING ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const cityFilter = typeof args.city === "string" ? args.city : undefined;
const stateFilter = typeof args.state === "string" ? args.state : undefined;
const datasetFilter = typeof args.dataset === "string" ? args.dataset : undefined;
const limitArg = typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
const isCommit = args.commit === true;
const allowUnknown = args.allowUnknown === true;
const minConfidence = typeof args.minConfidence === "string"
  ? parseFloat(args.minConfidence)
  : 0.7;

const onlySlugs: Set<string> | null =
  typeof args.onlySlugs === "string"
    ? new Set(args.onlySlugs.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

const extraSkipSlugs: Set<string> =
  typeof args.skipSlugs === "string"
    ? new Set(args.skipSlugs.split(",").map((s) => s.trim()).filter(Boolean))
    : new Set();

const effectiveSkipSlugs = new Set([...POLICY_SEED_SKIP_SLUGS, ...extraSkipSlugs]);

if (!cityFilter) {
  console.error("Error: --city is required");
  process.exit(1);
}

// ── INSTANTDB INIT ─────────────────────────────────────────────────────────────

const appId = process.env.INSTANT_APP_ID;
const adminToken =
  process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

if (!appId) {
  console.error("Error: INSTANT_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!adminToken) {
  console.error("Error: INSTANT_APP_ADMIN_TOKEN or INSTANT_ADMIN_TOKEN must be set in .env.local");
  process.exit(1);
}

function maskToken(t: string | undefined): string {
  if (!t || t.length < 10) return t ? "***" : "(none)";
  return t.slice(0, 6) + "..." + t.slice(-4);
}

const db = init({ appId, adminToken });

// ── TYPES ─────────────────────────────────────────────────────────────────────

type ActionType =
  | "WOULD_UPDATE"
  | "SKIP_NO_CHANGE"
  | "SKIP_SLUG"
  | "NO_MAPPING"
  | "INVALID"
  | "LOW_CONFIDENCE_SKIP";

interface ReportRow {
  slug: string;
  name: string;
  dogsAllowed: string;
  leashPolicy: string;
  confidence: string;
  sourceUrl: string;
  action: ActionType;
  issues: string;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

const DEFAULT_SEED: PolicySeed = {
  dogsAllowed: "unknown",
  leashPolicy: "unknown",
  policyConfidence: 0,
  policyMethod: "manual_seed",
  policyNotes: "No mapping found in POLICY_SEEDS.",
};

function resolveSeed(system: Record<string, unknown>): {
  seed: PolicySeed;
  found: boolean;
} {
  const slug = String(system.slug ?? "");
  const extRef = String(system.extSystemRef ?? "");
  if (slug && POLICY_SEEDS[slug]) return { seed: POLICY_SEEDS[slug], found: true };
  if (extRef && POLICY_SEEDS[extRef]) return { seed: POLICY_SEEDS[extRef], found: true };
  return { seed: DEFAULT_SEED, found: false };
}

function hasChanged(system: Record<string, unknown>, seed: PolicySeed): boolean {
  return (
    system.dogsAllowed !== seed.dogsAllowed ||
    system.leashPolicy !== seed.leashPolicy ||
    system.leashDetails !== (seed.leashDetails ?? null) ||
    system.policySourceUrl !== (seed.policySourceUrl ?? null) ||
    system.policySourceTitle !== (seed.policySourceTitle ?? null) ||
    system.policyConfidence !== seed.policyConfidence ||
    system.policyMethod !== seed.policyMethod ||
    system.policyNotes !== (seed.policyNotes ?? null)
  );
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== seed-policy-austin ===");
  console.log("appId:         ", appId);
  console.log("token:         ", maskToken(adminToken));
  console.log("city:          ", cityFilter);
  console.log("state:         ", stateFilter ?? "(any)");
  console.log("dataset:       ", datasetFilter ?? "(any)");
  console.log("limit:         ", limitArg ?? "(none)");
  console.log("onlySlugs:     ", onlySlugs ? [...onlySlugs].join(",") : "(all)");
  console.log("skipSlugs:     ", [...effectiveSkipSlugs].join(",") || "(none)");
  console.log("minConfidence: ", minConfidence);
  console.log("allowUnknown:  ", allowUnknown);
  console.log("mode:          ", isCommit ? "COMMIT — will write to DB" : "DRY RUN (pass --commit to write)");
  console.log("seeds:         ", Object.keys(POLICY_SEEDS).length, "entries in POLICY_SEEDS");
  console.log("==========================\n");

  // ── QUERY ────────────────────────────────────────────────────────────────────

  const systemsRes = await db.query({
    trailSystems: { $: { limit: 1000 } },
  });

  let systems = systemsRes?.trailSystems ?? [];

  if (cityFilter) {
    systems = systems.filter((s) => (s as Record<string, unknown>).city === cityFilter);
  }
  if (stateFilter) {
    systems = systems.filter((s) => (s as Record<string, unknown>).state === stateFilter);
  }
  if (datasetFilter) {
    systems = systems.filter((s) => (s as Record<string, unknown>).extDataset === datasetFilter);
  }
  if (onlySlugs) {
    systems = systems.filter((s) => onlySlugs.has(String((s as Record<string, unknown>).slug ?? "")));
  }
  if (limitArg && limitArg > 0) {
    systems = systems.slice(0, limitArg);
  }

  console.log(`Found ${systems.length} trailSystems after filtering.\n`);

  // ── PROCESS ───────────────────────────────────────────────────────────────────

  const report: ReportRow[] = [];
  const toWrite: Array<{ internalId: string; payload: Record<string, unknown>; slug: string }> = [];

  const counts: Record<ActionType, number> = {
    WOULD_UPDATE: 0,
    SKIP_NO_CHANGE: 0,
    SKIP_SLUG: 0,
    NO_MAPPING: 0,
    INVALID: 0,
    LOW_CONFIDENCE_SKIP: 0,
  };

  const nowIso = new Date().toISOString();

  for (const rawSystem of systems) {
    const system = rawSystem as Record<string, unknown>;
    const slug = String(system.slug ?? "(no slug)");
    const name = String(system.name ?? "(no name)");

    // ── Skip list ──────────────────────────────────────────────────────────────
    if (effectiveSkipSlugs.has(slug)) {
      counts.SKIP_SLUG++;
      report.push({ slug, name, dogsAllowed: "-", leashPolicy: "-", confidence: "-", sourceUrl: "-", action: "SKIP_SLUG", issues: "" });
      continue;
    }

    // ── Seed lookup ────────────────────────────────────────────────────────────
    const { seed, found } = resolveSeed(system);

    if (!found) {
      counts.NO_MAPPING++;
      report.push({ slug, name, dogsAllowed: "-", leashPolicy: "-", confidence: "-", sourceUrl: "-", action: "NO_MAPPING", issues: "" });
      continue;
    }

    // ── Validation ─────────────────────────────────────────────────────────────
    const validation = validatePolicySeed(seed, { allowUnknown });

    if (!validation.ok) {
      counts.INVALID++;
      report.push({
        slug, name,
        dogsAllowed: seed.dogsAllowed,
        leashPolicy: seed.leashPolicy,
        confidence: seed.policyConfidence.toFixed(2),
        sourceUrl: seed.policySourceUrl ?? "none",
        action: "INVALID",
        issues: validation.issues.join("; "),
      });
      continue;
    }

    // ── Confidence gate ────────────────────────────────────────────────────────
    if (seed.policyConfidence < minConfidence) {
      counts.LOW_CONFIDENCE_SKIP++;
      report.push({
        slug, name,
        dogsAllowed: seed.dogsAllowed,
        leashPolicy: seed.leashPolicy,
        confidence: seed.policyConfidence.toFixed(2),
        sourceUrl: seed.policySourceUrl ?? "none",
        action: "LOW_CONFIDENCE_SKIP",
        issues: `confidence ${seed.policyConfidence.toFixed(2)} < minConfidence ${minConfidence}`,
      });
      continue;
    }

    // ── Change detection ───────────────────────────────────────────────────────
    if (!hasChanged(system, seed)) {
      counts.SKIP_NO_CHANGE++;
      report.push({
        slug, name,
        dogsAllowed: seed.dogsAllowed,
        leashPolicy: seed.leashPolicy,
        confidence: seed.policyConfidence.toFixed(2),
        sourceUrl: seed.policySourceUrl ?? "none",
        action: "SKIP_NO_CHANGE",
        issues: "",
      });
      continue;
    }

    // ── Will update ────────────────────────────────────────────────────────────
    counts.WOULD_UPDATE++;

    const payload: Record<string, unknown> = {
      dogsAllowed: seed.dogsAllowed,
      leashPolicy: seed.leashPolicy,
      policyConfidence: seed.policyConfidence,
      policyMethod: seed.policyMethod,
      policyVerifiedAt: nowIso,
    };
    if (seed.leashDetails !== undefined) payload.leashDetails = seed.leashDetails;
    if (seed.policySourceUrl !== undefined) payload.policySourceUrl = seed.policySourceUrl;
    if (seed.policySourceTitle !== undefined) payload.policySourceTitle = seed.policySourceTitle;
    if (seed.policyNotes !== undefined) payload.policyNotes = seed.policyNotes;

    const internalId = String(system.id ?? "");
    if (internalId) {
      toWrite.push({ internalId, payload, slug });
    }

    report.push({
      slug, name,
      dogsAllowed: seed.dogsAllowed,
      leashPolicy: seed.leashPolicy,
      confidence: seed.policyConfidence.toFixed(2),
      sourceUrl: seed.policySourceUrl ?? "none",
      action: "WOULD_UPDATE",
      issues: "",
    });
  }

  // ── REPORT TABLE ──────────────────────────────────────────────────────────────

  const COL = { slug: 50, name: 38, dogs: 12, leash: 20, conf: 6, source: 36, action: 20 };

  const header = [
    pad("slug", COL.slug),
    pad("name", COL.name),
    pad("dogsAllowed", COL.dogs),
    pad("leashPolicy", COL.leash),
    pad("conf", COL.conf),
    pad("sourceUrl", COL.source),
    pad("action", COL.action),
  ].join(" | ");

  const divider = "-".repeat(header.length);

  console.log("POLICY SEED REPORT");
  console.log(divider);
  console.log(header);
  console.log(divider);

  for (const row of report) {
    console.log(
      [
        pad(row.slug, COL.slug),
        pad(row.name, COL.name),
        pad(row.dogsAllowed, COL.dogs),
        pad(row.leashPolicy, COL.leash),
        pad(row.confidence, COL.conf),
        pad(row.sourceUrl, COL.source),
        pad(row.action, COL.action),
      ].join(" | ")
    );
    if (row.issues) {
      console.log(`  ^ ${row.issues}`);
    }
  }

  console.log(divider);

  // ── SUMMARY ───────────────────────────────────────────────────────────────────

  console.log("\nSUMMARY");
  console.log(`  totalSystems      : ${systems.length}`);
  console.log(`  WOULD_UPDATE      : ${counts.WOULD_UPDATE}`);
  console.log(`  SKIP_NO_CHANGE    : ${counts.SKIP_NO_CHANGE}`);
  console.log(`  SKIP_SLUG         : ${counts.SKIP_SLUG}`);
  console.log(`  NO_MAPPING        : ${counts.NO_MAPPING}`);
  console.log(`  INVALID           : ${counts.INVALID}`);
  console.log(`  LOW_CONFIDENCE_SKIP: ${counts.LOW_CONFIDENCE_SKIP}`);
  console.log(`  mode              : ${isCommit ? "COMMIT" : "DRY RUN — no writes performed"}`);

  // ── COMMIT SAFETY BANNER + WRITE ─────────────────────────────────────────────

  if (isCommit) {
    if (toWrite.length === 0) {
      console.log("\nNothing to commit — no eligible updates.");
      return;
    }

    console.log("\n╔══════════════════════════════════════════╗");
    console.log("║          COMMIT SAFETY BANNER            ║");
    console.log("╚══════════════════════════════════════════╝");
    console.log(`  Updating ${toWrite.length} trailSystem(s)`);
    console.log(`  minConfidence  : ${minConfidence}`);
    console.log(`  allowUnknown   : ${allowUnknown}`);
    console.log(`  policyVerifiedAt: ${nowIso}`);
    console.log("  Slugs to write:");
    for (const { slug } of toWrite) {
      console.log(`    • ${slug}`);
    }
    console.log("");

    for (const { internalId, payload, slug } of toWrite) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.transact([(db.tx as any).trailSystems[internalId].update(payload)]);
      console.log(`  ✓ wrote ${slug}`);
    }

    console.log("\nDone.");
  } else if (toWrite.length > 0) {
    console.log(`\n(Pass --commit to write ${toWrite.length} update(s) to InstantDB.)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
