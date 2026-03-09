import { init } from "@instantdb/admin";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadEnvLocal(): void {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[trimmed.slice(0, eqIdx).trim()] = val;
  }
}

async function main() {
  loadEnvLocal();
  const appId = process.env.INSTANT_APP_ID!;
  const adminToken = (process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN)!;

  const db = init({ appId, adminToken });
  const res = await db.query({ trailSystems: { $: { where: { city: "Houston" }, limit: 200 } } });
  const systems: any[] = (res as any)?.trailSystems ?? (res as any)?.data?.trailSystems ?? [];

  const under1 = systems.filter((s) => (s.lengthMilesTotal ?? 0) < 1);
  const over1 = systems.filter((s) => (s.lengthMilesTotal ?? 0) >= 1);

  console.log(`Total Houston systems: ${systems.length}`);
  console.log(`Under 1 mile: ${under1.length}`);
  console.log(`>= 1 mile: ${over1.length}`);
  console.log(`\nSlugs >= 1 mile:`);
  over1.sort((a, b) => (b.lengthMilesTotal ?? 0) - (a.lengthMilesTotal ?? 0));
  for (const s of over1) {
    console.log(`  ${(s.slug ?? "?").padEnd(55)} ${(s.lengthMilesTotal ?? 0).toFixed(2)} mi`);
  }
  console.log(`\nSlugs under 1 mile:`);
  under1.sort((a, b) => (b.lengthMilesTotal ?? 0) - (a.lengthMilesTotal ?? 0));
  for (const s of under1) {
    console.log(`  ${(s.slug ?? "?").padEnd(55)} ${(s.lengthMilesTotal ?? 0).toFixed(2)} mi`);
  }
}

main().catch(console.error);
