#!/usr/bin/env npx tsx
/**
 * Crowd Proxy enrichment for trailSystems (OSM + logistics signals).
 *
 * For each trailSystem:
 *   1. Derive anchor points (start, end, centroid) from segment geometry
 *   2. Gather crowd-intensity signals near anchors:
 *        A) Parking capacity proxy (reuses parkingCapacityEstimate if present)
 *        B) Amenity density proxy (reuses amenitiesCounts if present)
 *        C) Entrances / transit / bike-parking access points
 *        D) Urban adjacency (landuse polygons + food amenities)
 *   3. Combine into crowdProxyScore (0..1) and crowdClass (low/medium/high)
 *   4. Derive reactiveDogFriendly flag (crowdClass == "low")
 *   5. Persist compact signals + reasons onto trailSystems
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-crowd.ts \
 *     --city "Austin" --state "TX" \
 *     [--anchorRadius 400] [--amenityRadius 250] [--parkingRadius 500] \
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

const args          = parseArgs(process.argv.slice(2));
const cityFilter    = typeof args.city           === "string" ? args.city           : undefined;
const stateFilter   = typeof args.state          === "string" ? args.state          : undefined;
const limitArg      = typeof args.limit          === "string" ? parseInt(args.limit, 10) : undefined;
const anchorRadius  = typeof args.anchorRadius   === "string" ? parseFloat(args.anchorRadius)  : 400;
const amenityRadius = typeof args.amenityRadius  === "string" ? parseFloat(args.amenityRadius) : 250;
const parkingRadius = typeof args.parkingRadius  === "string" ? parseFloat(args.parkingRadius) : 500;
const isDryRun      = !args.write;
const isVerbose     = !!args.verbose;

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
console.log("anchorRadius:   ", anchorRadius, "m");
console.log("amenityRadius:  ", amenityRadius, "m");
console.log("parkingRadius:  ", parkingRadius, "m");
console.log("mode:           ", isDryRun ? "DRY RUN (pass --write to persist)" : "WRITE");
console.log("verbose:        ", isVerbose);
console.log("==============\n");

// ── types ─────────────────────────────────────────────────────────────────────
type Coord         = [number, number]; // [lon, lat]
type MultiLineCoords = Coord[][];
type AnchorLabel = "start" | "end" | "centroid";

interface CrowdSignals {
  parkingCapacity: number | null;
  parkingScore: number;
  amenityScore: number;
  entranceCount: number;
  busStopCount: number;
  bikeParkingCount: number;
  entranceScore: number;
  urbanScore: number;
}

type CrowdClass = "low" | "medium" | "high" | "unknown";

interface CrowdResult {
  crowdProxyScore: number;
  crowdClass: CrowdClass;
  reactiveDogFriendly: boolean;
  crowdSignals: CrowdSignals;
  crowdReasons: string[];
  crowdLastComputedAt: number;
}

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
 * start    = first coord of first line
 * end      = last coord of last line
 * centroid = arithmetic mean of all coordinates
 */
function deriveAnchors(lines: MultiLineCoords): Record<AnchorLabel, Coord> | null {
  if (lines.length === 0) return null;
  const firstLine = lines[0];
  const lastLine  = lines[lines.length - 1];
  if (firstLine.length === 0 || lastLine.length === 0) return null;

  const start: Coord = [firstLine[0][0], firstLine[0][1]];
  const end:   Coord = [lastLine[lastLine.length - 1][0], lastLine[lastLine.length - 1][1]];

  let sumLon = 0, sumLat = 0, n = 0;
  for (const line of lines)
    for (const [lon, lat] of line) { sumLon += lon; sumLat += lat; n++; }
  const centroid: Coord = n > 0
    ? [sumLon / n, sumLat / n]
    : [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];

  return { start, end, centroid };
}

