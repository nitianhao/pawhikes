#!/usr/bin/env npx tsx
/**
 * Cross-city field completeness audit.
 * Usage: npx tsx scripts/dev/check-completeness.ts
 */
import { init } from "@instantdb/admin";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = join(dirname(__filename), "../..");

const envPath = join(ROOT, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

const db = init({ appId: process.env.INSTANT_APP_ID!, adminToken: process.env.INSTANT_ADMIN_TOKEN! });

const FIELDS: [string, string][] = [
  // Enrichment modules (via enrich-city.ts + standalone scripts)
  ["elevationMinFt",              "elevation"],
  ["structureLastComputedAt",     "route_structure"],
  ["hazardsLastComputedAt",       "hazards"],
  ["accessRulesLastComputedAt",   "access_rules"],
  ["surfaceLastComputedAt",       "surface"],
  ["crowdLastComputedAt",         "crowd"],
  ["shadeLastComputedAt",         "shade"],
  ["logisticsLastComputedAt",     "logistics"],
  ["highlightsLastComputedAt",    "highlights"],
  ["mudRisk",                     "mud"],
  ["nightClass",                  "night_winter"],
  // Backfills
  ["personalization",             "personalization"],
  ["safety",                      "safety"],
  // Profile arrays (store-* scripts)
  ["elevationProfile",            "profile:elevation"],
  ["shadeProfile",                "profile:shade"],
  ["surfaceProfile",              "profile:surface"],
  ["waterProfile",                "profile:water"],
  ["amenityPoints",               "profile:amenity"],
  ["highlightPoints",             "profile:highlights"],
  // Policy
  ["dogsAllowed",                 "policy"],
  // Content
  ["faqs",                        "faqs"],
  ["summary",                     "content:summary"],
];

function isPresent(val: unknown): boolean {
  if (val == null || val === "") return false;
  if (Array.isArray(val) && val.length === 0) return false;
  if (typeof val === "object" && Object.keys(val as object).length === 0) return false;
  return true;
}

function checkCity(cityName: string, stateFilter: string | undefined, all: Record<string, unknown>[]) {
  const systems = all.filter(s =>
    s.city === cityName && (stateFilter ? s.state === stateFilter : true)
  );
  const long = systems.filter(s => (s.lengthMilesTotal as number ?? 0) >= 1);
  console.log(`\n=== ${cityName}${stateFilter ? ", " + stateFilter : ""} ===`);
  console.log(`  total: ${systems.length}  |  >= 1 mi: ${long.length}`);
  for (const [field, label] of FIELDS) {
    const done = long.filter(s => isPresent(s[field])).length;
    const total = long.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const status = done === 0 ? "MISSING" : done === total ? "DONE" : `${done}/${total} (${pct}%)`;
    const flag = done === 0 ? " ❌" : done < total ? " ⚠️" : "";
    console.log(`  ${label.padEnd(24)}: ${status}${flag}`);
  }
}

async function main() {
  const r = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const all = (r.trailSystems ?? []) as Record<string, unknown>[];
  checkCity("Austin",        "TX", all);
  checkCity("Phoenix",       "AZ", all);
  checkCity("Oklahoma City", "OK", all);
  // Austin metro suburbs
  for (const city of ["Round Rock", "Cedar Park", "Georgetown", "Pflugerville", "Leander", "Kyle", "Lakeway"]) {
    checkCity(city, "TX", all);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
