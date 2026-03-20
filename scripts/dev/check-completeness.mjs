import { init } from "@instantdb/admin";
import { readFileSync, existsSync } from "fs";

const envPath = "/Users/michalpekarcik/barkTrails/.env.local";
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

const db = init({ appId: process.env.INSTANT_APP_ID, adminToken: process.env.INSTANT_ADMIN_TOKEN });
const r = await db.query({ trailSystems: { $: { limit: 5000 } } });
const all = r.trailSystems ?? [];

const FIELDS = [
  ["elevationMinFt",            "elevation"],
  ["structureLastComputedAt",   "route_structure"],
  ["hazardsLastComputedAt",     "hazards"],
  ["accessRulesLastComputedAt", "access_rules"],
  ["surfaceLastComputedAt",     "surface"],
  ["crowdLastComputedAt",       "crowd"],
  ["shadeLastComputedAt",       "shade"],
  ["logisticsLastComputedAt",   "logistics"],
  ["highlightsLastComputedAt",  "highlights"],
  ["mudRisk",                   "mud"],
  ["nightClass",                "night_winter"],
  ["personalization",           "personalization"],
  ["safety",                    "safety"],
  ["elevationProfile",          "profile:elevation"],
  ["shadeProfile",              "profile:shade"],
  ["surfaceProfile",            "profile:surface"],
  ["waterProfile",              "profile:water"],
  ["amenityPoints",             "profile:amenity"],
  ["highlightPoints",           "profile:highlights"],
  ["dogsAllowed",               "policy"],
  ["faqs",                      "faqs"],
  ["summary",                   "content:summary"],
];

function present(v) {
  if (v == null || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function checkCity(cityName, stateFilter) {
  const systems = all.filter(s => s.city === cityName && (!stateFilter || s.state === stateFilter));
  const long = systems.filter(s => (s.lengthMilesTotal ?? 0) >= 1);
  console.log(`\n=== ${cityName}${stateFilter ? ", " + stateFilter : ""} ===`);
  console.log(`  total: ${systems.length}  |  >= 1 mi: ${long.length}`);
  for (const [field, label] of FIELDS) {
    const done = long.filter(s => present(s[field])).length;
    const total = long.length;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    const status = done === 0 ? "MISSING" : done === total ? "DONE" : `${done}/${total} (${pct}%)`;
    const flag = done === 0 ? " ❌" : done < total ? " ⚠️" : "";
    console.log(`  ${label.padEnd(24)}: ${status}${flag}`);
  }
}

checkCity("Austin",        "TX");
checkCity("Phoenix",       "AZ");
checkCity("Oklahoma City", "OK");
