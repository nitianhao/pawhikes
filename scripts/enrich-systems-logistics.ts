#!/usr/bin/env npx tsx
/**
 * Trailhead Logistics enrichment for trailSystems (Parking + Amenities).
 *
 * For each trailSystem:
 *   1. Derive three anchor points (start, end, centroid) from geometry
 *   2. Query Overpass (around each anchor) for:
 *        A) Parking lots / entrances
 *        B) Trailhead amenities (toilets, water, shelter, info, etc.)
 *   3. Parse POIs with GeoJSON Point locations
 *   4. Deduplicate across anchors, sort by distance, cap at 60
 *   5. Compute counts, capacity estimate, amenities index score
 *   6. Persist to trailSystems
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-logistics.ts \
 *     --city "Austin" --state "TX" \
 *     [--parkingRadius 500] [--amenityRadius 250] \
 *     [--limit 5] [--write] [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

// ── env ───────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, "..");

function loadEnvLocal(rootDir: string): void {
  const envPath = join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val   = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    process.env[key] = val;
  }
}
loadEnvLocal(ROOT);

// ── argv ──────────────────────────────────────────────────────────────────────
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

const args           = parseArgs(process.argv.slice(2));
const cityFilter     = typeof args.city           === "string" ? args.city           : undefined;
const stateFilter    = typeof args.state          === "string" ? args.state          : undefined;
const limitArg       = typeof args.limit          === "string" ? parseInt(args.limit, 10) : undefined;
const parkingRadius  = typeof args.parkingRadius  === "string" ? parseFloat(args.parkingRadius)  : 500;
const amenityRadius  = typeof args.amenityRadius  === "string" ? parseFloat(args.amenityRadius)  : 250;
const isDryRun       = !args.write;
const isVerbose      = !!args.verbose;

if (!cityFilter) { console.error("Error: --city is required"); process.exit(1); }

// ── InstantDB ─────────────────────────────────────────────────────────────────
const appId      = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
if (!appId)      { console.error("Error: INSTANT_APP_ID missing");      process.exit(1); }
if (!adminToken) { console.error("Error: INSTANT_ADMIN_TOKEN missing"); process.exit(1); }

const maskToken = (t?: string) =>
  !t || t.length < 10 ? (t ? "***" : "(none)") : t.slice(0, 6) + "..." + t.slice(-4);

console.log("=== CONFIG ===");
console.log("appId:          ", appId);
console.log("token:          ", maskToken(adminToken));
console.log("city:           ", cityFilter);
console.log("state:          ", stateFilter ?? "(not set)");
console.log("limit:          ", limitArg ?? "(all)");
console.log("parkingRadius:  ", parkingRadius, "m");
console.log("amenityRadius:  ", amenityRadius, "m");
console.log("mode:           ", isDryRun ? "DRY RUN (pass --write to persist)" : "WRITE");
console.log("verbose:        ", isVerbose);
console.log("==============\n");

// ── types ─────────────────────────────────────────────────────────────────────
type Coord         = [number, number]; // [lon, lat]
type MultiLineCoords = Coord[][];

type AnchorLabel = "start" | "end" | "centroid";

type POIKind =
  | "parking"
  | "parking_entrance"
  | "toilets"
  | "drinking_water"
  | "picnic_table"
  | "bench"
  | "shelter"
  | "information"
  | "waste_basket"
  | "dog_waste";

interface GeoJsonPoint { type: "Point"; coordinates: Coord; }

interface TrailheadPOI {
  osmType: "node" | "way" | "relation";
  osmId: string;
  kind: POIKind;
  name: string | null;
  location: GeoJsonPoint;
  distanceToAnchorMeters: number;
  anchor: AnchorLabel;
  tags: Record<string, string>;
}

interface AmenitiesCounts {
  toilets: number;
  drinking_water: number;
  shelter: number;
  information: number;
  waste_basket: number;
  picnic_table: number;
  bench: number;
}

// Tag subset to store (small)
const KEPT_TAGS = new Set([
  "name", "capacity", "fee", "access", "opening_hours", "operator", "surface",
]);

const MAX_POIS = 60;

// ── geometry helpers ──────────────────────────────────────────────────────────

function haversineM(a: Coord, b: Coord): number {
  const R  = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180, φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function extractLines(geom: any): MultiLineCoords {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString")      return [geom.coordinates as Coord[]];
  if (geom.type === "MultiLineString") return geom.coordinates as MultiLineCoords;
  return [];
}

/**
 * Derive anchor points from a MultiLine geometry.
 * start   = first coord of first line
 * end     = last coord of last line
 * centroid = simple average of all coordinate positions
 */
