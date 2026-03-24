#!/usr/bin/env npx tsx
/**
 * Ingest Austin metro trail segments from local OSM cache (Geofabrik Texas extract).
 * Covers suburbs not in the Socrata dataset: Round Rock, Cedar Park, Georgetown,
 * Pflugerville, Leander, Buda, Kyle, Lakeway, Bee Cave, Manor.
 *
 * Prerequisite: npm run osm:prepare -- --city austin
 *
 * Usage:
 *   npx tsx scripts/ingest-austin-osm.ts          # dry-run (no writes)
 *   npx tsx scripts/ingest-austin-osm.ts --write  # commit to DB
 */

import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { init, id } from "@instantdb/admin";
import { loadOsmCategory, type OsmElement } from "./lib/osmLocal.js";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Load .env.local
const dotenvPath = join(root, ".env.local");
try {
  require("fs").readFileSync(dotenvPath, "utf-8")
    .split("\n")
    .forEach((line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const eq = trimmed.indexOf("=");
      if (eq < 0) return;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!(k in process.env)) process.env[k] = v;
    });
} catch {
  // .env.local not found — rely on existing env vars
}

const EXT_DATASET = "austin_osm";
const SOCRATA_DATASET = "austin_socrata_jdwm-wfps";
const STATE = "TX";
const INDEX_LIMIT = 10000;
const BATCH_SIZE = 200;
const DELAY_MS = 200;

const args = process.argv.slice(2).reduce<Record<string, boolean | string>>((acc, a, i, arr) => {
  if (!a.startsWith("--")) return acc;
  const key = a.slice(2);
  const next = arr[i + 1];
  if (next !== undefined && !next.startsWith("--")) { acc[key] = next; }
  else { acc[key] = true; }
  return acc;
}, {});

const writeMode = !!args.write;

const appId = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

if (!appId) { console.error("Error: INSTANT_APP_ID must be set"); process.exit(1); }
if (!adminToken) { console.error("Error: INSTANT_ADMIN_TOKEN must be set"); process.exit(1); }

function maskToken(t: string | undefined) {
  if (!t || t.length < 10) return t ? "***" : "(none)";
  return t.slice(0, 6) + "..." + t.slice(-4);
}

console.log("=== CONFIG ===");
console.log("appId:     ", appId);
console.log("adminToken:", maskToken(adminToken));
console.log("extDataset:", EXT_DATASET);
console.log("mode:      ", writeMode ? "WRITE" : "DRY RUN (no writes)");
console.log("==============");

// ── suburb city / county lookup ───────────────────────────────────────────────

interface SuburbEntry {
  name: string;
  county: string;
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

const SUBURB_BBOXES: SuburbEntry[] = [
  { name: "Round Rock",   county: "Williamson", bbox: [-97.80, 30.44, -97.55, 30.60] },
  { name: "Cedar Park",   county: "Williamson", bbox: [-97.90, 30.45, -97.70, 30.60] },
  { name: "Georgetown",   county: "Williamson", bbox: [-97.75, 30.58, -97.55, 30.75] },
  { name: "Pflugerville", county: "Travis",     bbox: [-97.68, 30.38, -97.52, 30.50] },
  { name: "Leander",      county: "Williamson", bbox: [-97.90, 30.52, -97.75, 30.62] },
  { name: "Buda",         county: "Hays",       bbox: [-97.88, 30.02, -97.77, 30.12] },
  { name: "Kyle",         county: "Hays",       bbox: [-97.92, 29.98, -97.75, 30.10] },
  { name: "Lakeway",      county: "Travis",     bbox: [-97.99, 30.32, -97.88, 30.40] },
  { name: "Bee Cave",     county: "Travis",     bbox: [-97.97, 30.29, -97.88, 30.36] },
  { name: "Manor",        county: "Travis",     bbox: [-97.60, 30.31, -97.48, 30.40] },
];

function lookupSuburb(lon: number, lat: number): { city: string; county: string } {
  for (const s of SUBURB_BBOXES) {
    const [minLon, minLat, maxLon, maxLat] = s.bbox;
    if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
      return { city: s.name, county: s.county };
    }
  }
  return { city: "Austin", county: "Travis" };
}

function wayCenter(el: OsmElement): { lat: number; lon: number } | null {
  if (el.center) return el.center;
  if (el.geometry && el.geometry.length > 0) {
    let sLat = 0, sLon = 0;
    for (const p of el.geometry) { sLat += p.lat; sLon += p.lon; }
    return { lat: sLat / el.geometry.length, lon: sLon / el.geometry.length };
  }
  return null;
}

