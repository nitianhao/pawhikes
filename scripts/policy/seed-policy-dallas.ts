#!/usr/bin/env npx tsx
/**
 * Seed official dog policy fields onto Dallas trailSystems.
 * Applies a blanket policy to all city-park trails:
 *   dogsAllowed: "allowed", leashPolicy: "required", policyConfidence: 0.8
 *
 * DRY RUN by default — no DB writes until --commit is passed.
 *
 * Usage:
 *   npx tsx scripts/policy/seed-policy-dallas.ts \
 *     --city "Dallas" --state "TX" \
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
const cityFilter = typeof args.city === "string" ? args.city : "Dallas";
const stateFilter = typeof args.state === "string" ? args.state : "TX";
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

const DALLAS_POLICY = {
  dogsAllowed: "allowed" as const,
  leashPolicy: "required" as const,
  leashDetails: "Dogs allowed on leash in all Dallas city park trails. Leash required at all times.",
  policySourceUrl: "https://www.dallasparks.org/149/Trails",
  policySourceTitle: "Trails | Dallas Park and Recreation",
  policyConfidence: 0.8,
  policyMethod: "manual_seed" as const,
  policyNotes: "Dallas Park and Recreation allows dogs on leash on all city park trails. Source: dallasparks.org/149/Trails. Blanket policy applied to all Dallas city trails via seed-policy-dallas.ts.",
};

async function main(): Promise<void> {
  console.log("=== seed-policy-dallas ===");
  console.log("appId:  ", appId);
  console.log("token:  ", maskToken(adminToken));
  console.log("city:   ", cityFilter);
  console.log("state:  ", stateFilter);
  console.log("mode:   ", isCommit ? "COMMIT — will write to DB" : "DRY RUN (pass --commit to write)");
  console.log("=========================\n");

  const systemsRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = (systemsRes?.trailSystems ?? []) as Record<string, unknown>[];

  systems = systems.filter((s) => s.city === cityFilter);
  if (stateFilter) systems = systems.filter((s) => s.state === stateFilter);

  console.log(`Found ${systems.length} Dallas trailSystems.\n`);

  const nowIso = new Date().toISOString();
  let updates = 0;
  let noChange = 0;

  const toWrite: Array<{ id: string; slug: string }> = [];

  for (const system of systems) {
    const slug = String(system.slug ?? "(no slug)");
    const id = String(system.id ?? "");

    const alreadySet =
      system.dogsAllowed === DALLAS_POLICY.dogsAllowed &&
      system.leashPolicy === DALLAS_POLICY.leashPolicy &&
      system.policyConfidence === DALLAS_POLICY.policyConfidence;

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
    dogsAllowed: DALLAS_POLICY.dogsAllowed,
    leashPolicy: DALLAS_POLICY.leashPolicy,
    leashDetails: DALLAS_POLICY.leashDetails,
    policySourceUrl: DALLAS_POLICY.policySourceUrl,
    policySourceTitle: DALLAS_POLICY.policySourceTitle,
    policyConfidence: DALLAS_POLICY.policyConfidence,
    policyMethod: DALLAS_POLICY.policyMethod,
    policyNotes: DALLAS_POLICY.policyNotes,
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