function deriveAnchors(
  lines: MultiLineCoords,
): Record<AnchorLabel, Coord> | null {
  if (lines.length === 0) return null;

  const firstLine = lines[0];
  const lastLine  = lines[lines.length - 1];
  if (firstLine.length === 0 || lastLine.length === 0) return null;

  const start: Coord = [firstLine[0][0],     firstLine[0][1]];
  const end:   Coord = [lastLine[lastLine.length - 1][0], lastLine[lastLine.length - 1][1]];

  // Centroid: arithmetic mean of all coords
  let sumLon = 0, sumLat = 0, n = 0;
  for (const line of lines)
    for (const [lon, lat] of line) { sumLon += lon; sumLat += lat; n++; }
  const centroid: Coord = n > 0 ? [sumLon / n, sumLat / n] : [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

  return { start, end, centroid };
}

// ── polygon area (Shoelace formula, degrees → rough m²) ──────────────────────

/**
 * Estimate area of a closed ring in m² using the spherical excess approximation.
 * Accurate enough for parking-lot-sized polygons.
 */
function polygonAreaM2(ring: Coord[]): number {
  if (ring.length < 4) return 0;
  // Convert to metres using a local planar approximation centred on first point
  const origin = ring[0];
  const cosLat = Math.cos((origin[1] * Math.PI) / 180);
  const DEG_TO_M_LON = (Math.PI / 180) * 6_371_000 * cosLat;
  const DEG_TO_M_LAT = (Math.PI / 180) * 6_371_000;

  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = (ring[i][0] - origin[0]) * DEG_TO_M_LON;
    const yi = (ring[i][1] - origin[1]) * DEG_TO_M_LAT;
    const xj = (ring[j][0] - origin[0]) * DEG_TO_M_LON;
    const yj = (ring[j][1] - origin[1]) * DEG_TO_M_LAT;
    area += xj * yi - xi * yj;
  }
  return Math.abs(area / 2);
}

// ── Overpass ──────────────────────────────────────────────────────────────────

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
          const wait = attempt * 12_000;
          console.log(`    Overpass ${resp.status} → waiting ${wait / 1000}s...`);
          await sleep(wait);
          continue;
        }
        if (!resp.ok) { console.warn(`    Overpass ${resp.status} from ${ep}`); continue; }
        const json: any = await resp.json();
        return json.elements ?? [];
      } catch (err: any) {
        if (attempt < RETRIES) {
          console.warn(`    Overpass error (attempt ${attempt}): ${err.message}`);
          await sleep(6_000 * attempt);
        }
      }
    }
  }
  console.warn("    All Overpass attempts failed — returning [].");
  return [];
}

// ── query builders ────────────────────────────────────────────────────────────

function parkingQuery(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:60];
(
  node["amenity"="parking"](around:${radius},${lat},${lon});
  way["amenity"="parking"](around:${radius},${lat},${lon});
  relation["amenity"="parking"](around:${radius},${lat},${lon});
  node["amenity"="parking_entrance"](around:${radius},${lat},${lon});
);
out center tags;`;
}

function amenityQuery(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:60];
(
  node["amenity"="toilets"](around:${radius},${lat},${lon});
  way["amenity"="toilets"](around:${radius},${lat},${lon});
  node["amenity"="drinking_water"](around:${radius},${lat},${lon});
  node["drinking_water"="yes"](around:${radius},${lat},${lon});
  node["leisure"="picnic_table"](around:${radius},${lat},${lon});
  node["amenity"="bench"](around:${radius},${lat},${lon});
  node["amenity"="shelter"](around:${radius},${lat},${lon});
  way["amenity"="shelter"](around:${radius},${lat},${lon});
  node["tourism"="information"](around:${radius},${lat},${lon});
  node["information"~"board|guidepost|map"](around:${radius},${lat},${lon});
  node["amenity"="waste_basket"](around:${radius},${lat},${lon});
  node["amenity"="waste_disposal"]["waste"="dog_excrement"](around:${radius},${lat},${lon});
);
out center tags;`;
}

