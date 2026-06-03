/**
 * Dry-run preview for buildTrailOverview — NO DB writes.
 * Prints composed overviews for a spread of trails (different cities, water vs
 * dry, shaded vs open, with/without named highlights) so we can judge whether
 * the prose reads genuinely unique before wiring it into the page.
 *
 * Usage:
 *   npx tsx scripts/dev/preview-trail-overview.ts
 *   npx tsx scripts/dev/preview-trail-overview.ts --n 12
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { init } from "@instantdb/admin";
import { buildTrailOverview } from "@/lib/seo/trailOverview";

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

const argN = Number(process.argv[process.argv.indexOf("--n") + 1]);
const N = Number.isFinite(argN) && argN > 0 ? argN : 8;

async function main() {
  const res = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const systems = ((res as any)?.trailSystems ?? []) as any[];

  // Only indexable-length trails, then pick a varied spread by signal mix.
  const eligible = systems.filter((s) => typeof s.lengthMilesTotal === "number" && s.lengthMilesTotal >= 2);
  const hasWater = eligible.filter((s) => Array.isArray(s.waterProfile) && s.waterProfile.some((p: any) => p?.type && p.type !== "dry"));
  const hasHighlights = eligible.filter((s) => Array.isArray(s.highlightPoints) && s.highlightPoints.some((p: any) => p?.name));
  const dry = eligible.filter((s) => !hasWater.includes(s));

  const pick = (pool: any[], k: number) => pool.slice(0, k);
  const sample = Array.from(new Set([
    ...pick(hasHighlights, Math.ceil(N / 2)),
    ...pick(hasWater, Math.ceil(N / 3)),
    ...pick(dry, Math.ceil(N / 3)),
  ])).slice(0, N);

  console.log(`\nEligible (>=2mi): ${eligible.length} | with water: ${hasWater.length} | with named highlights: ${hasHighlights.length}\n`);
  console.log("=".repeat(80));
  let emitted = 0;
  for (const s of sample) {
    const sentences = buildTrailOverview(s);
    console.log(`\n### ${s.name} — ${s.city}, ${s.state}  (${s.lengthMilesTotal} mi)`);
    if (sentences.length === 0) {
      console.log("  [no overview — insufficient distinctive data]");
      continue;
    }
    emitted++;
    console.log("  " + sentences.join(" "));
  }
  console.log("\n" + "=".repeat(80));
  console.log(`Emitted overviews: ${emitted}/${sample.length}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
