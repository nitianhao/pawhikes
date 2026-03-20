#!/usr/bin/env npx tsx
/**
 * Seed official dog policy fields onto Oklahoma City trailSystems.
 * Applies a blanket policy to all city-park trails:
 *   dogsAllowed: "allowed", leashPolicy: "required", policyConfidence: 0.85
 *
 * Oklahoma City Code Title 10 §10-161 requires dogs on leash (max 6 ft) in all
 * city parks. Off-leash only in designated off-leash areas (e.g. dog parks).
 *
 * DRY RUN by default — no DB writes until --commit is passed.
 *
 * Usage:
 *   npx tsx scripts/policy/seed-policy-okc.ts \
 *     --city "Oklahoma City" --state "OK" \
 *     [--commit]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

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
const cityFilter = typeof args.city === "string" ? args.city : "Oklahoma City";
const stateFilter = typeof args.state === "string" ? args.state : "OK";
const isCommit = args.commit === true;

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

if (!appId) { console.error("Error: INSTANT_APP_ID must be set in .env.local"); process.exit(1); }
if (!adminToken) { console.error("Error: INSTANT_APP_ADMIN_TOKEN or INSTANT_ADMIN_TOKEN must be set in .env.local"); process.exit(1); }

function maskToken(t: string | undefined): string {
  if (!t || t.length < 10) return t ? "***" : "(none)";
  return t.slice(0, 6) + "..." + t.slice(-4);
}

const db = init({ appId, adminToken });

const OKC_POLICY = {
  dogsAllowed: "allowed" as const,
  leashPolicy: "required" as const,
  leashDetails: "Dogs must be on a leash (max 6 feet) in all Oklahoma City parks. Owner must hold the leash at all times. Off-leash only in designated dog park areas.",
  policySourceUrl: "https://www.okc.gov/departments/parks-recreation/park-rules",
  policySourceTitle: "Park Rules | Oklahoma City Parks & Recreation",
  policyConfidence: 0.85,
  policyMethod: "manual_seed" as const,
  policyNotes: "Oklahoma City Code Title 10 §10-161 requires dogs on leash (max 6 ft) in all city parks. Off-leash permitted only in designated off-leash areas.",
};

// Trails on federal/restricted land that should NOT receive the blanket city policy.
const RESTRICTED_SLUGS = new Set([
  "tinker-draper-trail",     // passes through/near Tinker Air Force Base — federal land, civilian access restricted
  "southeast-29th-st-trail", // access_rules enrichment found operator=Tinker Air Force Base
]);

async function main(): Promise<void> {
  console.log("=== seed-policy-okc ===");
  console.log("appId:  ", appId);
  console.log("token:  ", maskToken(adminToken));
  console.log("city:   ", cityFilter);
  console.log("state:  ", stateFilter);
  console.log("mode:   ", isCommit ? "COMMIT — will write to DB" : "DRY RUN (pass --commit to write)");
  console.log("======================\n");

  const systemsRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = (systemsRes?.trailSystems ?? []) as Record<string, unknown>[];

  systems = systems.filter((s) => s.city === cityFilter);
  if (stateFilter) systems = systems.filter((s) => s.state === stateFilter);

  console.log(`Found ${systems.length} Oklahoma City trailSystems.\n`);

  const nowIso = new Date().toISOString();
  let updates = 0;
  let noChange = 0;

  const toWrite: Array<{ id: string; slug: string }> = [];

  for (const system of systems) {
    const slug = String(system.slug ?? "(no slug)");
    const id = String(system.id ?? "");

    if (RESTRICTED_SLUGS.has(slug)) {
      console.log(`  SKIP (restricted) ${slug}`);
      noChange++;
      continue;
    }

    const alreadySet =
      system.dogsAllowed === OKC_POLICY.dogsAllowed &&
      system.leashPolicy === OKC_POLICY.leashPolicy &&
      system.policyConfidence === OKC_POLICY.policyConfidence &&
      system.policySourceUrl === OKC_POLICY.policySourceUrl;

    if (alreadySet) {
      noChange++;
      continue;
    }

    console.log(`  WOULD_UPDATE  ${slug}`);
    updates++;
    if (id) toWrite.push({ id, slug });
  }

  console.log(`\nSUMMARY`);
  console.log(`  total      : ${systems.length}`);
  console.log(`  to update  : ${updates}`);
  console.log(`  no change  : ${noChange}`);
  console.log(`  mode       : ${isCommit ? "COMMIT" : "DRY RUN — pass --commit to write"}`);

  if (!isCommit) {
    if (toWrite.length > 0) console.log(`\n(Pass --commit to write ${toWrite.length} update(s) to InstantDB.)`);
    return;
  }

  if (toWrite.length === 0) {
    console.log("\nNothing to commit.");
    return;
  }

  const payload: Record<string, unknown> = {
    dogsAllowed: OKC_POLICY.dogsAllowed,
    leashPolicy: OKC_POLICY.leashPolicy,
    leashDetails: OKC_POLICY.leashDetails,
    policySourceUrl: OKC_POLICY.policySourceUrl,
    policySourceTitle: OKC_POLICY.policySourceTitle,
    policyConfidence: OKC_POLICY.policyConfidence,
    policyMethod: OKC_POLICY.policyMethod,
    policyNotes: OKC_POLICY.policyNotes,
    policyVerifiedAt: nowIso,
  };

  console.log(`\nWriting ${toWrite.length} update(s)...`);
  for (const { id, slug } of toWrite) {
    await db.transact([(db.tx as any).trailSystems[id].update(payload)]);
    console.log(`  wrote ${slug}`);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