function cityForElement(el: OsmElement): { city: string; county: string } {
  const addrCity = el.tags["addr:city"];
  if (addrCity) {
    // Match against known suburbs for county lookup
    const match = SUBURB_BBOXES.find(
      (s) => s.name.toLowerCase() === addrCity.toLowerCase(),
    );
    if (match) return { city: match.name, county: match.county };
    // Could be Austin proper or an unmapped city
    return { city: addrCity, county: "Travis" };
  }
  const c = wayCenter(el);
  if (!c) return { city: "Austin", county: "Travis" };
  return lookupSuburb(c.lon, c.lat);
}

// ── name normalization ────────────────────────────────────────────────────────

const NORMALIZE_NAMES = new Map<string, string>([
  // Lady Bird Lake / Town Lake trail — multiple OSM name variants
  ["lady bird lake trail", "Lady Bird Lake Hike and Bike Trail"],
  ["ann and roy butler hike and bike trail", "Lady Bird Lake Hike and Bike Trail"],
  ["ann & roy butler hike and bike trail", "Lady Bird Lake Hike and Bike Trail"],
  ["ann & roy butler hike-and-bike trail", "Lady Bird Lake Hike and Bike Trail"],
  ["ann and roy butler hike-and-bike trail", "Lady Bird Lake Hike and Bike Trail"],
  ["town lake hike and bike trail", "Lady Bird Lake Hike and Bike Trail"],
  // Barton Creek
  ["barton creek greenbelt", "Barton Creek Greenbelt"],
  ["barton creek greenbelt trail", "Barton Creek Greenbelt"],
  ["barton creek greenbelt & violet crown trail", "Barton Creek Greenbelt"],
  ["barton creek greenbelt and violet crown trail", "Barton Creek Greenbelt"],
  // Shoal Creek
  ["shoal creek trail", "Shoal Creek Trail"],
  ["shoal creek greenbelt", "Shoal Creek Trail"],
  // Walnut Creek
  ["walnut creek trail", "Walnut Creek Trail"],
  ["walnut creek greenbelt trail", "Walnut Creek Trail"],
  ["northern walnut creek trail", "Northern Walnut Creek Trail"],
  ["southern walnut creek trail", "Southern Walnut Creek Trail"],
  ["se walnut creek trails", "SE Walnut Creek Trails"],
  // Brushy Creek
  ["brushy creek trail", "Brushy Creek Trail"],
  ["brushy creek regional trail", "Brushy Creek Regional Trail"],
  ["brushy creek lake park trail", "Brushy Creek Lake Park Trail"],
  // Boggy Creek
  ["boggy creek greenbelt trail", "Boggy Creek Greenbelt Trail"],
  ["boggy creek trail", "Boggy Creek Trail"],
  // Gilleland Creek
  ["gilleland creek trail", "Gilleland Creek Trail"],
  // Barton Springs
  ["barton springs trail", "Barton Springs Trail"],
  // Slaughter Creek
  ["slaughter creek trail", "Slaughter Creek Trail"],
  ["slaughter creek greenbelt", "Slaughter Creek Trail"],
  // Onion Creek
  ["onion creek trail", "Onion Creek Trail"],
  ["onion creek greenway", "Onion Creek Trail"],
  // Violet Crown Trail
  ["violet crown trail", "Violet Crown Trail"],
  // Bull Creek
  ["bull creek greenbelt trail", "Bull Creek Greenbelt Trail"],
  ["bull creek trail", "Bull Creek Greenbelt Trail"],
  // Waller Creek
  ["waller creek greenbelt trail", "Waller Creek Greenbelt Trail"],
  ["waller creek trail", "Waller Creek Greenbelt Trail"],
  // Johnson Creek
  ["johnson creek hike and bike trail", "Johnson Creek Hike and Bike Trail"],
  // Great Hills
  ["great hills trail", "Great Hills Trail"],
  // Georgetown / Round Rock / Goodwater
  ["san gabriel river trail", "San Gabriel River Trail"],
  ["lake georgetown trail", "Lake Georgetown Trail"],
  ["good water trail loop", "Goodwater Loop Trail"],
  ["goodwater loop trail", "Goodwater Loop Trail"],
  ["goodwater loop", "Goodwater Loop Trail"],
  ["cedar ridge trail", "Cedar Ridge Trail"],
  // Rinard Creek
  ["rinard creek greenbelt trail", "Rinard Creek Greenbelt Trail"],
]);

const TRAIL_INDICATORS =
  /\b(trail|trails|greenway|greenways|path|hike|hikeway|bikeway|corridor|greenbelt|preserve|creek|ridge|loop|lake)\b/i;

