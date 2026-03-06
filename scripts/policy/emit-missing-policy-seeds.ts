#!/usr/bin/env npx tsx
/**
 * Emit copy-pastable POLICY_SEEDS stub entries for trail systems
 * that have no entry in policy-seeds.ts yet.
 *
 * Usage:
 *   npx tsx scripts/policy/emit-missing-policy-seeds.ts \
 *     --city "Austin" --state "TX" \
 *     [--dataset "austin_socrata_jdwm-wfps"] \
 *     [--limit N]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { POLICY_SEEDS } from "./policy-seeds.js";

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

if (!cityFilter) {
  console.error("Error: --city is required");
  process.exit(1);
}

// ── INSTANTDB INIT ────────────────────────────────────────────────────────────

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

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.error("=== emit-missing-policy-seeds ===");
  console.error("appId:   ", appId);
  console.error("token:   ", maskToken(adminToken));
  console.error("city:    ", cityFilter);
  console.error("state:   ", stateFilter ?? "(any)");
  console.error("dataset: ", datasetFilter ?? "(any)");
  console.error("limit:   ", limitArg ?? "(none)");
  console.error("=================================\n");

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
  if (limitArg && limitArg > 0) {
    systems = systems.slice(0, limitArg);
  }

  // Collect missing slugs (not in POLICY_SEEDS by slug or extSystemRef)
  type MissingEntry = { slug: string; name: string };
  const missing: MissingEntry[] = [];

  for (const rawSystem of systems) {
    const system = rawSystem as Record<string, unknown>;
    const slug = String(system.slug ?? "");
    const extRef = String(system.extSystemRef ?? "");

    if (!slug) continue;
    if (POLICY_SEEDS[slug] || POLICY_SEEDS[extRef]) continue;

    missing.push({ slug, name: String(system.name ?? slug) });
  }

  // Stable sort by slug
  missing.sort((a, b) => a.slug.localeCompare(b.slug));

  console.error(`Found ${systems.length} systems, ${missing.length} missing from POLICY_SEEDS.\n`);

  if (missing.length === 0) {
    console.error("Nothing to emit — all systems are already in POLICY_SEEDS.");
    return;
  }

  // ── SECTION 1: sorted slug list ─────────────────────────────────────────────

  console.error("── Missing slugs ───────────────────────────────────────────");
  for (const { slug } of missing) {
    console.error(" ", slug);
  }
  console.error("");

  // ── SECTION 2: paste-ready TypeScript stubs (stdout) ────────────────────────
  // Diagnostic output goes to stderr; the pasteable block goes to stdout so it
  // can be redirected cleanly: `... 2>/dev/null > stubs.ts`

  const lines: string[] = [];
  for (const { slug, name } of missing) {
    lines.push(`  // ${name}`);
    lines.push(`  "${slug}": {`);
    lines.push(`    dogsAllowed: "unknown",`);
    lines.push(`    leashPolicy: "unknown",`);
    lines.push(`    policyConfidence: 0.2,`);
    lines.push(`    policyMethod: "manual_seed",`);
    lines.push(`    policyNotes: "TODO: add official policy source URL + values.",`);
    lines.push(`  },`);
  }

  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
