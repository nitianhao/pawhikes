#!/usr/bin/env npx tsx
/**
 * Seed official dog policy fields onto Phoenix, AZ trailSystems.
 * Uses per-system policies for named parks; all other Phoenix systems
 * receive PHOENIX_DEFAULT_POLICY.
 *
 * Notable exceptions:
 *   San Tan Mountain Regional Park: dogs NOT allowed (Maricopa County desert preserve)
 *   Camelback Mountain: leash required with seasonal hours
 *
 * DRY RUN by default — no DB writes until --commit is passed.
 *
 * Usage:
 *   npx tsx scripts/policy/seed-policy-phoenix.ts \
 *     --city Phoenix --state AZ \
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
const cityFilter = typeof args.city === "string" ? args.city : "Phoenix";
const stateFilter = typeof args.state === "string" ? args.state : "AZ";
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
  dogsAllowed: string;
  leashPolicy: string;
  leashDetails: string;
  policySourceUrl: string;
  policySourceTitle: string;
  policyConfidence: number;
  policyMethod: string;
  policyNotes: string;
};

const SYSTEM_POLICIES = new Map<string, Policy>([
  ["camelback-mountain-echo-canyon-trail", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must be on leash at all times. Hours: Nov–Apr 5am–7pm, May–Oct 5am–9pm.",
    policySourceUrl: "https://www.phoenix.gov/parks/trails/preserves/camelback",
    policySourceTitle: "Camelback Mountain | Phoenix Parks and Recreation",
    policyConfidence: 0.90,
    policyMethod: "manual_seed",
    policyNotes: "Phoenix Mountain Preserve — leash required per Phoenix City Code §23-18. Seasonal hours apply.",
  }],
  ["camelback-mountain-cholla-trail", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must be on leash at all times. Hours: Nov–Apr 5am–7pm, May–Oct 5am–9pm.",
    policySourceUrl: "https://www.phoenix.gov/parks/trails/preserves/camelback",
    policySourceTitle: "Camelback Mountain | Phoenix Parks and Recreation",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "Cholla Trail (Scottsdale side, Phoenix-managed). Leash required.",
  }],
  ["south-mountain-park-trails", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must be on leash at all times in all South Mountain Park trails.",
    policySourceUrl: "https://www.phoenix.gov/parks/trails/preserves/south-mountain",
    policySourceTitle: "South Mountain Park | Phoenix Parks and Recreation",
    policyConfidence: 0.90,
    policyMethod: "manual_seed",
    policyNotes: "Phoenix Mountain Preserve — leash required per Phoenix City Code §23-18.",
  }],
  ["piestewa-peak-trail", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must be on leash at all times.",
    policySourceUrl: "https://www.phoenix.gov/parks/trails/preserves/piestewa-peak",
    policySourceTitle: "Piestewa Peak | Phoenix Parks and Recreation",
    policyConfidence: 0.90,
    policyMethod: "manual_seed",
    policyNotes: "Phoenix Mountain Preserve — leash required per Phoenix City Code §23-18.",
  }],
  ["north-mountain-trail", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must be on leash at all times.",
    policySourceUrl: "https://www.phoenix.gov/parks/trails/preserves/north-mountain",
    policySourceTitle: "North Mountain Recreation Area | Phoenix Parks and Recreation",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "Phoenix Mountain Preserve — leash required.",
  }],
  ["papago-park-trail", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs on leash required in all Phoenix-managed Papago Park areas.",
    policySourceUrl: "https://www.phoenix.gov/parks/trails",
    policySourceTitle: "Phoenix Parks — Trail Rules",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Papago Park spans Phoenix/Scottsdale/Tempe boundaries. Policy applies to Phoenix-managed portions only.",
  }],
  ["shaw-butte-trail", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must be on leash at all times.",
    policySourceUrl: "https://www.phoenix.gov/parks/trails",
    policySourceTitle: "Phoenix Parks — Trail Rules",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Phoenix Mountain Preserve — leash required.",
  }],
  ["dreamy-draw-trail", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs must be on leash at all times.",
    policySourceUrl: "https://www.phoenix.gov/parks/trails",
    policySourceTitle: "Phoenix Parks — Trail Rules",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Dreamy Draw Recreation Area — leash required.",
  }],
  ["indian-bend-wash-greenbelt", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs on leash required. Managed by City of Scottsdale.",
    policySourceUrl: "https://www.scottsdaleaz.gov/parks/indian-bend-wash",
    policySourceTitle: "Indian Bend Wash Greenbelt | City of Scottsdale",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
    policyNotes: "Scottsdale-managed greenway. Leash required per Scottsdale City Code.",
  }],
  ["white-tank-mountain-regional-park", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs allowed on leash (max 6 feet) on all trails. Entry fee applies.",
    policySourceUrl: "https://www.maricopa.gov/facilities/facility/details/White-Tank-Mountain-Regional-Park-76",
    policySourceTitle: "White Tank Mountain Regional Park | Maricopa County Parks",
    policyConfidence: 0.90,
    policyMethod: "manual_seed",
    policyNotes: "Maricopa County Regional Park. 6-ft leash rule.",
  }],
  ["estrella-mountain-regional-park", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs allowed on leash on most trails (max 6 feet). Some sensitive desert preserve areas may have restrictions.",
    policySourceUrl: "https://www.maricopa.gov/facilities/facility/details/Estrella-Mountain-Regional-Park-35",
    policySourceTitle: "Estrella Mountain Regional Park | Maricopa County Parks",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Maricopa County Regional Park. Entry fee applies.",
  }],
  ["san-tan-mountain-regional-park", {
    dogsAllowed: "not_allowed",
    leashPolicy: "not_applicable",
    leashDetails: "Dogs are NOT permitted on any trails at San Tan Mountain Regional Park.",
    policySourceUrl: "https://www.maricopa.gov/facilities/facility/details/San-Tan-Mountain-Regional-Park-62",
    policySourceTitle: "San Tan Mountain Regional Park | Maricopa County Parks",
    policyConfidence: 0.95,
    policyMethod: "manual_seed",
    policyNotes: "NO DOGS. Maricopa County desert preserve rules prohibit dogs at San Tan Mountain Regional Park.",
  }],
  ["lake-pleasant-regional-park", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs allowed on leash in designated trail areas. Check posted signage at trailhead for current rules.",
    policySourceUrl: "https://www.maricopa.gov/facilities/facility/details/Lake-Pleasant-Regional-Park-46",
    policySourceTitle: "Lake Pleasant Regional Park | Maricopa County Parks",
    policyConfidence: 0.80,
    policyMethod: "manual_seed",
    policyNotes: "Maricopa County Regional Park. Dogs permitted in some areas only.",
  }],
  ["mcdowell-sonoran-preserve", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs allowed on leash on most trails. Keep dogs on maintained trails only.",
    policySourceUrl: "https://www.scottsdaleaz.gov/preserves/mcdowell-sonoran-preserve",
    policySourceTitle: "McDowell Sonoran Preserve | City of Scottsdale",
    policyConfidence: 0.85,
    policyMethod: "manual_seed",
    policyNotes: "Scottsdale-managed. Leash required. Dogs must stay on trail.",
  }],
  ["usery-mountain-regional-park", {
    dogsAllowed: "allowed",
    leashPolicy: "required",
    leashDetails: "Dogs allowed on leash (max 6 feet) on all trails. Entry fee applies.",
    policySourceUrl: "https://www.maricopa.gov/facilities/facility/details/Usery-Mountain-Regional-Park-75",
    policySourceTitle: "Usery Mountain Regional Park | Maricopa County Parks",
    policyConfidence: 0.88,
    policyMethod: "manual_seed",
    policyNotes: "Maricopa County Regional Park. 6-ft leash rule.",
  }],
]);

const PHOENIX_DEFAULT_POLICY: Policy = {
  dogsAllowed: "allowed",
  leashPolicy: "required",
  leashDetails: "Dogs must be on a leash in all Phoenix city parks. Phoenix City Code §23-18.",
  policySourceUrl: "https://www.phoenix.gov/parks/trails",
  policySourceTitle: "Trail Rules | Phoenix Parks and Recreation",
  policyConfidence: 0.80,
  policyMethod: "manual_seed",
  policyNotes: "Blanket Phoenix city park leash policy. City Code §23-18 requires leash at all times.",
};

async function main(): Promise<void> {
  console.log("=== seed-policy-phoenix ===");
  console.log("appId:  ", appId);
  console.log("token:  ", maskToken(adminToken));
  console.log("city:   ", cityFilter);
  console.log("state:  ", stateFilter);
  console.log("mode:   ", isCommit ? "COMMIT — will write to DB" : "DRY RUN (pass --commit to write)");
  console.log("==========================\n");

  const systemsRes = await db.query({ trailSystems: { $: { limit: 1000 } } });
  let systems = (systemsRes?.trailSystems ?? []) as Record<string, unknown>[];

  systems = systems.filter((s) => s.city === cityFilter);
  if (stateFilter) systems = systems.filter((s) => s.state === stateFilter);

  console.log(`Found ${systems.length} Phoenix trailSystems.\n`);

  const nowIso = new Date().toISOString();
  let updates = 0;
  let noChange = 0;

  const toWrite: Array<{ id: string; slug: string; policy: Policy }> = [];

  for (const system of systems) {
    const slug = String(system.slug ?? "(no slug)");
    const id = String(system.id ?? "");

    const specificPolicy = SYSTEM_POLICIES.get(slug);
    const policy = specificPolicy ?? PHOENIX_DEFAULT_POLICY;
    const policyLabel = specificPolicy ? "SPECIFIC" : "DEFAULT";

    const alreadySet =
      system.dogsAllowed === policy.dogsAllowed &&
      system.leashPolicy === policy.leashPolicy &&
      system.policyConfidence === policy.policyConfidence &&
      system.policySourceUrl === policy.policySourceUrl;

    if (alreadySet) {
      noChange++;
      continue;
    }

    console.log(`  WOULD_UPDATE  [${policyLabel}]  ${slug}`);
    updates++;
    if (id) toWrite.push({ id, slug, policy });
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

  console.log(`\nWriting ${toWrite.length} update(s)...`);
  for (const { id, slug, policy } of toWrite) {
    const payload: Record<string, unknown> = {
      dogsAllowed: policy.dogsAllowed,
      leashPolicy: policy.leashPolicy,
      leashDetails: policy.leashDetails,
      policySourceUrl: policy.policySourceUrl,
      policySourceTitle: policy.policySourceTitle,
      policyConfidence: policy.policyConfidence,
      policyMethod: policy.policyMethod,
      policyNotes: policy.policyNotes,
      policyVerifiedAt: nowIso,
    };
    await db.transact([(db.tx as any).trailSystems[id].update(payload)]);
    console.log(`  wrote ${slug}`);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
