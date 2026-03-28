#!/usr/bin/env npx tsx
/**
 * Seed official dog policy fields onto Farmington, NM trailSystems.
 * DRY RUN by default — no DB writes until --commit is passed.
 * Usage: npx tsx scripts/policy/seed-policy-farmington.ts [--commit]
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
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
    if (next !== undefined && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const cityFilter = "Farmington";
const stateFilter = "NM";
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

type Policy = {
  dogsAllowed: string; leashPolicy: string; leashDetails: string;
  policySourceUrl: string; policySourceTitle: string;
  policyConfidence: number; policyMethod: string; policyNotes: string;
};

const DEFAULT_POLICY: Policy = {
  dogsAllowed: "allowed",
  leashPolicy: "required",
  leashDetails: "Dogs must be on leash in Farmington city parks and along the Animas River Trail. Farmington City Code §6-3-2.",
  policySourceUrl: "https://www.fmtn.org/155/Parks-Recreation",
  policySourceTitle: "Parks and Recreation | City of Farmington",
  policyConfidence: 0.75,
  policyMethod: "manual_seed",
  policyNotes: "Farmington City Code §6-3-2 requires leash at all times in city parks and trails.",
};

async function main(): Promise<void> {
  console.log("=== seed-policy-farmington ===");
  console.log("appId:  ", appId);
  console.log("token:  ", maskToken(adminToken));
  console.log("city:   ", cityFilter);
  console.log("state:  ", stateFilter);
  console.log("mode:   ", isCommit ? "COMMIT — will write to DB" : "DRY RUN (pass --commit to write)");
  console.log("==============================\n");

  const systemsRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = (systemsRes?.trailSystems ?? []) as Record<string, unknown>[];
  systems = systems.filter((s) => s.city === cityFilter);
  if (stateFilter) systems = systems.filter((s) => s.state === stateFilter);
  console.log(`Found ${systems.length} ${cityFilter} trailSystems.\n`);

  const nowIso = new Date().toISOString();
  let updates = 0, noChange = 0;
  const toWrite: Array<{ id: string; slug: string; policy: Policy }> = [];

  for (const system of systems) {
    const slug = String(system.slug ?? "(no slug)");
    const id = String(system.id ?? "");
    const policy = DEFAULT_POLICY;
    const alreadySet = system.dogsAllowed === policy.dogsAllowed && system.leashPolicy === policy.leashPolicy && system.policyConfidence === policy.policyConfidence && system.policySourceUrl === policy.policySourceUrl;
    if (alreadySet) { noChange++; continue; }
    console.log(`  WOULD_UPDATE  [DEFAULT]  ${slug}`);
    updates++;
    if (id) toWrite.push({ id, slug, policy });
  }

  console.log(`\nSUMMARY`);
  console.log(`  total      : ${systems.length}`);
  console.log(`  to update  : ${updates}`);
  console.log(`  no change  : ${noChange}`);
  console.log(`  mode       : ${isCommit ? "COMMIT" : "DRY RUN — pass --commit to write"}`);

  if (!isCommit) { if (toWrite.length > 0) console.log(`\n(Pass --commit to write ${toWrite.length} update(s) to InstantDB.)`); return; }
  if (toWrite.length === 0) { console.log("\nNothing to commit."); return; }

  console.log(`\nWriting ${toWrite.length} update(s)...`);
  for (const { id, slug, policy } of toWrite) {
    await db.transact([(db.tx as any).trailSystems[id].update({ dogsAllowed: policy.dogsAllowed, leashPolicy: policy.leashPolicy, leashDetails: policy.leashDetails, policySourceUrl: policy.policySourceUrl, policySourceTitle: policy.policySourceTitle, policyConfidence: policy.policyConfidence, policyMethod: policy.policyMethod, policyNotes: policy.policyNotes, policyVerifiedAt: nowIso })]);
    console.log(`  wrote ${slug}`);
  }
  console.log("\nDone.");
}

main().catch((err) => { console.error(err); process.exit(1); });
