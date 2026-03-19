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

  console.log(`Qualifying FW systems (>= 1 mile): ${qualifying.length}`);

  const noElevation = qualifying.filter((s) => !(s.elevationProfile?.length > 0));
  const noHighlights = qualifying.filter((s) => !(s.highlights?.length > 0));
  const noWaterProfile = qualifying.filter((s) => !(s.waterProfile?.length > 0));
  const noAmenity = qualifying.filter((s) => !(s.amenityPoints?.length > 0));

  console.log(`\nMissing elevationProfile: ${noElevation.length}`);
  if (noElevation.length > 0 && noElevation.length <= 10) {
    noElevation.forEach((s) => console.log("  -", s.slug, s.lengthMilesTotal?.toFixed(1) + "mi"));
  }

  console.log(`\nMissing highlights: ${noHighlights.length}`);
  if (noHighlights.length <= 20) {
    noHighlights.slice(0, 20).forEach((s) => console.log("  -", s.slug));
  }

  console.log(`\nMissing waterProfile: ${noWaterProfile.length}`);
  console.log(`Missing amenityPoints: ${noAmenity.length}`);

  // Check a few that have highlights
  const withHighlights = qualifying.filter((s) => s.highlights?.length > 0);
  console.log(`\nWith highlights (${withHighlights.length}):`);
  withHighlights.slice(0, 5).forEach((s) => console.log("  +", s.slug, s.highlights?.length, "highlights"));
}

main().catch((e) => { console.error(e); process.exit(1); });
