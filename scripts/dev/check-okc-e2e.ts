import { init } from "@instantdb/admin";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const db = init({
  appId: process.env.INSTANT_APP_ID as string,
  adminToken: process.env.INSTANT_ADMIN_TOKEN as string,
});

async function main() {
  const r = await db.query({ trailSystems: { $: { where: { slug: "oklahoma-river-trail" } } } });
  const s = (r.trailSystems as any)[0];
  if (!s) { console.log("NOT FOUND"); process.exit(1); }

  const p = s.personalization as any;
  const safety = s.safety as any;

  const checks: [string, any][] = [
    ["dogsAllowed", s.dogsAllowed],
    ["leashPolicy", s.leashPolicy],
    ["shadeClass", s.shadeClass],
    ["crowdClass", s.crowdClass],
    ["mudRisk", s.mudRisk],
    ["nightClass", s.nightClass],
    ["winterClass", s.winterClass],
    ["personalization.seniorSafeScore", p?.seniorSafeScore],
    ["safety.nearbyVets count", safety?.nearbyVets?.length],
    ["surfaceProfile points", s.surfaceProfile?.length],
    ["shadeProfile points", s.shadeProfile?.length],
    ["elevationProfile points", s.elevationProfile?.length],
    ["faqs count", s.faqs?.length],
    ["parkingCount", s.parkingCount],
    ["hazards.roadCrossings", (s.hazards as any)?.roadCrossings?.count],
    ["bailoutPoints count", s.bailoutPoints?.length],
    ["accessRules stored", !!(s as any).accessRules],
    ["highlights count", s.highlights?.length],
    ["amenityPoints count", s.amenityPoints?.length],
  ];

  let pass = 0, fail = 0;
  for (const [k, v] of checks) {
    const ok = v !== undefined && v !== null && v !== 0 && v !== false;
    console.log((ok ? "PASS" : "FAIL") + "  " + k + " = " + v);
    ok ? pass++ : fail++;
  }
  console.log(`\n${pass}/${pass+fail} passed`);
}

main().catch((e) => { console.error(e); process.exit(1); });