// ── POI parsing ───────────────────────────────────────────────────────────────

function classifyKind(tags: Record<string, string>): POIKind | null {
  const a = tags.amenity, l = tags.leisure, t = tags.tourism, i = tags.information;
  if (a === "parking")          return "parking";
  if (a === "parking_entrance") return "parking_entrance";
  if (a === "toilets")          return "toilets";
  if (a === "drinking_water" || tags.drinking_water === "yes") return "drinking_water";
  if (l === "picnic_table")     return "picnic_table";
  if (a === "bench")            return "bench";
  if (a === "shelter")          return "shelter";
  if (t === "information" || i === "board" || i === "guidepost" || i === "map")
    return "information";
  if (a === "waste_basket")     return "waste_basket";
  if (a === "waste_disposal" && tags.waste === "dog_excrement") return "dog_waste";
  return null;
}

function trimTags(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of KEPT_TAGS) if (raw[k] != null) out[k] = raw[k];
  return out;
}

/**
 * Extract a [lon, lat] location from a raw Overpass element.
 * Handles node (lat/lon), way/relation with center (center.lat/lon),
 * and way/relation with geometry (centroid of nodes).
 */
function elementLocation(el: any): Coord | null {
  if (el.type === "node" && el.lat != null) return [el.lon, el.lat];
  if (el.center?.lat != null) return [el.center.lon, el.center.lat];
  // Fallback: centroid from geometry nodes
  const geom: { lat: number; lon: number }[] =
    el.geometry ?? el.members?.flatMap((m: any) => m.geometry ?? []) ?? [];
  if (geom.length === 0) return null;
  const sumLon = geom.reduce((s: number, n: any) => s + n.lon, 0);
  const sumLat = geom.reduce((s: number, n: any) => s + n.lat, 0);
  return [sumLon / geom.length, sumLat / geom.length];
}

/**
 * Estimate parking capacity from an element.
 * Returns null if unknown.
 */
function estimateCapacity(el: any): number | null {
  const tags: Record<string, string> = el.tags ?? {};

  // Explicit capacity tag
  if (tags.capacity) {
    const n = parseInt(tags.capacity, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }

  // Estimate from polygon area for closed ways
  if (el.type === "way" && el.geometry) {
    const ring: Coord[] = (el.geometry as { lat: number; lon: number }[]).map(
      (n) => [n.lon, n.lat],
    );
    if (ring.length >= 4) {
      const first = ring[0], last = ring[ring.length - 1];
      const closed =
        Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9;
      if (closed) {
        const areaSqm = polygonAreaM2(ring);
        const estimated = Math.floor(areaSqm / 25);
        if (estimated > 0) return estimated;
      }
    }
  }

  return null;
}

// ── parse raw elements into TrailheadPOI candidates ───────────────────────────

function parseElements(
  elements: any[],
  anchor: Coord,
  anchorLabel: AnchorLabel,
): TrailheadPOI[] {
  const pois: TrailheadPOI[] = [];
  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {};
    const kind = classifyKind(tags);
    if (!kind) continue;

    const loc = elementLocation(el);
    if (!loc) continue;

    const osmType = el.type as "node" | "way" | "relation";
    pois.push({
      osmType,
      osmId: `${osmType}/${el.id}`,
      kind,
      name: tags.name ?? null,
      location: { type: "Point", coordinates: loc },
      distanceToAnchorMeters: parseFloat(haversineM(anchor, loc).toFixed(1)),
      anchor: anchorLabel,
      tags: trimTags(tags),
    });
  }
  return pois;
}

// ── deduplication ─────────────────────────────────────────────────────────────

/**
 * Deduplicate POIs by osmId+kind across anchors.
 * Keep the instance with the smallest distanceToAnchorMeters.
 */
