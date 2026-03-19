import { init } from "@instantdb/admin";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const db = init({
  appId: process.env.INSTANT_APP_ID as string,
  adminToken: process.env.INSTANT_ADMIN_TOKEN as string,
});

async function main() {
  const r = await db.query({ trailSystems: { $: { where: { city: "Fort Worth" } } } });
  const systems = r.trailSystems as any[];
  const qualifying = systems.filter((s) => (s.lengthMilesTotal ?? 0) >= 1.0);

  const nullWater = qualifying.filter((s) => s.waterProfile == null);
  const emptyWater = qualifying.filter((s) => Array.isArray(s.waterProfile) && s.waterProfile.length === 0);
  const withWater = qualifying.filter((s) => Array.isArray(s.waterProfile) && s.waterProfile.length > 0);

  console.log("waterProfile == null (not stored):", nullWater.length);
  console.log("waterProfile == [] (stored, all dry):", emptyWater.length);
  console.log("waterProfile with data:", withWater.length);

  if (nullWater.length > 0) {
    console.log("\nSlugs missing waterProfile (first 10):");
    nullWater.slice(0, 10).forEach((s) => console.log(" -", s.slug, s.lengthMilesTotal?.toFixed(1) + "mi"));
  }

  const nullHighlightPts = qualifying.filter((s) => s.highlightPoints == null);
  const emptyHighlightPts = qualifying.filter((s) => Array.isArray(s.highlightPoints) && s.highlightPoints.length === 0);
  const withHighlightPts = qualifying.filter((s) => Array.isArray(s.highlightPoints) && s.highlightPoints.length > 0);
  console.log("\nhighlightPoints == null (not stored):", nullHighlightPts.length);
  console.log("highlightPoints == [] (stored, none):", emptyHighlightPts.length);
  console.log("highlightPoints with data:", withHighlightPts.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
