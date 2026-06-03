/**
 * Read-only analysis: how many trails/cities remain indexable under various
 * threshold combinations. Mirrors countTrailSignals() in src/lib/seo/indexation.ts.
 * Usage: npx tsx scripts/dev/analyze-indexability.ts
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { init } from "@instantdb/admin";

const ROOT = "/Users/michalpekarcik/barkTrails";
function loadEnv() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq < 0) continue;
    const k = t.slice(0, eq).trim(); let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv();

const db = init({ appId: process.env.INSTANT_APP_ID!, adminToken: process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN! });

const hasText = (v: any) => typeof v === "string" && v.trim().length > 0;
const hasNum = (v: any) => typeof v === "number" && Number.isFinite(v);

function countSignals(s: any): number {
  let c = 0;
  if (hasText(s.dogsAllowed)) c++;
  if (hasText(s.leashPolicy)) c++;
  if (hasNum(s.shadeProxyPercent)) c++;
  if (hasNum(s.waterNearPercent) || typeof s.swimLikely === "boolean") c++;
  if (s.surfaceSummary && hasText(s.surfaceSummary.dominant)) c++;
  if (hasNum(s.elevationGainFt)) c++;
  if (hasNum(s.parkingCount)) c++;
  if (Array.isArray(s.trailheadPOIs) && s.trailheadPOIs.length > 0) c++;
  if (Array.isArray(s.highlights) && s.highlights.length > 0) c++;
  if (Array.isArray(s.faqs) && s.faqs.length > 0) c++;
  return c;
}

async function main() {
  const res = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const systems = ((res as any)?.trailSystems ?? []) as any[];
  console.log(`\nTotal trailSystems in DB: ${systems.length}\n`);

  // Length distribution
  const lenBuckets: Record<string, number> = { "<1": 0, "1-1.5": 0, "1.5-2": 0, "2-3": 0, "3-5": 0, "5+": 0 };
  for (const s of systems) {
    const l = hasNum(s.lengthMilesTotal) ? s.lengthMilesTotal : 0;
    if (l < 1) lenBuckets["<1"]++;
    else if (l < 1.5) lenBuckets["1-1.5"]++;
    else if (l < 2) lenBuckets["1.5-2"]++;
    else if (l < 3) lenBuckets["2-3"]++;
    else if (l < 5) lenBuckets["3-5"]++;
    else lenBuckets["5+"]++;
  }
  console.log("Length distribution (miles):");
  for (const [k, v] of Object.entries(lenBuckets)) console.log(`  ${k.padEnd(8)} ${v}`);

  // Signal distribution
  const sigDist: Record<number, number> = {};
  for (const s of systems) { const c = countSignals(s); sigDist[c] = (sigDist[c] ?? 0) + 1; }
  console.log("\nSignal-count distribution (0-10):");
  for (let i = 0; i <= 10; i++) if (sigDist[i]) console.log(`  ${i} signals: ${sigDist[i]}`);

  // Threshold grid: indexable trail count
  console.log("\nIndexable TRAIL count by (minLength x minSignals):");
  const lens = [1, 1.5, 2, 3];
  const sigs = [2, 3, 4, 5];
  console.log(`  ${"len\\sig".padEnd(8)} ${sigs.map((x) => String(x).padStart(6)).join("")}`);
  for (const len of lens) {
    const row = sigs.map((sig) => {
      const n = systems.filter((s) => hasNum(s.lengthMilesTotal) && s.lengthMilesTotal >= len && countSignals(s) >= sig).length;
      return String(n).padStart(6);
    });
    console.log(`  ${String(len).padEnd(8)} ${row.join("")}`);
  }

  // City counts: how many cities have >= N qualifying trails (at len>=1.5, sig>=3 as example)
  console.log("\nIndexable CITY count by minCityTrails (using len>=1.5, sig>=3 qualifying trails):");
  const cityMap = new Map<string, number>();
  for (const s of systems) {
    if (!(hasNum(s.lengthMilesTotal) && s.lengthMilesTotal >= 1.5 && countSignals(s) >= 3)) continue;
    const key = `${s.state}::${s.city}`;
    cityMap.set(key, (cityMap.get(key) ?? 0) + 1);
  }
  for (const minCity of [2, 3, 5]) {
    const n = [...cityMap.values()].filter((v) => v >= minCity).length;
    console.log(`  minCityTrails=${minCity}: ${n} cities`);
  }
  console.log(`  (total distinct cities with >=1 qualifying trail: ${cityMap.size})\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
