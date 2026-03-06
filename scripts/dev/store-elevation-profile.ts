#!/usr/bin/env npx tsx
/**
 * Build and store elevationProfile arrays from local elevation cache.
 *
 * Reads .cache/elevation/{systemId}-{fingerprint}.json files, downsamples the
 * raw elevationsM array to ≤300 points, and writes { elevationProfile } to each
 * trailSystem in InstantDB.
 *
 * Usage:
 *   npx tsx scripts/dev/store-elevation-profile.ts                       # all trails with cache
 *   npx tsx scripts/dev/store-elevation-profile.ts --slug mueller-trail  # one trail
 *   npx tsx scripts/dev/store-elevation-profile.ts --dry-run             # preview only
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { init } from "@instantdb/admin";

const ROOT = process.cwd();
const CACHE_DIR = join(ROOT, ".cache", "elevation");
const SAMPLE_SPACING_M = 50;
const METERS_TO_FEET = 3.28084;
const METERS_PER_MILE = 1609.344;
const MAX_PROFILE_POINTS = 300;

type ElevationProfilePoint = { d: number; e: number };

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

function parseArgs(): { slug?: string; dryRun: boolean } {
  const argv = process.argv.slice(2);
  let slug: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug" && argv[i + 1]) slug = argv[++i];
    if (argv[i] === "--dry-run" || argv[i] === "--dry") dryRun = true;
  }
  return { slug, dryRun };
}

function findCacheFileForSystem(systemId: string): string | null {
  if (!existsSync(CACHE_DIR)) return null;
  const prefix = `${systemId}-`;
  const files = readdirSync(CACHE_DIR);
  const match = files.find((f) => f.startsWith(prefix) && f.endsWith(".json"));
  return match ? join(CACHE_DIR, match) : null;
}

function buildProfile(elevationsM: number[], lengthMilesTotal: number): ElevationProfilePoint[] {
  const n = elevationsM.length;
  if (n < 2) return [];

  // Downsample: pick every Nth index so output ≤ MAX_PROFILE_POINTS
  const step = Math.max(1, Math.ceil(n / MAX_PROFILE_POINTS));
  const indices: number[] = [];
  for (let i = 0; i < n; i += step) indices.push(i);
  // Always include last point
  if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);

  // Normalize x-axis to actual trail length (the raw sample spacing reflects all
  // concatenated segment geometries, which may differ from the reported system length).
  const totalMiles = Number.isFinite(lengthMilesTotal) && lengthMilesTotal > 0
    ? lengthMilesTotal
    : (n - 1) * SAMPLE_SPACING_M / METERS_PER_MILE;

  return indices.map((i, pos) => ({
    d: Math.round((pos / (indices.length - 1)) * totalMiles * 1000) / 1000,
    e: Math.round(elevationsM[i] * METERS_TO_FEET * 10) / 10,
  }));
}

function entityList<T>(result: any, key: string): T[] {
  const v = result?.[key];
  if (Array.isArray(v)) return v as T[];
  if (v && Array.isArray(v.data)) return v.data as T[];
  return [];
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { slug: slugFilter, dryRun } = parseArgs();

  const appId = process.env.INSTANT_APP_ID;
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
  if (!appId || !adminToken) {
    console.error("Missing INSTANT_APP_ID or INSTANT_ADMIN_TOKEN in .env.local");
    process.exit(1);
  }

  const db = init({ appId, adminToken });

  console.log(`=== store-elevation-profile ===`);
  console.log(`mode:       ${dryRun ? "DRY RUN" : "WRITE"}`);
  console.log(`slug filter: ${slugFilter ?? "(all)"}`);
  console.log(`cache dir:   ${CACHE_DIR}`);
  console.log("");

  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = entityList<any>(sysRes, "trailSystems");

  if (slugFilter) {
    systems = systems.filter((s: any) => String(s.slug ?? "").toLowerCase() === slugFilter.toLowerCase());
    if (systems.length === 0) {
      console.error(`No system found with slug="${slugFilter}"`);
      process.exit(1);
    }
  }

  console.log(`Systems to process: ${systems.length}`);
  console.log("");

  let found = 0;
  let skipped = 0;
  const updates: { id: string; name: string; profile: ElevationProfilePoint[] }[] = [];

  for (const system of systems) {
    const label = String(system.slug ?? system.id ?? "?");
    const cacheFile = findCacheFileForSystem(system.id);

    if (!cacheFile) {
      console.log(`[SKIP] ${label} — no cache file`);
      skipped++;
      continue;
    }

    let cacheData: any;
    try {
      cacheData = JSON.parse(readFileSync(cacheFile, "utf-8"));
    } catch {
      console.log(`[SKIP] ${label} — cache read error`);
      skipped++;
      continue;
    }

    const elevationsM: number[] = Array.isArray(cacheData?.elevationsM) ? cacheData.elevationsM : [];
    if (elevationsM.length < 2) {
      console.log(`[SKIP] ${label} — too few elevation points (${elevationsM.length})`);
      skipped++;
      continue;
    }

    const lengthMilesTotal = typeof system.lengthMilesTotal === "number" ? system.lengthMilesTotal : 0;
    const profile = buildProfile(elevationsM, lengthMilesTotal);
    found++;

    console.log(
      `[${dryRun ? "DRY" : "WRITE"}] ${label} — ${elevationsM.length} raw points → ${profile.length} profile points`
    );
    if (dryRun) {
      console.log(
        `  first: d=${profile[0].d} mi, e=${profile[0].e} ft | last: d=${profile[profile.length - 1].d} mi, e=${profile[profile.length - 1].e} ft`
      );
    }

    updates.push({ id: system.id, name: label, profile });
  }

  console.log(`\nFound cache for ${found} system(s), skipped ${skipped}.`);

  if (!dryRun && updates.length > 0) {
    console.log(`Writing ${updates.length} update(s)...`);
    for (const { id, name, profile } of updates) {
      await db.transact([(db as any).tx.trailSystems[id].update({ elevationProfile: profile })]);
      console.log(`  ✓ ${name}`);
    }
    console.log("Done.");
  } else if (dryRun) {
    console.log("DRY RUN — no writes performed.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
