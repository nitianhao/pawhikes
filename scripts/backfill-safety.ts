#!/usr/bin/env npx tsx
/**
 * Backfill safety on trailSystems.
 *
 * DRY by default. Pass --dry false to write.
 *
 * Usage:
 *   npx tsx scripts/backfill-safety.ts [--city "Austin"] [--state "TX"] [--limit 100] [--dry true|false] [--batchSize 20] [--radiusMeters 10000]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { computeSafety } from "../src/lib/enrich/modules/safety";
import { loadOsmCategory, filterByRadius, type OsmLocalIndex } from "./lib/osmLocal.js";

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
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
  const n = input.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(n)) return true;
  if (["false", "0", "no", "n"].includes(n)) return false;
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

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function overpassPost(query: string): Promise<any[]> {
  const RETRIES = 3;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    for (const ep of OVERPASS_ENDPOINTS) {
      try {
        const resp = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(90_000),
        });
        if (resp.status === 429 || resp.status === 504) {
          const waitMs = attempt * 10_000;
          await sleep(waitMs);
          continue;
        }
        if (!resp.ok) continue;
        const json: any = await resp.json();
        return json.elements ?? [];
      } catch {
        if (attempt < RETRIES) await sleep(4_000 * attempt);
      }
    }
  }
  return [];
}

async function main(): Promise<void> {
  loadEnvLocal(ROOT);

  const args = parseArgs(process.argv.slice(2));
  const cityFilter = typeof args.city === "string" ? args.city : undefined;
  const stateFilter = typeof args.state === "string" ? args.state : undefined;
  const osmCityArg = typeof args["osm-city"] === "string" ? args["osm-city"] : undefined;
  const limitArg = typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
  const isDryRun = parseBool(args.dry, true);
  const batchSizeRaw = typeof args.batchSize === "string" ? parseInt(args.batchSize, 10) : 20;
  const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : 20;
  const radiusRaw = typeof args.radiusMeters === "string" ? parseInt(args.radiusMeters, 10) : 10_000;
  const radiusMeters = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 10_000;

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
  console.log("city:       ", cityFilter ?? "(all)");
  console.log("state:      ", stateFilter ?? "(all)");
  console.log("limit:      ", limitArg ?? "(all)");
  console.log("dry:        ", isDryRun);
  console.log("batchSize:  ", batchSize);
  console.log("radius:     ", `${radiusMeters}m`);
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

  // Load local OSM vets index if available — avoids Overpass for each system
  const osmCityKey = osmCityArg ?? cityFilter;
  let localVets: OsmLocalIndex | null = null;
  if (osmCityKey) {
    localVets = loadOsmCategory(osmCityKey, "vets");
    console.log(localVets
      ? `  Local OSM vets cache: ${localVets.elements.length} features — skipping Overpass\n`
      : `  No local OSM vets cache for "${osmCityKey}" — will use Overpass\n`
    );
  }

  let totalScanned = 0;
  let updated = 0;
  let failed = 0;

  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (const system of systems) {
    totalScanned++;
    const slug = String(system.slug ?? system.extSystemRef ?? system.id ?? "unknown");

    try {
      const safety = await computeSafety(system, {
        overpass: overpassPost,
        radiusMeters,
        localVets,
        filterByRadius,
      });
      const nearest = safety.nearbyVets[0];
      const nearestLabel = nearest ? (nearest.name ?? nearest.osmId) : "none";
      const modeLabel = isDryRun ? "DRY" : "WRITE";

      console.log(
        `[safety][${modeLabel}] ${slug} ` +
          `access=${safety.emergencyAccessClass}(${toScore(safety.emergencyAccessScore)}) ` +
          `vets=${safety.vetCountWithin5km} ` +
          `nearest=${nearestLabel} ` +
          `cell=${safety.cellCoverageProxy}`
      );

      if (isDryRun) {
        updated++;
      } else {
        updates.push({
          systemId: String(system.id),
          payload: {
            safety,
            safetyLastComputedAt: Date.now(),
          },
        });
      }
    } catch (err: any) {
      failed++;
      console.warn(`[safety][ERROR] ${slug} ${err?.message ?? err}`);
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
        console.warn(`[safety][ERROR] batch ${i / batchSize + 1} failed: ${err?.message ?? err}`);
      }
    }
  }

  console.log("\n=== BACKFILL SUMMARY ===");
  console.log(`Total scanned: ${totalScanned}`);
  console.log(`Updated:       ${updated}`);
  console.log(`Failed:        ${failed}`);

  if (isDryRun) {
    console.log("DRY RUN complete: no writes performed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