/** Deduplicate anchors by ~10m precision key. */
function uniqueAnchors(
  anchors: Record<AnchorLabel, Coord>,
): { label: AnchorLabel; coord: Coord }[] {
  const result: { label: AnchorLabel; coord: Coord }[] = [];
  const seen = new Set<string>();
  for (const label of ["start", "end", "centroid"] as AnchorLabel[]) {
    const c = anchors[label];
    const key = `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
    if (!seen.has(key)) { seen.add(key); result.push({ label, coord: c }); }
  }
  return result;
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

function parkingQueryAround(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:60];
(
  node["amenity"="parking"](around:${radius},${lat},${lon});
  way["amenity"="parking"](around:${radius},${lat},${lon});
  relation["amenity"="parking"](around:${radius},${lat},${lon});
);
out center tags;`;
}

function amenityQueryAround(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:60];
(
  node["amenity"="toilets"](around:${radius},${lat},${lon});
  way["amenity"="toilets"](around:${radius},${lat},${lon});
  node["amenity"="drinking_water"](around:${radius},${lat},${lon});
  node["leisure"="picnic_table"](around:${radius},${lat},${lon});
  node["amenity"="bench"](around:${radius},${lat},${lon});
  node["amenity"="shelter"](around:${radius},${lat},${lon});
  way["amenity"="shelter"](around:${radius},${lat},${lon});
  node["tourism"="information"](around:${radius},${lat},${lon});
  node["information"~"board|guidepost|map"](around:${radius},${lat},${lon});
  node["amenity"="waste_basket"](around:${radius},${lat},${lon});
);
out center tags;`;
}

function entranceQueryAround(lat: number, lon: number, radius: number): string {
  return `[out:json][timeout:60];
(
  node["entrance"](around:${radius},${lat},${lon});
  node["highway"="bus_stop"](around:${radius},${lat},${lon});
  node["amenity"="bicycle_parking"](around:${radius},${lat},${lon});
);
out tags;`;
}

/** Urban adjacency — centroid only, fixed 600m radius. */
function urbanQueryAround(lat: number, lon: number): string {
  return `[out:json][timeout:60];
(
  way["landuse"~"residential|commercial|retail|industrial"](around:600,${lat},${lon});
  relation["landuse"~"residential|commercial|retail|industrial"](around:600,${lat},${lon});
  node["amenity"~"restaurant|cafe|bar|fast_food"](around:600,${lat},${lon});
);
out center tags;`;
}

// ── capacity estimation (polygon area / 25 sqm per space) ────────────────────

function polygonAreaM2(ring: Coord[]): number {
  if (ring.length < 4) return 0;
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

function estimateCapacityFromEl(el: any): number | null {
  const tags: Record<string, string> = el.tags ?? {};
  if (tags.capacity) {
    const n = parseInt(tags.capacity, 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  if (el.type === "way" && el.geometry) {
    const ring: Coord[] = (el.geometry as { lat: number; lon: number }[]).map(
      (n) => [n.lon, n.lat],
    );
    if (ring.length >= 4) {
      const first = ring[0], last = ring[ring.length - 1];
      const closed =
        Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9;
      if (closed) {
        const estimated = Math.floor(polygonAreaM2(ring) / 25);
        if (estimated > 0) return estimated;
      }
    }
  }
  return null;
}

// ── signal scoring ────────────────────────────────────────────────────────────

/** A) Parking capacity → parkingScore ∈ [0,1] */
function scoreParkingCapacity(capacity: number | null): number {
  if (capacity === null || capacity <= 0) return 0;
  return Math.min(1, Math.log1p(capacity) / Math.log1p(300));
}

/**
 * B) Amenity density → amenityScore ∈ [0,1]
 * Accepts the amenitiesCounts record from trailSystems (logistics enrichment)
 * or a freshly-counted version.
 */
function scoreAmenities(counts: {
  toilets?: number;
  drinking_water?: number;
  information?: number;
  shelter?: number;
  picnic_table?: number;
  bench?: number;
  waste_basket?: number;
}): number {
  const hasToilets       = (counts.toilets       ?? 0) > 0 ? 1 : 0;
  const hasWater         = (counts.drinking_water ?? 0) > 0 ? 1 : 0;
  const hasInfo          = (counts.information    ?? 0) > 0 ? 1 : 0;
  const hasShelter       = (counts.shelter        ?? 0) > 0 ? 1 : 0;
  const hasPicnicOrBench = ((counts.picnic_table  ?? 0) + (counts.bench ?? 0)) > 0 ? 1 : 0;
  const hasWaste         = (counts.waste_basket   ?? 0) > 0 ? 1 : 0;

  return Math.min(1,
    0.25 * hasToilets +
    0.25 * hasWater   +
    0.15 * hasInfo    +
    0.15 * hasShelter +
    0.10 * hasPicnicOrBench +
    0.10 * hasWaste,
  );
}

/** C) Entrance / transit / bike-parking → entranceScore ∈ [0,1] */
function scoreEntrance(
  entranceCount: number,
  busStopCount: number,
  bikeParkingCount: number,
): number {
  const weighted = entranceCount + 0.5 * busStopCount + 0.25 * bikeParkingCount;
  return Math.min(1, Math.log1p(weighted) / Math.log1p(25));
}

/** D) Urban adjacency → urbanScore ∈ [0,1] */
function scoreUrban(elements: any[]): number {
  let score = 0;
  let foodCount = 0;
  let hasCommercial = false;
  let hasResidential = false;

  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {};
    const landuse = tags.landuse ?? "";
    const amenity = tags.amenity ?? "";

    if (landuse === "commercial" || landuse === "retail") hasCommercial = true;
    if (landuse === "residential")                         hasResidential = true;
    if (amenity === "restaurant" || amenity === "cafe" ||
        amenity === "bar"        || amenity === "fast_food") foodCount++;
  }

  if (hasCommercial) score += 0.6;
  if (hasResidential) score += 0.4;
  if (foodCount > 10) score += 0.1;

  return Math.min(1, score);
}

// ── combine signals ───────────────────────────────────────────────────────────

const CROWD_WEIGHTS = {
  parking: 0.45,
  amenity: 0.20,
  entrance: 0.20,
  urban: 0.15,
} as const;

function computeCrowdScore(signals: CrowdSignals): number {
  return Math.min(1, Math.max(0,
    CROWD_WEIGHTS.parking  * signals.parkingScore  +
    CROWD_WEIGHTS.amenity  * signals.amenityScore  +
    CROWD_WEIGHTS.entrance * signals.entranceScore +
    CROWD_WEIGHTS.urban    * signals.urbanScore,
  ));
}

function classifyCrowd(score: number): CrowdClass {
  if (score < 0.33)  return "low";
  if (score < 0.66)  return "medium";
  return "high";
}

function buildReasons(signals: CrowdSignals): string[] {
  const reasons: string[] = [];
  if (signals.parkingScore  >= 0.7) reasons.push("Large parking nearby");
  if (signals.amenityScore  >= 0.7) reasons.push("Many trailhead amenities");
  if (signals.entranceScore >= 0.7) reasons.push("Many entrances / access points");
  if (signals.urbanScore    >= 0.7) reasons.push("Near residential/commercial areas");
  if (reasons.length === 0)         reasons.push("Low access infrastructure nearby");
  return reasons.slice(0, 5);
}

// ── amenity count from fresh Overpass elements ────────────────────────────────

function countAmenitiesFromElements(elements: any[]): {
  toilets: number;
  drinking_water: number;
  shelter: number;
  information: number;
  picnic_table: number;
  bench: number;
  waste_basket: number;
} {
  const c = { toilets: 0, drinking_water: 0, shelter: 0, information: 0,
               picnic_table: 0, bench: 0, waste_basket: 0 };
  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {};
    const a = tags.amenity, l = tags.leisure, t = tags.tourism, i = tags.information;
    if (a === "toilets")           c.toilets++;
    if (a === "drinking_water")    c.drinking_water++;
    if (a === "shelter")           c.shelter++;
    if (t === "information" || i === "board" || i === "guidepost" || i === "map")
                                   c.information++;
    if (l === "picnic_table")      c.picnic_table++;
    if (a === "bench")             c.bench++;
    if (a === "waste_basket")      c.waste_basket++;
  }
  return c;
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
  const COL = 110;
  console.log(`\n${"─".repeat(COL)}`);
  console.log(
    "STATUS".padEnd(14) +
    "SYSTEM".padEnd(44) +
    "SCORE".padStart(7) +
    "  CLASS".padStart(9) +
    "  PARK".padStart(7) +
    "  AMN".padStart(6) +
    "  ENT".padStart(6) +
    "  URB".padStart(6),
  );
  console.log("─".repeat(COL));

  let processed = 0, skipped = 0, overpassFailed = 0;
  let sumScore = 0;
  const classCounts: Record<CrowdClass, number> = { low: 0, medium: 0, high: 0, unknown: 0 };
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  // Collect top 10 for end-of-run report
  const allResults: { name: string; score: number; crowdClass: CrowdClass }[] = [];

  for (const system of systems) {
    const displayName = (system.slug ?? system.name ?? system.id).slice(0, 43);

    // Reconstruct geometry from segments
    const segs = segsByRef.get(system.extSystemRef) ?? [];
    const systemLines: MultiLineCoords = [];
    for (const seg of segs) {
      if (!seg.geometry) continue;
      try { systemLines.push(...extractLines(seg.geometry)); } catch { /* skip */ }
    }

    if (systemLines.length === 0) {
      console.log(`${"SKIP (no geom)".padEnd(14)}${displayName}`);
      skipped++;
      continue;
    }

    const anchors = deriveAnchors(systemLines);
    if (!anchors) {
      console.log(`${"SKIP (no anchor)".padEnd(14)}${displayName}`);
      skipped++;
      continue;
    }

    const uniq = uniqueAnchors(anchors);
    const centroidCoord = anchors.centroid;

    // ── A) Parking capacity ──
    // Reuse stored value when present; otherwise query Overpass
    let parkingCapacity: number | null = system.parkingCapacityEstimate ?? null;

    if (parkingCapacity === null) {
      // Try to derive from fresh Overpass query around centroid
      const [cLon, cLat] = centroidCoord;
      try {
        const parkEls = await overpassPost(parkingQueryAround(cLat, cLon, parkingRadius));
        await sleep(500);
        let capacitySum: number | null = null;
        for (const el of parkEls) {
          const cap = estimateCapacityFromEl(el);
          if (cap !== null) capacitySum = (capacitySum ?? 0) + cap;
        }
        parkingCapacity = capacitySum;
      } catch (err: any) {
        console.warn(`  WARN (parking Overpass) for ${displayName}: ${err.message}`);
      }
    }

    const parkingScore = scoreParkingCapacity(parkingCapacity);

    // ── B) Amenity density ──
    // Reuse stored amenitiesCounts when present; otherwise query
    let rawCounts: { toilets?: number; drinking_water?: number; shelter?: number;
                     information?: number; picnic_table?: number; bench?: number;
                     waste_basket?: number } = {};

    if (system.amenitiesCounts && typeof system.amenitiesCounts === "object") {
      rawCounts = system.amenitiesCounts as typeof rawCounts;
    } else {
      // Query around centroid (deduplication is overkill here — we just need presence booleans)
      const [cLon, cLat] = centroidCoord;
      try {
        const amnEls = await overpassPost(amenityQueryAround(cLat, cLon, amenityRadius));
        await sleep(500);
        rawCounts = countAmenitiesFromElements(amnEls);
      } catch (err: any) {
        console.warn(`  WARN (amenity Overpass) for ${displayName}: ${err.message}`);
      }
    }

    const amenityScore = scoreAmenities(rawCounts);

    // ── C) Entrances / transit / bike-parking ──
    // Query around each unique anchor, deduplicate by osmId
    const seenEntranceIds = new Set<string>();
    let entranceCount = 0, busStopCount = 0, bikeParkingCount = 0;
    let anyEntranceFailed = false;

    for (const { coord } of uniq) {
      const [lon, lat] = coord;
      try {
        const els = await overpassPost(entranceQueryAround(lat, lon, anchorRadius));
        await sleep(500);
        for (const el of els) {
          const osmId = `${el.type}/${el.id}`;
          if (seenEntranceIds.has(osmId)) continue;
          seenEntranceIds.add(osmId);
          const tags: Record<string, string> = el.tags ?? {};
          if (tags.entrance !== undefined)          entranceCount++;
          if (tags.highway === "bus_stop")           busStopCount++;
          if (tags.amenity === "bicycle_parking")    bikeParkingCount++;
        }
      } catch (err: any) {
        console.warn(`  WARN (entrance Overpass) for ${displayName}: ${err.message}`);
        anyEntranceFailed = true;
      }
    }

    const entranceScore = scoreEntrance(entranceCount, busStopCount, bikeParkingCount);

    // ── D) Urban adjacency ── (centroid only, 600m hardcoded)
    let urbanElements: any[] = [];
    try {
      const [cLon, cLat] = centroidCoord;
      urbanElements = await overpassPost(urbanQueryAround(cLat, cLon));
      await sleep(500);
    } catch (err: any) {
      console.warn(`  WARN (urban Overpass) for ${displayName}: ${err.message}`);
    }

    const urbanScore = scoreUrban(urbanElements);

    // ── mark Overpass failure ──
    if (anyEntranceFailed) overpassFailed++;

    // ── combine ──
    const signals: CrowdSignals = {
      parkingCapacity,
      parkingScore:  parseFloat(parkingScore.toFixed(3)),
      amenityScore:  parseFloat(amenityScore.toFixed(3)),
      entranceCount,
      busStopCount,
      bikeParkingCount,
      entranceScore: parseFloat(entranceScore.toFixed(3)),
      urbanScore:    parseFloat(urbanScore.toFixed(3)),
    };

    const rawScore     = computeCrowdScore(signals);
    const crowdScore   = parseFloat(rawScore.toFixed(3));
    const crowdClass   = classifyCrowd(crowdScore);
    const reasons      = buildReasons(signals);
    const reactive     = crowdClass === "low";

    processed++;
    sumScore += crowdScore;
    classCounts[crowdClass]++;
    allResults.push({ name: system.slug ?? system.name ?? system.id, score: crowdScore, crowdClass });

    const status = isDryRun ? "WOULD UPDATE" : "UPDATE";
    console.log(
      `${status.padEnd(14)}${displayName.padEnd(44)}` +
      `${crowdScore.toFixed(3).padStart(7)}` +
      `  ${crowdClass.padEnd(7)}` +
      `  ${parkingScore.toFixed(2).padStart(5)}` +
      `  ${amenityScore.toFixed(2).padStart(4)}` +
      `  ${entranceScore.toFixed(2).padStart(4)}` +
      `  ${urbanScore.toFixed(2).padStart(4)}`,
    );

    if (isVerbose) {
      console.log(`    reasons: ${reasons.join(" | ")}`);
      console.log(`    park capacity=${parkingCapacity ?? "n/a"} entrances=${entranceCount} bus=${busStopCount} bike=${bikeParkingCount}`);
    }

    const payload: Record<string, any> = {
      crowdProxyScore:       crowdScore,
      crowdClass,
      reactiveDogFriendly:   reactive,
      crowdSignals:          signals,
      crowdReasons:          reasons,
      crowdLastComputedAt:   Date.now(),
    };
    updates.push({ systemId: system.id, payload });
  }

  console.log("─".repeat(COL));

  // ── summary ──
  const avgScore = processed > 0 ? (sumScore / processed).toFixed(3) : "n/a";
  const pct = (n: number) => processed > 0 ? ((n / processed) * 100).toFixed(1) + "%" : "n/a";

  console.log("\n=== CROWD PROXY ENRICHMENT SUMMARY ===");
  console.log(`Systems processed:        ${processed}`);
  console.log(`Systems skipped:          ${skipped}  (no geometry/anchor)`);
  console.log(`Avg crowdProxyScore:      ${avgScore}`);
  console.log(`crowdClass=low:           ${classCounts.low}  (${pct(classCounts.low)})`);
  console.log(`crowdClass=medium:        ${classCounts.medium}  (${pct(classCounts.medium)})`);
  console.log(`crowdClass=high:          ${classCounts.high}  (${pct(classCounts.high)})`);
  console.log(`Overpass partial fails:   ${overpassFailed}`);

  // Top 10 by crowdProxyScore
  const top10 = [...allResults].sort((a, b) => b.score - a.score).slice(0, 10);
  if (top10.length > 0) {
    console.log("\nTop 10 highest crowdProxyScore:");
    for (let i = 0; i < top10.length; i++) {
      const { name, score, crowdClass } = top10[i];
      console.log(`  ${String(i + 1).padStart(2)}. ${name.padEnd(50)} ${score.toFixed(3)}  [${crowdClass}]`);
    }
  }

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist changes to InstantDB.");
    return;
  }

  if (updates.length === 0) { console.log("\nNothing to write."); return; }

  console.log(`\nWriting ${updates.length} system update(s)...`);
  const BATCH = 25;
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

  console.log(`\nDone. ${written} system(s) enriched with crowd proxy data.`);
  console.log("=======================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
