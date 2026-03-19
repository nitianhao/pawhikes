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

const db = init({ appId: process.env.INSTANT_APP_ID, adminToken: process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANT_APP_ADMIN_TOKEN });
const r = await db.query({ trailSystems: { $: { limit: 5000 } } });
const all = r.trailSystems || [];
const phoenix = all.filter(s => s.city === "Phoenix");
const long = phoenix.filter(s => (s.lengthMilesTotal ?? 0) >= 1);
const fields = [
  ["elevationMinFt",          "elevation"],
  ["structureLastComputedAt", "route_structure"],
  ["hazardsLastComputedAt",   "hazards"],
  ["accessRulesLastComputedAt","access_rules"],
  ["surfaceLastComputedAt",   "surface"],
  ["crowdLastComputedAt",     "crowd"],
  ["shadeLastComputedAt",     "shade"],
  ["logisticsLastComputedAt", "logistics"],
  ["highlightsLastComputedAt","highlights"],
];
console.log(`Total Phoenix systems: ${phoenix.length}`);
console.log(`Phoenix systems >= 1 mile: ${long.length}`);
console.log("");
for (const [field, label] of fields) {
  const done = long.filter(s => s[field] != null).length;
  const status = done === long.length ? "DONE" : done === 0 ? "not started" : "partial/running";
  console.log(`${label.padEnd(22)}: ${String(done).padStart(3)}/${long.length}  ${status}`);
}
