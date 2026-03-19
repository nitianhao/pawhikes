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
  console.log("Total FW systems:", systems.length);

  const qualifying = systems.filter((s) => (s.lengthMilesTotal ?? 0) >= 1.0);
  console.log("Systems >= 1 mile:", qualifying.length);

  const counts = {
    shadeClass: systems.filter((s) => s.shadeClass).length,
    surfaceProfile: systems.filter((s) => s.surfaceProfile?.length > 0).length,
    elevationProfile: systems.filter((s) => s.elevationProfile?.length > 0).length,
    crowdClass: systems.filter((s) => s.crowdClass).length,
    mudRisk: systems.filter((s) => s.mudRisk).length,
    nightClass: systems.filter((s) => s.nightClass).length,
    faqs: systems.filter((s) => s.faqs?.length > 0).length,
    highlights: systems.filter((s) => s.highlights?.length > 0).length,
    personalization: systems.filter((s) => (s.personalization as any)?.seniorSafeScore !== undefined).length,
    hazards: systems.filter((s) => (s.hazards as any)?.roadCrossings !== undefined).length,
    accessRules: systems.filter((s) => (s as any).accessRules).length,
    amenityPoints: systems.filter((s) => s.amenityPoints?.length > 0).length,
    shadeProfile: systems.filter((s) => s.shadeProfile?.length > 0).length,
  };

  for (const [k, v] of Object.entries(counts)) {
    const pct = Math.round((v / systems.length) * 100);
    const status = v === 0 ? "MISSING" : v === systems.length ? "DONE" : "PARTIAL";
    console.log(`${status.padEnd(8)} ${k.padEnd(20)} ${v}/${systems.length} (${pct}%)`);
  }

  // Sample a qualifying trail
  const sample = qualifying[0];
  if (sample) {
    console.log("\nSample trail:", sample.slug);
    console.log("  lengthMilesTotal:", sample.lengthMilesTotal);
    console.log("  shadeClass:", sample.shadeClass);
    console.log("  crowdClass:", sample.crowdClass);
    console.log("  mudRisk:", sample.mudRisk);
    console.log("  nightClass:", sample.nightClass);
    console.log("  surfaceProfile pts:", sample.surfaceProfile?.length ?? 0);
    console.log("  elevationProfile pts:", sample.elevationProfile?.length ?? 0);
    console.log("  faqs:", sample.faqs?.length ?? 0);
    console.log("  highlights:", sample.highlights?.length ?? 0);
    console.log("  personalization:", (sample.personalization as any)?.seniorSafeScore);
    console.log("  hazards:", (sample.hazards as any)?.roadCrossings?.count);
    console.log("  accessRules:", !!(sample as any).accessRules);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
