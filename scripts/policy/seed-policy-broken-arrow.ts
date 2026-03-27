#!/usr/bin/env npx tsx
/**
 * Seed official dog policy fields onto Broken Arrow, OK trailSystems.
 * Applies a blanket policy to all city-park trails:
 *   dogsAllowed: "allowed", leashPolicy: "required", policyConfidence: 0.85
 *
 * City of Broken Arrow Park Rules require dogs on leash in all city parks and trails.
 * Off-leash only in designated off-leash areas.
 *
 * DRY RUN by default — no DB writes until --commit is passed.
 *
 * Usage:
 *   npx tsx scripts/policy/seed-policy-broken-arrow.ts \
 *     --city "Broken Arrow" --state OK \
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
const cityFilter = typeof args.city === "string" ? args.city : "Broken Arrow";
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

const BROKEN_ARROW_POLICY = {
  dogsAllowed: "allowed" as const,
  leashPolicy: "required" as const,
  leashDetails: "Dogs must be on a leash in all Broken Arrow city parks and trails including Fry Creek Trail and Riverwalk Trail. Off-leash only in designated dog park areas.",
  policySourceUrl: "https://www.brokenarrowok.gov/departments/parks-recreation",
  policySourceTitle: "Parks & Recreation | City of Broken Arrow, OK",
  policyConfidence: 0.85,
  policyMethod: "manual_seed" as const,
  policyNotes: "City of Broken Arrow Park Rules require dogs on leash in all city parks and trails. Off-leash permitted only in designated off-leash areas.",
};

const RESTRICTED_SLUGS = new Set<string>([]);

async function main(): Promise<void> {
  console.log("=== seed-policy-broken-arrow ===");
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

  console.log(`Found ${systems.length} Broken Arrow trailSystems.\n`);

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
      system.dogsAllowed === BROKEN_ARROW_POLICY.dogsAllowed &&
      system.leashPolicy === BROKEN_ARROW_POLICY.leashPolicy &&
      system.policyConfidence === BROKEN_ARROW_POLICY.policyConfidence &&
      system.policySourceUrl === BROKEN_ARROW_POLICY.policySourceUrl;

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
    dogsAllowed: BROKEN_ARROW_POLICY.dogsAllowed,
    leashPolicy: BROKEN_ARROW_POLICY.leashPolicy,
    leashDetails: BROKEN_ARROW_POLICY.leashDetails,
    policySourceUrl: BROKEN_ARROW_POLICY.policySourceUrl,
    policySourceTitle: BROKEN_ARROW_POLICY.policySourceTitle,
    policyConfidence: BROKEN_ARROW_POLICY.policyConfidence,
    policyMethod: BROKEN_ARROW_POLICY.policyMethod,
    policyNotes: BROKEN_ARROW_POLICY.policyNotes,
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
