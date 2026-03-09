import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

function loadEnv() {
  const p = join(ROOT, ".env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[t.slice(0, eq).trim()] = val;
  }
}
loadEnv();

const db = init({ appId: process.env.INSTANT_APP_ID!, adminToken: process.env.INSTANT_ADMIN_TOKEN! });

async function main() {
  const res = await db.query({ trailSystems: { $: { limit: 5000 } } } as any);
  const systems = (res as any).trailSystems ?? [];
  const houston = systems
    .filter((s: any) => s.city?.toLowerCase().includes("houston") && (s.lengthMilesTotal ?? 0) > 1)
    .sort((a: any, b: any) => (b.lengthMilesTotal ?? 0) - (a.lengthMilesTotal ?? 0))
    .slice(0, 20);

  for (const s of houston) {
    const name = (s.name ?? "").padEnd(45);
    const pct = s.shadeProxyPercent != null ? (s.shadeProxyPercent * 100).toFixed(1) + "%" : "n/a";
    const score = s.shadeProxyScore != null ? s.shadeProxyScore.toFixed(3) : "n/a";
    const cls = s.shadeClass ?? "n/a";
    const src = s.shadeSources ?? {};
    console.log(`${name} pct=${pct.padEnd(7)} score=${score.padEnd(7)} class=${cls.padEnd(8)} strong=${src.strongPolyCount ?? 0} med=${src.mediumPolyCount ?? 0} treeRow=${src.treeRowCount ?? 0} treeNode=${src.treeNodeCountUsed ?? 0}`);
  }
}
main().catch(console.error);
