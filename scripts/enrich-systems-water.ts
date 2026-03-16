#!/usr/bin/env npx tsx
/**
 * Water Access enrichment for trailSystems (OSM-derived).
 *
 * For each trailSystem:
 *   1. Reconstruct geometry from trailSegments
 *   2. Query A — water features (natural=water/river/stream, waterway=*)
 *      → build in-memory geometries for proximity checks
 *   3. Query B — access point candidates (beach, ford, pier/slipway, steps near water, drinking_water)
 *   4. For each candidate:
 *        - compute marker location (node → lat/lon; way/relation → centroid)
 *        - compute distanceToTrailMeters
 *        - compute distanceToWaterMeters (for swim-related kinds)
 *        - apply filtering rules
 *        - build SwimAccessPoint object
 *   5. Sort → deduplicate → cap at 50
 *   6. Compute waterNearPercent / waterNearScore / waterTypesNearby / swimLikely
 *   7. Persist all fields to trailSystems
 *
 * DRY RUN by default.  Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-water.ts \
 *     --city "Austin" --state "TX" \
 *     [--limit 5] [--write] [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

// ── env ──────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function loadEnvLocal(rootDir: string): void {
  const envPath = join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
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

const args       = parseArgs(process.argv.slice(2));
const cityFilter  = typeof args.city  === "string" ? args.city  : undefined;
const stateFilter = typeof args.state === "string" ? args.state : undefined;
const limitArg    = typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
const isDryRun    = !args.write;
const isVerbose   = !!args.verbose;
const minLength   = typeof args["min-length"] === "string" ? parseFloat(args["min-length"]) : undefined;

if (!cityFilter) { console.error("Error: --city is required"); process.exit(1); }

// ── InstantDB ────────────────────────────────────────────────────────────────
const appId      = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
if (!appId)      { console.error("Error: INSTANT_APP_ID missing");       process.exit(1); }
if (!adminToken) { console.error("Error: INSTANT_ADMIN_TOKEN missing");  process.exit(1); }

function maskToken(t: string | undefined) {
  if (!t || t.length < 10) return t ? "***" : "(none)";
  return t.slice(0, 6) + "..." + t.slice(-4);
}

console.log("=== CONFIG ===");
console.log("appId:    ", appId);
console.log("token:    ", maskToken(adminToken));
console.log("city:     ", cityFilter);
console.log("state:    ", stateFilter ?? "(not set)");
console.log("limit:    ", limitArg ?? "(all)");
console.log("mode:     ", isDryRun ? "DRY RUN (pass --write to persist)" : "WRITE");
console.log("verbose:  ", isVerbose);
console.log("==============\n");

// ── types ────────────────────────────────────────────────────────────────────
type Coord         = [number, number];   // [lon, lat]
type LineCoords    = Coord[];
type MultiLineCoords = LineCoords[];

type AccessKind =
  | "beach"
  | "ford"
  | "pier_or_slipway"
  | "steps"
  | "drinking_water";

interface GeoJsonPoint {
  type: "Point";
  coordinates: Coord;
}

interface SwimAccessPoint {
  osmType: "node" | "way" | "relation";
  osmId: string;                       // e.g. "node/123", "way/456"
  kind: AccessKind;
  name: string | null;
  location: GeoJsonPoint;             // marker coords
  distanceToTrailMeters: number;
  distanceToWaterMeters: number | null;
  tags: Record<string, string>;       // trimmed subset
}

// Tag subset to keep (avoid huge blobs)
const KEPT_TAGS = new Set([
  "name", "natural", "waterway", "amenity", "man_made",
  "ford", "highway", "access", "surface",
]);

// ── geometry helpers (no external deps) ──────────────────────────────────────

function haversineM(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180, φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function extractLines(geom: any): MultiLineCoords {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString")      return [geom.coordinates as LineCoords];
  if (geom.type === "MultiLineString") return geom.coordinates as MultiLineCoords;
  return [];
}

function bboxOfLines(
  lines: MultiLineCoords,
  buf = 0.002,
): [number, number, number, number] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const line of lines)
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon; if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon; if (lat > maxLat) maxLat = lat;
    }
  return minLon === Infinity
    ? null
    : [minLon - buf, minLat - buf, maxLon + buf, maxLat + buf];
}

/** Minimum distance from a point to any segment of any line in a MultiLine. */
function pointToMultiLineDistM(p: Coord, lines: MultiLineCoords): number {
  let best = Infinity;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const lenSq = dx * dx + dy * dy;
      let closest: Coord;
      if (lenSq === 0) {
        closest = a;
      } else {
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
        closest = [a[0] + t * dx, a[1] + t * dy];
      }
      const d = haversineM(p, closest);
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Compute centroid of a polygon/linestring given raw OSM geometry nodes
 * [{lat, lon}].  Returns [lon, lat].
 */
function osmGeomCentroid(nodes: { lat: number; lon: number }[]): Coord | null {
  if (!nodes || nodes.length === 0) return null;
  let sumLon = 0, sumLat = 0;
  for (const n of nodes) { sumLon += n.lon; sumLat += n.lat; }
  return [sumLon / nodes.length, sumLat / nodes.length];
}

// ── Overpass helpers ──────────────────────────────────────────────────────────

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

// ── Overpass query builders ───────────────────────────────────────────────────

function bboxStr([minLon, minLat, maxLon, maxLat]: [number, number, number, number]) {
  // Overpass uses (minLat,minLon,maxLat,maxLon)
  return `${minLat},${minLon},${maxLat},${maxLon}`;
}

/** Query A — water features for proximity measurement. */
function waterFeaturesQuery(bbox: [number, number, number, number]): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:60];
(
  way["natural"~"^(water|bay|strait)$"](${b});
  way["waterway"~"^(river|stream|canal|drain)$"](${b});
  relation["natural"="water"](${b});
  node["natural"~"^(water|spring)$"](${b});
);
out geom;`;
}

/** Query B — swim / water access point candidates. */
function accessPointsQuery(bbox: [number, number, number, number]): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:60];
(
  node["natural"="beach"](${b});
  way["natural"="beach"](${b});
  node["ford"="yes"](${b});
  way["ford"="yes"](${b});
  node["highway"="ford"](${b});
  way["highway"="ford"](${b});
  node["man_made"~"^(pier|slipway)$"](${b});
  way["man_made"~"^(pier|slipway)$"](${b});
  node["highway"="steps"]["waterway"](${b});
  node["amenity"="drinking_water"](${b});
  node["drinking_water"="yes"](${b});
);
out geom tags;`;
}