const STREET_SUFFIX =
  /\b(avenue|ave|street|st|boulevard|blvd|drive|dr|road|rd|lane|ln|place|pl|court|ct|parkway|pkwy|freeway|highway|hwy|expressway|loop|circle|terrace|way)\s*$/i;

function normalizeName(raw: string | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  // Check explicit normalize map first
  const mapped = NORMALIZE_NAMES.get(lower);
  if (mapped) return mapped;
  // Drop pure street names
  if (STREET_SUFFIX.test(trimmed) && !TRAIL_INDICATORS.test(trimmed)) return null;
  // Must contain a trail indicator word
  if (!TRAIL_INDICATORS.test(trimmed)) return null;
  return trimmed;
}

// ── geometry helpers ──────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function osmWayToLineString(el: OsmElement): { type: "LineString"; coordinates: [number, number][] } | null {
  if (!el.geometry || el.geometry.length < 2) return null;
  const coords = el.geometry.map((pt): [number, number] => [pt.lon, pt.lat]);
  return { type: "LineString", coordinates: coords };
}

function haversineDistMiles(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineStringLengthMiles(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistMiles(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

function entityList(res: any, entityName: string): any[] {
  return res?.[entityName] ?? res?.data?.[entityName] ?? [];
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = init({ appId: appId!, adminToken: adminToken! });

  // Load OSM surface ways from local cache
  console.log("\n--- Loading OSM surface ways from local cache ---");
  const osmIndex = loadOsmCategory(
    "austin",
    "surface",
    (el) => /^(path|footway|track|cycleway|bridleway)$/.test(el.tags.highway ?? ""),
  );

  if (!osmIndex) {
    console.error(
      "\nERROR: Local OSM cache not found for Austin.\n" +
      "Run first: npm run osm:prepare -- --city austin\n",
    );
    process.exit(1);
  }

  const osmElements = osmIndex.elements.filter((el) => el.type === "way");
  console.log(`OSM way elements (footway/path/track/cycleway/bridleway): ${osmElements.length}`);

  // Load existing Socrata slugs for dedup
  console.log("\n--- Loading existing Socrata trail slugs for dedup ---");
  const socrataRes = await db.query({
    trailSystems: { $: { limit: INDEX_LIMIT } },
  });
  const existingSocrataSlugs = new Set<string>();
  for (const s of entityList(socrataRes, "trailSystems")) {
    if (s.extDataset === SOCRATA_DATASET && s.slug) {
      existingSocrataSlugs.add(String(s.slug));
    }
  }
  console.log(`Existing Socrata system slugs: ${existingSocrataSlugs.size}`);

  // Map OSM elements to segment payloads
  type SegmentPayload = {
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
    geometry: { type: "LineString"; coordinates: [number, number][] };
    raw: Record<string, unknown>;
  };

  const segmentPayloads: SegmentPayload[] = [];
  let droppedNoName = 0;
  let droppedSocrataDedup = 0;
  let droppedNoGeom = 0;

  for (const el of osmElements) {
    const rawName = el.tags?.name;
    const normalizedName = normalizeName(rawName);
    if (!normalizedName) { droppedNoName++; continue; }

    const systemSlug = slugify(normalizedName);
    if (!systemSlug) { droppedNoName++; continue; }

    if (existingSocrataSlugs.has(systemSlug)) { droppedSocrataDedup++; continue; }

    const geometry = osmWayToLineString(el);
    if (!geometry) { droppedNoGeom++; continue; }

    const lengthMiles = lineStringLengthMiles(geometry.coordinates);
    const { city, county } = cityForElement(el);

    segmentPayloads.push({
      extDataset: EXT_DATASET,
      extSegmentRef: "osm:" + String(el.id),
      systemRef: "sys:" + systemSlug,
      systemSlug,
      name: normalizedName,
      city,
      state: STATE,
      county,
      surface: el.tags?.surface,
      lengthMiles,
      geometry,
      raw: {
        osmId: el.id,
        name: rawName,
        highway: el.tags?.highway,
        surface: el.tags?.surface,
        access: el.tags?.access,
        foot: el.tags?.foot,
        lit: el.tags?.lit,
        width: el.tags?.width,
      },
    });
  }

  console.log(`\nSegment payloads: ${segmentPayloads.length}`);
  console.log(`  dropped (no name/filtered): ${droppedNoName}`);
  console.log(`  dropped (Socrata dedup):    ${droppedSocrataDedup}`);
  console.log(`  dropped (no geometry):      ${droppedNoGeom}`);

  // Name distribution
  const nameCounts: Record<string, number> = {};
  for (const seg of segmentPayloads) {
    nameCounts[seg.name] = (nameCounts[seg.name] || 0) + 1;
  }
  const sortedNames = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\nUnique trail systems: ${sortedNames.length}`);
  console.log("Top 40:");
  for (const [name, cnt] of sortedNames.slice(0, 40)) {
    console.log(`  ${String(cnt).padStart(4)}x  ${name}`);
  }

  // City distribution
  const cityCounts: Record<string, number> = {};
  for (const seg of segmentPayloads) {
    cityCounts[seg.city] = (cityCounts[seg.city] || 0) + 1;
  }
  console.log("\nCity distribution (by segments):");
  for (const [city, cnt] of Object.entries(cityCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(cnt).padStart(4)}x  ${city}`);
  }

  if (segmentPayloads.length === 0) {
    console.log("\nNo records to ingest. Exiting.");
    return;
  }

  if (!writeMode) {
    console.log("\n[DRY RUN] No writes performed. Pass --write to commit.");
    return;
  }

  // Build system map (one system per unique slug, picks city from first segment)
  const systemsByRef = new Map<string, Record<string, unknown>>();
  for (const seg of segmentPayloads) {
    if (!systemsByRef.has(seg.systemRef)) {
      systemsByRef.set(seg.systemRef, {
        extDataset: EXT_DATASET,
        extSystemRef: seg.systemRef,
        name: seg.name,
        slug: seg.systemSlug,
        city: seg.city,
        state: STATE,
        county: seg.county,
        raw: { dataset: EXT_DATASET },
      });
    }
  }
  console.log(`\nUnique systems to upsert: ${systemsByRef.size}`);

  // Load existing systems for upsert
  const allSysRes = await db.query({
    trailSystems: { $: { limit: INDEX_LIMIT } },
  });
  const existingSysByRef = new Map<string, string>();
  for (const s of entityList(allSysRes, "trailSystems")) {
    const sid = s.id ?? s._id;
    if (s.extSystemRef && sid) existingSysByRef.set(String(s.extSystemRef), sid);
  }

  // Load existing segments for upsert
  const allSegRes = await db.query({
    trailSegments: { $: { where: { extDataset: EXT_DATASET }, limit: INDEX_LIMIT } },
  });
  const existingSegByRef = new Map<string, string>();
  for (const s of entityList(allSegRes, "trailSegments")) {
    const sid = s.id ?? s._id;
    if (s.extSegmentRef && sid) existingSegByRef.set(String(s.extSegmentRef), sid);
  }

  // Upsert systems
  console.log("\n--- Upserting trailSystems ---");
  let systemsUpserted = 0;
  for (const [ref, payload] of systemsByRef) {
    const existingId = existingSysByRef.get(ref);
    const internalId = existingId ?? id();
    await db.transact([db.tx.trailSystems[internalId].update(payload)]);
    systemsUpserted++;
  }
  console.log(`Systems upserted: ${systemsUpserted}`);

  await new Promise((r) => setTimeout(r, DELAY_MS));

  // Upsert segments in batches
  console.log("\n--- Upserting trailSegments ---");
  let segmentsUpserted = 0;
  let skipped = 0;

  for (let i = 0; i < segmentPayloads.length; i += BATCH_SIZE) {
    const chunk = segmentPayloads.slice(i, i + BATCH_SIZE);
    const steps: any[] = [];

    for (const seg of chunk) {
      if (!seg.extSegmentRef) { skipped++; continue; }
      const existingId = existingSegByRef.get(seg.extSegmentRef);
      const internalId = existingId ?? id();
      steps.push(db.tx.trailSegments[internalId].update(seg));
      segmentsUpserted++;
    }

    if (steps.length) await db.transact(steps);
    const done = Math.min(i + BATCH_SIZE, segmentPayloads.length);
    console.log(`  Segments ${done}/${segmentPayloads.length}...`);
    if (i + BATCH_SIZE < segmentPayloads.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log("\n=== INGEST SUMMARY ===");
  console.log(`extDataset:       ${EXT_DATASET}`);
  console.log(`osmElements:      ${osmElements.length}`);
  console.log(`segmentPayloads:  ${segmentPayloads.length}`);
  console.log(`systemsUpserted:  ${systemsUpserted}`);
  console.log(`segmentsUpserted: ${segmentsUpserted}`);
  console.log(`skipped:          ${skipped}`);
  console.log(`socrataDeduped:   ${droppedSocrataDedup}`);
  console.log("======================");
}

main().catch((err) => {
  console.error(err);
  if (err?.body) console.error("API body:", JSON.stringify(err.body, null, 2));
  process.exit(1);
});
