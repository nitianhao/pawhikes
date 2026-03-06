#!/usr/bin/env npx tsx
/**
 * Backfill personalization on trailSystems.
 *
 * DRY by default. Pass --dry false to write.
 *
 * Usage:
 *   npx tsx scripts/backfill-personalization.ts [--city "Austin"] [--state "TX"] [--limit 100] [--dry true|false] [--batchSize 50]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { computePersonalization } from "../src/lib/enrich/modules/personalization";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function loadEnvLocal(rootDir: string): void {
  const envPath = join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function parseBool(input: unknown, fallback: boolean): boolean {
  if (typeof input !== "string") return fallback;
  const normalized = input.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function entityList<T = any>(result: any, key: string): T[] {
  const v = result?.[key];
  if (Array.isArray(v)) return v as T[];
  if (v && Array.isArray(v.data)) return v.data as T[];
  return [];
}

function toScore(value: number): string {
  return value.toFixed(2);
}

function firstReason(value: string[]): string {
  return value[0] ?? "n/a";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableJson(v)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `\"${k}\":${stableJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPersonalizationUpToDate(existing: unknown, computed: unknown): boolean {
  return stableJson(existing ?? null) === stableJson(computed ?? null);
}

async function main(): Promise<void> {
  loadEnvLocal(ROOT);

  const args = parseArgs(process.argv.slice(2));
  const cityFilter = typeof args.city === "string" ? args.city : undefined;
  const stateFilter = typeof args.state === "string" ? args.state : undefined;
  const limitArg = typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
  const isDryRun = parseBool(args.dry, true);
  const batchSizeRaw = typeof args.batchSize === "string" ? parseInt(args.batchSize, 10) : 50;
  const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : 50;

  const appId = process.env.INSTANT_APP_ID;
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

  if (!appId) {
    console.error("Error: INSTANT_APP_ID must be set in .env.local");
    process.exit(1);
  }
  if (!adminToken) {
    console.error("Error: INSTANT_APP_ADMIN_TOKEN or INSTANT_ADMIN_TOKEN must be set in .env.local");
    process.exit(1);
  }

  const db = init({ appId, adminToken });

  console.log("=== CONFIG ===");
  console.log("city:     ", cityFilter ?? "(all)");
  console.log("state:    ", stateFilter ?? "(all)");
  console.log("limit:    ", limitArg ?? "(all)");
  console.log("dry:      ", isDryRun);
  console.log("batchSize:", batchSize);
  console.log("==============\n");

  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = entityList<any>(sysRes, "trailSystems");
  console.log(`  Total systems in DB: ${systems.length}`);

  if (cityFilter) {
    const n = cityFilter.toLowerCase();
    systems = systems.filter((s) => String(s.city ?? "").toLowerCase().includes(n));
    console.log(`  After city=\"${cityFilter}\": ${systems.length}`);
  }
  if (stateFilter) {
    const n = stateFilter.toLowerCase();
    systems = systems.filter((s) => !s.state || String(s.state).toLowerCase().includes(n));
    console.log(`  After state=\"${stateFilter}\": ${systems.length}`);
  }
  if (limitArg && Number.isFinite(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }

  if (systems.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  let totalScanned = 0;
  let updated = 0;
  let skippedAlreadyUpToDate = 0;
  let failed = 0;

  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (const system of systems) {
    totalScanned++;
    const slug = String(system.slug ?? system.extSystemRef ?? system.id ?? "unknown");

    try {
      const computed = computePersonalization(system);
      if (isPersonalizationUpToDate(system.personalization, computed)) {
        skippedAlreadyUpToDate++;
        continue;
      }

      if (isDryRun) {
        console.log(
          `[personalization][DRY] ${slug} ` +
            `senior=${toScore(computed.seniorSafeScore)} ` +
            `small=${toScore(computed.smallDogScore)} ` +
            `heat=${computed.heatSensitiveLevel} ` +
            `energy=${toScore(computed.highEnergyScore)} ` +
            `reasons=${firstReason(computed.seniorSafeReasons)} | ${firstReason(computed.smallDogReasons)} | ${firstReason(computed.heatSensitiveReasons)} | ${firstReason(computed.highEnergyReasons)}`
        );
        updated++;
      } else {
        updates.push({
          systemId: String(system.id),
          payload: {
            personalization: computed,
            personalizationLastComputedAt: Date.now(),
          },
        });
      }
    } catch (err: any) {
      failed++;
      console.warn(`[personalization][ERROR] ${slug} ${err?.message ?? err}`);
    }
  }

  if (!isDryRun && updates.length > 0) {
    for (let i = 0; i < updates.length; i += batchSize) {
      const chunk = updates.slice(i, i + batchSize);
      try {
        const txSteps = chunk.map(({ systemId, payload }) =>
          (db as any).tx.trailSystems[systemId].update(payload)
        );
        await db.transact(txSteps);
        updated += chunk.length;
        console.log(`  Written ${updated}/${updates.length}...`);
      } catch (err: any) {
        failed += chunk.length;
        console.warn(`[personalization][ERROR] batch ${i / batchSize + 1} failed: ${err?.message ?? err}`);
      }
    }
  }

  console.log("\n=== BACKFILL SUMMARY ===");
  console.log(`Total systems scanned:       ${totalScanned}`);
  console.log(`Updated:                     ${updated}`);
  console.log(`SkippedAlreadyUpToDate:      ${skippedAlreadyUpToDate}`);
  console.log(`Failed:                      ${failed}`);

  if (isDryRun) {
    console.log("DRY RUN complete: no writes performed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
