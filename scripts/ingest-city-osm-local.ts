#!/usr/bin/env npx tsx
/**
 * Ingest trail segments for any city from local Geofabrik OSM cache.
 * Reads .cache/osm/{osm-city}/trails.geojsonseq (produced by osm:prepare).
 * Filters to segments with trail-like names and writes to InstantDB.
 *
 * Prerequisite: npm run osm:prepare -- --city {osm-city}
 *
 * Usage:
 *   npx tsx scripts/ingest-city-osm-local.ts \
 *     --city Tucson --state AZ --county Pima \
 *     --osm-city tucson --dataset tucson_osm \
 *     [--write]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init, id } from "@instantdb/admin";
import { loadOsmCategory } from "./lib/osmLocal.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── env loading ───────────────────────────────────────────────────────────────

function loadEnvLocal(rootDir: string): void {
  const envPath = join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}

loadEnvLocal(ROOT);

// ── arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const CITY_NAME   = typeof args.city === "string"    ? args.city    : null;
const STATE       = typeof args.state === "string"   ? args.state   : null;
const COUNTY      = typeof args.county === "string"  ? args.county  : null;
const OSM_CITY    = typeof args["osm-city"] === "string" ? args["osm-city"] : null;
const EXT_DATASET = typeof args.dataset === "string" ? args.dataset : null;
const WRITE_MODE  = !!args.write;

if (!CITY_NAME || !STATE || !COUNTY || !OSM_CITY || !EXT_DATASET) {
  console.error("Usage: npx tsx scripts/ingest-city-osm-local.ts \\");
  console.error("  --city <name> --state <AZ> --county <Pima> \\");
  console.error("  --osm-city <tucson> --dataset <tucson_osm> [--write]");
  process.exit(1);
}

const INDEX_LIMIT = 5000;
const BATCH_SIZE = 200;
const DELAY_MS = 300;

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

if (!appId) { console.error("Error: INSTANT_APP_ID must be set in .env.local"); process.exit(1); }
if (!adminToken) { console.error("Error: INSTANT_ADMIN_TOKEN must be set in .env.local"); process.exit(1); }

function maskToken(t: string | undefined) {
  if (!t || t.length < 10) return t ? "***" : "(none)";
  return t.slice(0, 6) + "..." + t.slice(-4);
}

console.log("=== CONFIG ===");
console.log("appId:     ", appId);
console.log("adminToken:", maskToken(adminToken));
console.log("city:      ", CITY_NAME);
console.log("state:     ", STATE);
console.log("county:    ", COUNTY);
console.log("osm-city:  ", OSM_CITY);
console.log("dataset:   ", EXT_DATASET);
console.log("mode:      ", WRITE_MODE ? "WRITE" : "DRY RUN (pass --write to commit)");
console.log("==============");

// ── name normalization ────────────────────────────────────────────────────────

const TRAIL_INDICATORS = /\b(trail|trails|greenway|greenways|path|hike|bikeway|corridor|lake|creek|river|mountain|park|loop|canyon|arroyo|wash|ridge|mesa|butte|rock|forest|preserve|wilderness|wilderness|levee|pedway|walkway|towpath|greenway|greenbelt)\b/i;
const STREET_SUFFIX = /\b(avenue|ave|street|st|boulevard|blvd|drive|dr|road|rd|lane|ln|place|pl|court|ct|parkway|pkwy|freeway|highway|hwy|expressway|circle|terrace)\s*$/i;

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeName(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (STREET_SUFFIX.test(trimmed) && !TRAIL_INDICATORS.test(trimmed)) return null;
  if (!TRAIL_INDICATORS.test(trimmed)) return null;
  return trimmed;
}

// ── geometry helpers ──────────────────────────────────────────────────────────

function haversineDistMiles(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineStringLengthMiles(pts: { lat: number; lon: number }[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    total += haversineDistMiles(pts[i-1].lon, pts[i-1].lat, pts[i].lon, pts[i].lat);
  }
  return total;
}

function entityList(res: any, entityName: string): any[] {
  return res?.[entityName] ?? res?.data?.[entityName] ?? [];
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });

  console.log(`\n--- Loading local OSM trails cache for ${OSM_CITY} ---`);
  const index = loadOsmCategory(OSM_CITY!, "trails");
  if (!index) {
    console.error(`ERROR: No trails cache found for ${OSM_CITY}.`);
    console.error(`Run: npm run osm:prepare -- --city ${OSM_CITY}`);
    process.exit(1);
  }
  console.log(`Loaded ${index.elements.length} trail elements from local cache.`);

  // Build segment payloads from local OSM elements
  const segmentPayloads: Array<{
    extDataset: string;
    extSegmentRef: string;
    systemRef: string;
    systemSlug: string;
    name: string;
    city: string;
    state: string;
    county: string;
    surface?: string;
    lengthMiles: number;
    geometry: { type: string; coordinates: [number, number][] };
    raw: Record<string, unknown>;
  }> = [];

  let skippedNoName = 0;
  let skippedNoGeom = 0;

  for (const el of index.elements) {
    if (!el.geometry || el.geometry.length < 2) { skippedNoGeom++; continue; }
    const rawName = el.tags.name ?? "";
    const normalizedName = normalizeName(rawName);
    if (!normalizedName) { skippedNoName++; continue; }
    const systemSlug = slugify(normalizedName);
    if (!systemSlug) { skippedNoName++; continue; }

    const coords: [number, number][] = el.geometry.map((p) => [p.lon, p.lat]);
    const geometry = { type: "LineString", coordinates: coords };
    const lengthMiles = lineStringLengthMiles(el.geometry);

    // Parse OSM element ID — el.id is like "w123456"
    const osmId = el.id;

    segmentPayloads.push({
      extDataset: EXT_DATASET!,
      extSegmentRef: "osm:" + osmId,
      systemRef: "sys:" + systemSlug,
      systemSlug,
      name: normalizedName,
      city: CITY_NAME!,
      state: STATE!,
      county: COUNTY!,
      surface: el.tags.surface ?? undefined,
      lengthMiles,
      geometry,
      raw: { osmId, name: rawName, highway: el.tags.highway, surface: el.tags.surface, access: el.tags.access, foot: el.tags.foot, lit: el.tags.lit },
    });
  }

  console.log(`Segment payloads: ${segmentPayloads.length} (${skippedNoName} no name, ${skippedNoGeom} no geom)`);

  const nameCounts: Record<string, number> = {};
  for (const seg of segmentPayloads) nameCounts[seg.name] = (nameCounts[seg.name] || 0) + 1;
  const sortedNames = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\nUnique trail names: ${sortedNames.length}`);
  for (const [name, cnt] of sortedNames.slice(0, 20)) console.log(`  ${String(cnt).padStart(3)}x  ${name}`);

  if (segmentPayloads.length === 0) {
    console.log("No records to ingest.");
    return;
  }

  if (!WRITE_MODE) {
    console.log("\nDRY RUN complete. Pass --write to commit to DB.");
    return;
  }

  // Build systems map
  const systemsByRef = new Map<string, Record<string, unknown>>();
  for (const seg of segmentPayloads) {
    if (!systemsByRef.has(seg.systemRef)) {
      systemsByRef.set(seg.systemRef, {
        extDataset: EXT_DATASET, extSystemRef: seg.systemRef,
        name: seg.name, slug: seg.systemSlug,
        city: CITY_NAME, state: STATE, county: COUNTY,
        raw: { dataset: EXT_DATASET },
      });
    }
  }
  console.log(`\nUnique systems: ${systemsByRef.size}`);

  // Fetch existing records
  const sysRes = await db.query({ trailSystems: { $: { limit: INDEX_LIMIT } } });
  const existingSysByRef = new Map<string, string>();
  for (const s of entityList(sysRes, "trailSystems")) {
    const sid = s.id ?? s._id;
    if (s.extSystemRef && sid) existingSysByRef.set(String(s.extSystemRef), sid);
  }

  const segRes = await db.query({ trailSegments: { $: { limit: INDEX_LIMIT } } });
  const existingSegByRef = new Map<string, string>();
  for (const s of entityList(segRes, "trailSegments")) {
    const sid = s.id ?? s._id;
    if (s.extSegmentRef && sid) existingSegByRef.set(String(s.extSegmentRef), sid);
  }

  // Upsert systems
  console.log("\n--- Upserting trailSystems ---");
  let systemsUpserted = 0;
  for (const [ref, payload] of systemsByRef) {
    const internalId = existingSysByRef.get(ref) ?? id();
    await db.transact([(db.tx as any).trailSystems[internalId].update(payload)]);
    systemsUpserted++;
  }
  console.log(`Systems upserted: ${systemsUpserted}`);
  await new Promise((r) => setTimeout(r, DELAY_MS));

  // Upsert segments
  console.log("\n--- Upserting trailSegments ---");
  let segmentsUpserted = 0, skipped = 0;
  for (let i = 0; i < segmentPayloads.length; i += BATCH_SIZE) {
    const chunk = segmentPayloads.slice(i, i + BATCH_SIZE);
    const steps: any[] = [];
    for (const seg of chunk) {
      if (!seg.extSegmentRef) { skipped++; continue; }
      const internalId = existingSegByRef.get(seg.extSegmentRef) ?? id();
      steps.push((db.tx as any).trailSegments[internalId].update(seg));
      segmentsUpserted++;
    }
    if (steps.length) await db.transact(steps);
    console.log(`  Segments upserted ${Math.min(i + BATCH_SIZE, segmentPayloads.length)}/${segmentPayloads.length}...`);
    if (i + BATCH_SIZE < segmentPayloads.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log("\n=== INGEST SUMMARY ===");
  console.log(`extDataset:        ${EXT_DATASET}`);
  console.log(`systemsUpserted:   ${systemsUpserted}`);
  console.log(`segmentsUpserted:  ${segmentsUpserted}`);
  console.log(`skipped:           ${skipped}`);
  console.log("======================");
}

main().catch((err) => { console.error(err); process.exit(1); });