// ── water geometry index ──────────────────────────────────────────────────────

/**
 * Build a flat list of MultiLineCoords from raw Overpass water-feature elements.
 * Used only for distanceToWater computation.
 */
function buildWaterLines(elements: any[]): MultiLineCoords {
  const lines: MultiLineCoords = [];
  for (const el of elements) {
    if (el.type === "node" && el.lat != null) {
      // Treat as a degenerate point-segment
      const p: Coord = [el.lon, el.lat];
      lines.push([p, p]);
    } else if (el.geometry && Array.isArray(el.geometry)) {
      const coords: Coord[] = el.geometry.map((n: any) => [n.lon, n.lat]);
      if (coords.length >= 2) lines.push(coords);
    }
  }
  return lines;
}

// ── access-kind classification ────────────────────────────────────────────────

function classifyKind(tags: Record<string, string>): AccessKind | null {
  if (tags.natural === "beach")                         return "beach";
  if (tags.ford === "yes" || tags.highway === "ford")   return "ford";
  if (tags.man_made === "pier" || tags.man_made === "slipway") return "pier_or_slipway";
  if (tags.highway === "steps" && tags.waterway)        return "steps";
  if (tags.amenity === "drinking_water" || tags.drinking_water === "yes")
    return "drinking_water";
  return null;
}

function trimTags(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of KEPT_TAGS) if (raw[k] != null) out[k] = raw[k];
  return out;
}

// ── water types nearby (from water features) ─────────────────────────────────

function waterTypesFromElements(elements: any[]): string[] {
  const types = new Set<string>();
  for (const el of elements) {
    const t = el.tags ?? {};
    if (t.natural === "water") types.add("lake_or_pond");
    else if (t.natural === "beach") types.add("beach");
    else if (t.waterway === "river") types.add("river");
    else if (t.waterway === "stream") types.add("stream");
    else if (t.waterway === "canal") types.add("canal");
    else if (t.natural === "spring") types.add("spring");
  }
  return [...types];
}

// ── main enrichment per system ────────────────────────────────────────────────

const TRAIL_SNAP_M     = 75;  // max distanceToTrail for all kinds
const STEPS_SNAP_M     = 50;  // tighter snap for steps
const WATER_SNAP_M     = 100; // max distanceToWater for swim kinds
const MAX_POINTS       = 50;

interface WaterResult {
  waterNearPercent: number;
  waterNearScore: number;
  waterTypesNearby: string[];
  swimLikely: boolean;
  swimAccessPoints: SwimAccessPoint[];
  swimAccessPointsCount: number;
  swimAccessPointsByType: Record<string, number>;
  waterLastComputedAt: number;
}