function deduplicatePOIs(pois: TrailheadPOI[]): TrailheadPOI[] {
  const map = new Map<string, TrailheadPOI>();
  for (const poi of pois) {
    const key = `${poi.osmId}|${poi.kind}`;
    const existing = map.get(key);
    if (!existing || poi.distanceToAnchorMeters < existing.distanceToAnchorMeters) {
      map.set(key, poi);
    }
  }
  return [...map.values()];
}

// ── logistics computation ─────────────────────────────────────────────────────

interface LogisticsResult {
  parkingCount: number;
  parkingCapacityEstimate: number | null;
  parkingFeeKnown: boolean;
  amenitiesCounts: AmenitiesCounts;
  amenitiesIndexScore: number;
  trailheadPOIs: TrailheadPOI[];
  logisticsLastComputedAt: number;
}

function computeLogistics(
  allParkingElements: Map<AnchorLabel, any[]>,
  allAmenityElements: Map<AnchorLabel, any[]>,
  anchors: Record<AnchorLabel, Coord>,
): LogisticsResult {
  // Collect all raw elements with their anchor context
  const rawParkingPOIs: TrailheadPOI[] = [];
  const rawAmenityPOIs: TrailheadPOI[] = [];

  for (const [label, els] of allParkingElements)
    rawParkingPOIs.push(...parseElements(els, anchors[label], label));
  for (const [label, els] of allAmenityElements)
    rawAmenityPOIs.push(...parseElements(els, anchors[label], label));

  // Deduplicate separately then merge
  const dedupedParking = deduplicatePOIs(rawParkingPOIs);
  const dedupedAmenity = deduplicatePOIs(rawAmenityPOIs);
  const allPOIs = deduplicatePOIs([...dedupedParking, ...dedupedAmenity]);

  // Sort by distance ascending, cap at MAX_POIS
  allPOIs.sort((a, b) => a.distanceToAnchorMeters - b.distanceToAnchorMeters);
  const cappedPOIs = allPOIs.slice(0, MAX_POIS);

  // ── Parking metrics ──
  const parkingPOIs = dedupedParking.filter((p) => p.kind === "parking");
  const parkingCount = parkingPOIs.length;

  let capacitySum: number | null = null;
  let parkingFeeKnown = false;

  // Need the raw elements for capacity estimation — rebuild a quick lookup
  const parkingEls = new Map<string, any>();
  for (const els of allParkingElements.values())
    for (const el of els)
      if (!parkingEls.has(`${el.type}/${el.id}`)) parkingEls.set(`${el.type}/${el.id}`, el);

  for (const poi of parkingPOIs) {
    if (poi.kind !== "parking") continue;
    const el = parkingEls.get(poi.osmId);
    if (el) {
      const cap = estimateCapacity(el);
      if (cap !== null) capacitySum = (capacitySum ?? 0) + cap;
      if ((el.tags?.fee ?? "").toLowerCase() === "yes") parkingFeeKnown = true;
    }
  }

  // ── Amenity counts ──
  const counts: AmenitiesCounts = {
    toilets: 0, drinking_water: 0, shelter: 0,
    information: 0, waste_basket: 0, picnic_table: 0, bench: 0,
  };
  for (const poi of cappedPOIs) {
    if (poi.kind in counts) counts[poi.kind as keyof AmenitiesCounts]++;
  }

  // ── Index score ──
  const hasParking      = parkingCount > 0 ? 1 : 0;
  const hasToilets      = counts.toilets > 0 ? 1 : 0;
  const hasWater        = counts.drinking_water > 0 ? 1 : 0;
  const hasShelter      = counts.shelter > 0 ? 1 : 0;
  const hasInfo         = counts.information > 0 ? 1 : 0;
  const hasWaste        = counts.waste_basket > 0 ? 1 : 0;
  const hasPicnicBench  = (counts.picnic_table + counts.bench) > 0 ? 1 : 0;

  const score = Math.min(1,
    0.25 * hasParking +
    0.20 * hasToilets +
    0.20 * hasWater +
    0.10 * hasShelter +
    0.10 * hasInfo +
    0.10 * hasWaste +
    0.05 * hasPicnicBench,
  );

  return {
    parkingCount,
    parkingCapacityEstimate: capacitySum,
    parkingFeeKnown,
    amenitiesCounts: counts,
    amenitiesIndexScore: parseFloat(score.toFixed(3)),
    trailheadPOIs: cappedPOIs,
    logisticsLastComputedAt: Date.now(),
  };
}

