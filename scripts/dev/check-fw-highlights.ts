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

  const nullHighlights = qualifying.filter((s) => s.highlights == null);
  const emptyHighlights = qualifying.filter((s) => Array.isArray(s.highlights) && s.highlights.length === 0);
  const withHighlights = qualifying.filter((s) => Array.isArray(s.highlights) && s.highlights.length > 0);

  console.log("highlights == null (enrichment not run):", nullHighlights.length);
  console.log("highlights == [] (enrichment ran, no POIs):", emptyHighlights.length);
  console.log("highlights with data:", withHighlights.length);

  if (nullHighlights.length > 0) {
    console.log("\nSlugs missing highlights enrichment (first 10):");
    nullHighlights.slice(0, 10).forEach((s) => console.log(" -", s.slug));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