async function enrichSystem(
  system: any,
  systemLines: MultiLineCoords,
): Promise<WaterResult> {
  const bbox = bboxOfLines(systemLines, 0.002)!;

  // ── Query A: water features ──
  const waterElements = await overpassPost(waterFeaturesQuery(bbox));
  await sleep(800);

  const waterLines   = buildWaterLines(waterElements);
  const waterTypes   = waterTypesFromElements(waterElements);

  // waterNearPercent: what fraction of trail segments are within 200m of water
  // Approximate: sample the midpoints of each system line segment
  let sampleTotal = 0, sampleNear = 0;
  const WATER_NEAR_M = 200;
  for (const line of systemLines) {
    for (let i = 1; i < line.length; i++) {
      const mid: Coord = [(line[i-1][0] + line[i][0]) / 2, (line[i-1][1] + line[i][1]) / 2];
      const d = waterLines.length > 0 ? pointToMultiLineDistM(mid, waterLines) : Infinity;
      sampleTotal++;
      if (d <= WATER_NEAR_M) sampleNear++;
    }
  }
  // Fallback if geometry has no segments
  if (sampleTotal === 0) sampleTotal = 1;
  const waterNearPercent = parseFloat((sampleNear / sampleTotal).toFixed(4));
  const waterNearScore   = waterNearPercent; // v1: same as percent

  // ── Query B: access point candidates ──
  const accessElements = await overpassPost(accessPointsQuery(bbox));
  await sleep(800);

  // ── Build SwimAccessPoint list ──
  const candidates: SwimAccessPoint[] = [];

  for (const el of accessElements) {
    const rawTags: Record<string, string> = el.tags ?? {};
    const kind = classifyKind(rawTags);
    if (!kind) continue;

    // Marker location
    let markerCoord: Coord | null = null;
    if (el.type === "node") {
      if (el.lat == null) continue;
      markerCoord = [el.lon, el.lat];
    } else if (el.type === "way" || el.type === "relation") {
      const geomNodes: { lat: number; lon: number }[] =
        el.geometry ?? el.members?.flatMap((m: any) => m.geometry ?? []) ?? [];
      markerCoord = osmGeomCentroid(geomNodes);
    }
    if (!markerCoord) continue;

    const osmType = el.type as "node" | "way" | "relation";
    const osmId   = `${osmType}/${el.id}`;

    // distanceToTrail
    const distToTrail = pointToMultiLineDistM(markerCoord, systemLines);

    // Apply trail snap filter (kind-specific)
    const maxTrail = kind === "steps" ? STEPS_SNAP_M : TRAIL_SNAP_M;
    if (distToTrail > maxTrail) continue;

    // distanceToWater (swim-relevant kinds)
    let distToWater: number | null = null;
    if (kind === "beach" || kind === "ford" || kind === "pier_or_slipway") {
      distToWater = waterLines.length > 0
        ? pointToMultiLineDistM(markerCoord, waterLines)
        : null;
      if (distToWater !== null && distToWater > WATER_SNAP_M) continue;
    }

    candidates.push({
      osmType,
      osmId,
      kind,
      name: rawTags.name ?? null,
      location: { type: "Point", coordinates: markerCoord },
      distanceToTrailMeters: parseFloat(distToTrail.toFixed(1)),
      distanceToWaterMeters: distToWater !== null ? parseFloat(distToWater.toFixed(1)) : null,
      tags: trimTags(rawTags),
    });
  }

  // ── Sort by distanceToTrail asc ──
  candidates.sort((a, b) => a.distanceToTrailMeters - b.distanceToTrailMeters);

  // ── Deduplicate by osmId+kind ──
  const seen = new Map<string, SwimAccessPoint>();
  for (const pt of candidates) {
    const key = `${pt.osmId}|${pt.kind}`;
    if (!seen.has(key)) seen.set(key, pt);
    // Already sorted asc → first occurrence is closest; ignore subsequent
  }
  const deduped = [...seen.values()].slice(0, MAX_POINTS);

  // ── Counts ──
  const byType: Record<string, number> = {};
  for (const pt of deduped) byType[pt.kind] = (byType[pt.kind] ?? 0) + 1;
  const swimKinds = new Set<AccessKind>(["beach", "ford", "pier_or_slipway"]);
  const swimLikely = deduped.some((p) => swimKinds.has(p.kind));

  return {
    waterNearPercent,
    waterNearScore,
    waterTypesNearby: waterTypes,
    swimLikely,
    swimAccessPoints: deduped,
    swimAccessPointsCount: deduped.length,
    swimAccessPointsByType: byType,
    waterLastComputedAt: Date.now(),
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
  if (minLength != null && minLength > 0) {
    systems = systems.filter((s: any) => (s.lengthMilesTotal ?? 0) > minLength);
    console.log(`  After min-length=${minLength}: ${systems.length}`);
  }
  if (limitArg && !Number.isNaN(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }
  if (systems.length === 0) { console.log("\nNothing to do."); return; }

  // ── fetch segments for geometry ──
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

  // ── per-system processing ──
  const COL = 120;
  console.log(`\n${"─".repeat(COL)}`);
  console.log(
    "STATUS".padEnd(14) +
    "SYSTEM".padEnd(44) +
    "WATER%".padStart(8) +
    "  SWIM?".padStart(8) +
    "  PTS".padStart(6) +
    "  TYPES".padStart(24),
  );
  console.log("─".repeat(COL));

  let processed = 0, skipped = 0;
  let sumWaterPct = 0;
  const swimCounts = { yes: 0, no: 0 };
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

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

    if ((system.lengthMilesTotal as number ?? 0) < 1) {
      console.log(`${"SKIP (<1mi)".padEnd(14)}${label}`);
      skipped++;
      continue;
    }

    const bbox = bboxOfLines(systemLines, 0.002);
    if (!bbox) {
      console.log(`${"SKIP (no bbox)".padEnd(14)}${label}`);
      skipped++;
      continue;
    }

    let result: WaterResult;
    try {
      result = await enrichSystem(system, systemLines);
    } catch (err: any) {
      console.warn(`  ERROR for ${label}: ${err.message}`);
      continue;
    }

    processed++;
    sumWaterPct += result.waterNearPercent;
    result.swimLikely ? swimCounts.yes++ : swimCounts.no++;

    const status = isDryRun ? "WOULD UPDATE" : "UPDATE";
    const typesStr = result.waterTypesNearby.join(", ").slice(0, 22) || "(none)";
    console.log(
      `${status.padEnd(14)}${label.padEnd(44)}` +
      `${(result.waterNearPercent * 100).toFixed(1).padStart(7)}%` +
      `${(result.swimLikely ? "yes" : "no").padStart(8)}` +
      `${String(result.swimAccessPointsCount).padStart(6)}` +
      `  ${typesStr}`,
    );

    if (isVerbose && result.swimAccessPoints.length > 0) {
      for (const pt of result.swimAccessPoints.slice(0, 5)) {
        console.log(
          `    [${pt.kind}] ${pt.name ?? "(unnamed)"} ` +
          `@[${pt.location.coordinates.map((v) => v.toFixed(5)).join(",")}] ` +
          `trail:${pt.distanceToTrailMeters}m` +
          (pt.distanceToWaterMeters != null ? ` water:${pt.distanceToWaterMeters}m` : ""),
        );
      }
      if (result.swimAccessPoints.length > 5)
        console.log(`    … +${result.swimAccessPoints.length - 5} more`);
    }

    updates.push({
      systemId: system.id,
      payload: {
        waterNearPercent:       result.waterNearPercent,
        waterNearScore:         result.waterNearScore,
        waterTypesNearby:       result.waterTypesNearby,
        swimLikely:             result.swimLikely,
        swimAccessPoints:       result.swimAccessPoints,
        swimAccessPointsCount:  result.swimAccessPointsCount,
        swimAccessPointsByType: result.swimAccessPointsByType,
        waterLastComputedAt:    result.waterLastComputedAt,
      },
    });
  }

  console.log("─".repeat(COL));

  // ── summary ──
  const avgWater = processed > 0
    ? ((sumWaterPct / processed) * 100).toFixed(1)
    : "n/a";

  console.log("\n=== WATER ACCESS ENRICHMENT SUMMARY ===");
  console.log(`Systems processed:      ${processed}`);
  console.log(`Systems skipped:        ${skipped}  (no geometry)`);
  console.log(`Avg waterNearPercent:   ${avgWater}%`);
  console.log(`Swim likely YES:        ${swimCounts.yes}`);
  console.log(`Swim likely NO:         ${swimCounts.no}`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist changes to InstantDB.");
    return;
  }

  if (updates.length === 0) { console.log("\nNothing to write."); return; }

  // ── write ──
  console.log(`\nWriting ${updates.length} system update(s)...`);
  const BATCH = 25; // smaller batches — swimAccessPoints JSON can be large
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

  console.log(`\nDone. ${written} system(s) enriched with water access data.`);
  console.log("=======================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