// ── InstantDB helper ──────────────────────────────────────────────────────────

function entityList(res: any, name: string): any[] {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });
  console.log("Admin SDK initialized OK\n");

  // ── fetch systems ──
  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = entityList(sysRes, "trailSystems");
  console.log(`  Total systems in DB: ${systems.length}`);

  if (cityFilter) {
    const n = cityFilter.toLowerCase();
    systems = systems.filter((s: any) => (s.city ?? "").toLowerCase().includes(n));
    console.log(`  After city="${cityFilter}": ${systems.length}`);
  }
  if (stateFilter) {
    const n = stateFilter.toLowerCase();
    systems = systems.filter((s: any) => !s.state || s.state.toLowerCase().includes(n));
    console.log(`  After state="${stateFilter}": ${systems.length}`);
  }
  if (limitArg && !Number.isNaN(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }
  if (systems.length === 0) { console.log("\nNothing to do."); return; }

  // ── fetch segments for geometry reconstruction ──
  console.log("\nFetching trailSegments...");
  const segRes = await db.query({ trailSegments: { $: { limit: 10000 } } });
  const allSegs = entityList(segRes, "trailSegments");
  console.log(`  Total segments in DB: ${allSegs.length}`);

  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegs) {
    if (!seg.systemRef) continue;
    if (!segsByRef.has(seg.systemRef)) segsByRef.set(seg.systemRef, []);
    segsByRef.get(seg.systemRef)!.push(seg);
  }

  // ── per-system loop ──
  const COL = 120;
  console.log(`\n${"─".repeat(COL)}`);
  console.log(
    "STATUS".padEnd(14) +
    "SYSTEM".padEnd(44) +
    "PARKING".padStart(9) +
    "  CAP".padStart(6) +
    "  IDX".padStart(6) +
    "  POIS".padStart(7) +
    "  T W S I".padStart(11),
  );
  console.log("─".repeat(COL));

  let processed = 0, skipped = 0;
  let sumScore = 0;
  let withParking = 0, withToilets = 0, withWater = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  const ANCHOR_LABELS: AnchorLabel[] = ["start", "end", "centroid"];

  for (const system of systems) {
    const label = (system.slug ?? system.name ?? system.id).slice(0, 43);

    // Reconstruct geometry from segments
    const segs = segsByRef.get(system.extSystemRef) ?? [];
    const systemLines: MultiLineCoords = [];
    for (const seg of segs) {
      if (!seg.geometry) continue;
      try { systemLines.push(...extractLines(seg.geometry)); } catch { /* skip */ }
    }

    if (systemLines.length === 0) {
      console.log(`${"SKIP (no geom)".padEnd(14)}${label}`);
      skipped++;
      continue;
    }

    const anchors = deriveAnchors(systemLines);
    if (!anchors) {
      console.log(`${"SKIP (no anchor)".padEnd(14)}${label}`);
      skipped++;
      continue;
    }

    if ((system.lengthMilesTotal as number ?? 0) < 1) {
      console.log(`${"SKIP (<1mi)".padEnd(14)}${label}`);
      skipped++;
      continue;
    }

    // Deduplicate anchors: if start ≈ end (loop trail) or centroid ≈ start,
    // skip duplicates to avoid redundant Overpass calls.
    const uniqueAnchors: { label: AnchorLabel; coord: Coord }[] = [];
    const seen = new Set<string>();
    for (const al of ANCHOR_LABELS) {
      const c = anchors[al];
      // Round to ~10m precision for dedup check
      const key = `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
      if (!seen.has(key)) { seen.add(key); uniqueAnchors.push({ label: al, coord: c }); }
    }

    // Run Overpass queries for each unique anchor
    const allParkingEls  = new Map<AnchorLabel, any[]>();
    const allAmenityEls  = new Map<AnchorLabel, any[]>();

    for (const { label: al, coord } of uniqueAnchors) {
      const [lon, lat] = coord;
      try {
        const pEls = await overpassPost(parkingQuery(lat, lon, parkingRadius));
        allParkingEls.set(al, pEls);
        await sleep(600);

        const aEls = await overpassPost(amenityQuery(lat, lon, amenityRadius));
        allAmenityEls.set(al, aEls);
        await sleep(600);
      } catch (err: any) {
        console.warn(`  ERROR (Overpass) for ${label}/${al}: ${err.message}`);
        allParkingEls.set(al, []);
        allAmenityEls.set(al, []);
      }
    }

    // Compute
    let result: LogisticsResult;
    try {
      result = computeLogistics(allParkingEls, allAmenityEls, anchors);
    } catch (err: any) {
      console.warn(`  ERROR (compute) for ${label}: ${err.message}`);
      continue;
    }

    processed++;
    sumScore += result.amenitiesIndexScore;
    if (result.parkingCount > 0) withParking++;
    if (result.amenitiesCounts.toilets > 0) withToilets++;
    if (result.amenitiesCounts.drinking_water > 0) withWater++;

    const status = isDryRun ? "WOULD UPDATE" : "UPDATE";
    const capStr = result.parkingCapacityEstimate != null
      ? String(result.parkingCapacityEstimate)
      : " n/a";
    const c = result.amenitiesCounts;
    const twsi = `${c.toilets} ${c.drinking_water} ${c.shelter} ${c.information}`;
    console.log(
      `${status.padEnd(14)}${label.padEnd(44)}` +
      `${String(result.parkingCount).padStart(9)}` +
      `${capStr.padStart(6)}` +
      `${result.amenitiesIndexScore.toFixed(2).padStart(6)}` +
      `${String(result.trailheadPOIs.length).padStart(7)}` +
      `  ${twsi}`,
    );

    if (isVerbose && result.trailheadPOIs.length > 0) {
      const parking = result.trailheadPOIs.filter((p) => p.kind === "parking").slice(0, 3);
      for (const p of parking) {
        console.log(
          `    [parking] ${p.name ?? "(unnamed)"} ` +
          `@[${p.location.coordinates.map((v) => v.toFixed(5)).join(",")}] ` +
          `${p.distanceToAnchorMeters}m (${p.anchor})` +
          (p.tags.fee ? ` fee=${p.tags.fee}` : "") +
          (p.tags.capacity ? ` cap=${p.tags.capacity}` : ""),
        );
      }
    }

    const payload: Record<string, any> = {
      parkingCount:            result.parkingCount,
      parkingFeeKnown:         result.parkingFeeKnown,
      amenitiesCounts:         result.amenitiesCounts,
      amenitiesIndexScore:     result.amenitiesIndexScore,
      trailheadPOIs:           result.trailheadPOIs,
      logisticsLastComputedAt: result.logisticsLastComputedAt,
    };
    if (result.parkingCapacityEstimate !== null)
      payload.parkingCapacityEstimate = result.parkingCapacityEstimate;

    updates.push({ systemId: system.id, payload });
  }

  console.log("─".repeat(COL));

  // ── summary ──
  const avgIdx = processed > 0 ? (sumScore / processed).toFixed(3) : "n/a";
  const pct = (n: number) => processed > 0 ? ((n / processed) * 100).toFixed(1) + "%" : "n/a";

  console.log("\n=== LOGISTICS ENRICHMENT SUMMARY ===");
  console.log(`Systems processed:       ${processed}`);
  console.log(`Systems skipped:         ${skipped}  (no geometry/anchor)`);
  console.log(`Avg amenitiesIndexScore: ${avgIdx}`);
  console.log(`With parking:            ${withParking} (${pct(withParking)})`);
  console.log(`With toilets:            ${withToilets} (${pct(withToilets)})`);
  console.log(`With drinking water:     ${withWater} (${pct(withWater)})`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist changes to InstantDB.");
    return;
  }

  if (updates.length === 0) { console.log("\nNothing to write."); return; }

  console.log(`\nWriting ${updates.length} system update(s)...`);
  const BATCH = 25; // POI arrays can be large
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    const txSteps = chunk.map(({ systemId, payload }) =>
      (db as any).tx.trailSystems[systemId].update(payload),
    );
    await db.transact(txSteps);
    written += chunk.length;
    console.log(`  Written ${written}/${updates.length}...`);
  }

  console.log(`\nDone. ${written} system(s) enriched with logistics data.`);
  console.log("=====================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
