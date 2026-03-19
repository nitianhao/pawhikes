#!/usr/bin/env npx tsx
/**
 * Shade Proxy enrichment for trailSystems (OSM-only, v1).
 *
 * For each trailSystem:
 *   1. Reconstruct geometry from trailSegments
 *   2. Query Overpass for tree/forest/park polygons and tree rows/nodes
 *   3. Sample points every N metres along the trail geometry
 *   4. For each sample point, classify shade level by proximity to shade features
 *   5. Compute shadeProxyScore / shadeProxyPercent / shadeClass
 *   6. Persist to trailSystems
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-shade.ts \
 *     --city "Austin" --state "TX" \
 *     [--sampleMeters 50] [--nearMeters 25] \
 *     [--limit 5] [--write] [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { loadOsmCategory, filterByBbox as osmFilterByBbox, type OsmLocalIndex } from "./lib/osmLocal.js";

// ── env ──────────────────────────────────────────────────────────────────────
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
    const key  = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

const args         = parseArgs(process.argv.slice(2));
const cityFilter   = typeof args.city         === "string" ? args.city         : undefined;
const stateFilter  = typeof args.state        === "string" ? args.state        : undefined;
const limitArg     = typeof args.limit        === "string" ? parseInt(args.limit, 10) : undefined;
const sampleMeters = typeof args.sampleMeters === "string" ? parseFloat(args.sampleMeters) : 50;
const nearMeters   = typeof args.nearMeters   === "string" ? parseFloat(args.nearMeters)   : 25;
const minLength    = typeof args["min-length"]  === "string" ? parseFloat(args["min-length"]) : undefined;
const skipExisting = !!args["skip-existing"];
const isDryRun     = !args.write;
const isVerbose    = !!args.verbose;

if (!cityFilter) { console.error("Error: --city is required"); process.exit(1); }

// ── InstantDB ─────────────────────────────────────────────────────────────────
const appId      = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
if (!appId)      { console.error("Error: INSTANT_APP_ID missing");      process.exit(1); }
if (!adminToken) { console.error("Error: INSTANT_ADMIN_TOKEN missing"); process.exit(1); }

const maskToken = (t?: string) =>
  !t || t.length < 10 ? (t ? "***" : "(none)") : t.slice(0, 6) + "..." + t.slice(-4);

console.log("=== CONFIG ===");
console.log("appId:        ", appId);
console.log("token:        ", maskToken(adminToken));
console.log("city:         ", cityFilter);
console.log("state:        ", stateFilter ?? "(not set)");
console.log("min-length:   ", minLength != null ? `${minLength} mi` : "(all)");
console.log("limit:        ", limitArg ?? "(all)");
console.log("sampleMeters: ", sampleMeters);
console.log("nearMeters:   ", nearMeters);
console.log("mode:         ", isDryRun ? "DRY RUN (pass --write to persist)" : "WRITE");
console.log("verbose:      ", isVerbose);
console.log("==============\n");

// ── types ─────────────────────────────────────────────────────────────────────
type Coord         = [number, number]; // [lon, lat]
type Ring          = Coord[];
type MultiLineCoords = Ring[];

// Shade tier weights
const WEIGHT_STRONG = 1.0;  // forest / wood polygon
const WEIGHT_MEDIUM = 0.6;  // scrub / park polygon
const WEIGHT_WEAK   = 0.3;  // tree_row line / individual tree node
const TREE_NEAR_M   = 10;   // individual tree snap distance
const MAX_TREE_NODES = 2000;

// ── geometry helpers ──────────────────────────────────────────────────────────

/** Haversine distance in metres between two [lon,lat] points. */
function haversineM(a: Coord, b: Coord): number {
  const R  = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180, φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Minimum distance from point p to line segment a–b, in metres. */
function ptToSegM(p: Coord, a: Coord, b: Coord): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineM(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return haversineM(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Minimum distance from point p to any segment of a polyline. */
function ptToPolylineM(p: Coord, ring: Ring): number {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const d = ptToSegM(p, ring[i - 1], ring[i]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Point-in-polygon test (ray casting, works for convex and most concave polygons).
 * ring is an array of [lon,lat]; assumes closed (first === last is fine).
 */
function pointInPolygon(p: Coord, ring: Ring): boolean {
  let inside = false;
  const x = p[0], y = p[1];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi))
      inside = !inside;
  }
  return inside;
}

/**
 * Extract a flat list of [lon,lat] coordinate arrays from Overpass geometry nodes.
 * [{lat, lon}]  →  [lon, lat][]
 */
function osmNodesToRing(nodes: { lat: number; lon: number }[]): Ring {
  return nodes.map((n) => [n.lon, n.lat]);
}

/**
 * True if ring is closed (first ≈ last coord).
 * Overpass closed ways have first node === last node.
 */
function ringIsClosed(ring: Ring): boolean {
  if (ring.length < 4) return false;
  const f = ring[0], l = ring[ring.length - 1];
  return Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9;
}

/** Extract lines from a stored GeoJSON geometry. */
function extractLines(geom: any): MultiLineCoords {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString")      return [geom.coordinates as Ring];
  if (geom.type === "MultiLineString") return geom.coordinates as MultiLineCoords;
  return [];
}

/** Bbox of a set of lines with optional buffer (degrees). */
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

/**
 * Sample points along a MultiLine every `stepM` metres.
 * Returns at least `minPoints` samples (spaced evenly if trail is short).
 */
function sampleAlongMultiLine(
  lines: MultiLineCoords,
  stepM: number,
  minPoints = 10,
): Coord[] {
  const points: Coord[] = [];
  let remainder = 0; // carry-over distance from previous segment

  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      const segLen = haversineM(a, b);
      if (segLen === 0) continue;

      let d = remainder === 0 ? 0 : stepM - remainder;
      remainder = 0;

      while (d <= segLen) {
        const t = d / segLen;
        points.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
        d += stepM;
      }
      remainder = d - segLen; // distance into next segment before next sample
    }
  }

  if (points.length === 0) {
    // Fallback: just use segment midpoints
    for (const line of lines)
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        points.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
  }

  // If still below minPoints, interpolate evenly across all lines
  if (points.length < minPoints) {
    // Collect all coords, interpolate minPoints evenly
    const allCoords: Coord[] = lines.flatMap((l) => l);
    if (allCoords.length >= 2) {
      for (let k = 0; k < minPoints; k++) {
        const t = k / (minPoints - 1);
        const idx = Math.min(Math.floor(t * (allCoords.length - 1)), allCoords.length - 2);
        const frac = t * (allCoords.length - 1) - idx;
        const a = allCoords[idx], b = allCoords[idx + 1];
        points.push([a[0] + frac * (b[0] - a[0]), a[1] + frac * (b[1] - a[1])]);
      }
    }
  }

  return points;
}

// ── shade feature index ───────────────────────────────────────────────────────

/**
 * Shade feature tiers.
 * strong: forest/wood polygons
 * medium: scrub/park polygons
 * weak:   tree_row lines
 * tree:   individual tree nodes (handled separately)
 */
interface ShadeFeatureIndex {
  strongPolys: Ring[];   // closed rings
  mediumPolys: Ring[];
  treeRowLines: Ring[];  // open linestrings
  treePoints: Coord[];   // individual tree nodes, capped
}

/**
 * Check if a point is within `nearM` metres of a polygon:
 * - First, ray-cast inside the polygon (distance = 0 if inside).
 * - Otherwise, measure distance to boundary.
 */
function ptNearPolygon(p: Coord, ring: Ring, nearM: number): boolean {
  if (pointInPolygon(p, ring)) return true;
  return ptToPolylineM(p, ring) <= nearM;
}

/** Check if point is within nearM of any segment of a linestring. */
function ptNearLine(p: Coord, ring: Ring, nearM: number): boolean {
  return ptToPolylineM(p, ring) <= nearM;
}

/** Check if point is within nearM of any tree node. */
function ptNearTreeNode(p: Coord, trees: Coord[], nearM: number): boolean {
  for (const t of trees) {
    if (haversineM(p, t) <= nearM) return true;
  }
  return false;
}

/**
 * Classify shade weight for a sample point given the feature index.
 * Returns 0..1 shade weight.
 */
function shadeWeightForPoint(
  p: Coord,
  idx: ShadeFeatureIndex,
  nearM: number,
): number {
  // Strong: wood/forest polygons
  for (const ring of idx.strongPolys)
    if (ptNearPolygon(p, ring, nearM)) return WEIGHT_STRONG;

  // Medium: scrub/park polygons
  for (const ring of idx.mediumPolys)
    if (ptNearPolygon(p, ring, nearM)) return WEIGHT_MEDIUM;

  // Weak: tree row lines
  for (const line of idx.treeRowLines)
    if (ptNearLine(p, line, nearM)) return WEIGHT_WEAK;

  // Weak: individual tree nodes
  if (idx.treePoints.length > 0 && ptNearTreeNode(p, idx.treePoints, TREE_NEAR_M))
    return WEIGHT_WEAK;

  return 0;
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

function shadeQuery(bbox: [number, number, number, number]): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const b = `${minLat},${minLon},${maxLat},${maxLon}`;
  return `[out:json][timeout:60];
(
  way["natural"="wood"](${b});
  relation["natural"="wood"](${b});
  way["landuse"="forest"](${b});
  relation["landuse"="forest"](${b});
  way["natural"="scrub"](${b});
  relation["natural"="scrub"](${b});
  way["leisure"="park"](${b});
  relation["leisure"="park"](${b});
  way["natural"="tree_row"](${b});
  node["natural"="tree"](${b});
);
out geom tags;`;
}

// ── build ShadeFeatureIndex from Overpass elements ────────────────────────────

/**
 * For relation elements, Overpass returns members with geometry.
 * We collect all outer rings and merge them as separate polygons (simple v1 approach).
 */
function ringsFromRelation(el: any): Ring[] {
  const rings: Ring[] = [];
  for (const member of el.members ?? []) {
    const geom: { lat: number; lon: number }[] = member.geometry ?? [];
    if (geom.length < 3) continue;
    rings.push(osmNodesToRing(geom));
  }
  return rings;
}

function buildShadeIndex(
  elements: any[],
  systemLines: MultiLineCoords,
  nearM: number,
): ShadeFeatureIndex {
  const strongPolys:  Ring[]  = [];
  const mediumPolys:  Ring[]  = [];
  const treeRowLines: Ring[]  = [];
  const rawTreePoints: Coord[] = [];

  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {};
    const isWood    = tags.natural === "wood"   || tags.landuse === "forest";
    const isForest  = isWood;
    const isScrub   = tags.natural === "scrub";
    const isPark    = tags.leisure === "park";
    const isTreeRow = tags.natural === "tree_row";
    const isTree    = tags.natural === "tree";

    if (el.type === "node") {
      if (isTree && el.lat != null)
        rawTreePoints.push([el.lon, el.lat]);
      continue;
    }

    if (el.type === "way") {
      const geomNodes: { lat: number; lon: number }[] = el.geometry ?? [];
      if (geomNodes.length < 2) continue;
      const ring = osmNodesToRing(geomNodes);

      if (isTreeRow) {
        treeRowLines.push(ring);
      } else if (isForest) {
        if (ringIsClosed(ring)) strongPolys.push(ring);
        else treeRowLines.push(ring); // treat open wood-way as a line
      } else if (isScrub || isPark) {
        if (ringIsClosed(ring)) mediumPolys.push(ring);
      }
      continue;
    }

    if (el.type === "relation") {
      const rings = ringsFromRelation(el);
      for (const ring of rings) {
        if (isForest) strongPolys.push(ring);
        else if (isScrub || isPark) mediumPolys.push(ring);
      }
    }
  }

  // Cap tree nodes: keep only those closest to the trail system
  let treePoints = rawTreePoints;
  if (rawTreePoints.length > MAX_TREE_NODES) {
    // Score by distance to any system line segment, keep closest
    const withDist = rawTreePoints.map((p) => {
      let best = Infinity;
      for (const line of systemLines) {
        for (let i = 1; i < line.length; i++) {
          const d = ptToSegM(p, line[i - 1], line[i]);
          if (d < best) best = d;
        }
      }
      return { p, d: best };
    });
    withDist.sort((a, b) => a.d - b.d);
    treePoints = withDist.slice(0, MAX_TREE_NODES).map((x) => x.p);
  }

  return { strongPolys, mediumPolys, treeRowLines, treePoints };
}

// ── per-system shade computation ──────────────────────────────────────────────

interface ShadeResult {
  shadeProxyScore:   number;
  shadeProxyPercent: number;
  shadeClass: "low" | "medium" | "high";
  shadeSources: {
    strongPolyCount:    number;
    mediumPolyCount:    number;
    treeRowCount:       number;
    treeNodeCountUsed:  number;
  };
  shadeLastComputedAt: number;
}

function computeShade(
  systemLines: MultiLineCoords,
  elements: any[],
  stepM: number,
  nearM: number,
): ShadeResult {
  const idx = buildShadeIndex(elements, systemLines, nearM);

  const samples = sampleAlongMultiLine(systemLines, stepM, 10);

  let weightSum = 0;
  let mediumOrStrongCount = 0;

  for (const p of samples) {
    const w = shadeWeightForPoint(p, idx, nearM);
    weightSum += w;
    if (w >= WEIGHT_MEDIUM) mediumOrStrongCount++;
  }

  const n = samples.length || 1;
  const shadeProxyScore   = parseFloat((weightSum / n).toFixed(4));
  const shadeProxyPercent = parseFloat((mediumOrStrongCount / n).toFixed(4));
  const shadeClass: "low" | "medium" | "high" =
    shadeProxyScore >= 0.6 ? "high" :
    shadeProxyScore >= 0.3 ? "medium" : "low";

  return {
    shadeProxyScore,
    shadeProxyPercent,
    shadeClass,
    shadeSources: {
      strongPolyCount:   idx.strongPolys.length,
      mediumPolyCount:   idx.mediumPolys.length,
      treeRowCount:      idx.treeRowLines.length,
      treeNodeCountUsed: idx.treePoints.length,
    },
    shadeLastComputedAt: Date.now(),
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
    systems = systems.filter((s: any) => (s.lengthMilesTotal ?? 0) >= minLength);
    console.log(`  After min-length=${minLength}: ${systems.length}`);
  }
  if (skipExisting) {
    systems = systems.filter((s: any) => !s.shadeLastComputedAt);
    console.log(`  After skip-existing: ${systems.length}`);
  }
  if (limitArg && !Number.isNaN(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }
  if (systems.length === 0) { console.log("\nNothing to do."); return; }

  // ── fetch segments for geometry reconstruction ──
  console.log("\nFetching trailSegments...");
  const segRes = await db.query({ trailSegments: { $: { limit: 50000 } } });
  const allSegs = entityList(segRes, "trailSegments");
  console.log(`  Total segments in DB: ${allSegs.length}`);

  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegs) {
    if (!seg.systemRef) continue;
    if (!segsByRef.has(seg.systemRef)) segsByRef.set(seg.systemRef, []);
    segsByRef.get(seg.systemRef)!.push(seg);
  }

  // ── load local OSM index if available (skips Overpass for that city) ──
  let localOsmIndex: OsmLocalIndex | null = null;
  if (cityFilter) {
    localOsmIndex = loadOsmCategory(cityFilter, "shade");
    if (localOsmIndex) {
      console.log(`  Using local OSM cache for shade (${localOsmIndex.elements.length} features)\n`);
    } else {
      console.log(`  No local OSM cache found for "${cityFilter}" — will use Overpass\n`);
    }
  }

  // ── per-system loop ──
  const COL = 115;
  console.log(`\n${"─".repeat(COL)}`);
  console.log(
    "STATUS".padEnd(14) +
    "SYSTEM".padEnd(44) +
    "SCORE".padStart(7) +
    "  MED+STR%".padStart(11) +
    "  CLASS".padStart(8) +
    "  POLYS(S+M)".padStart(13) +
    "  ROWS".padStart(7) +
    "  TREES".padStart(8),
  );
  console.log("─".repeat(COL));

  let processed = 0, skipped = 0;
  let sumScore = 0;
  const classCounts: Record<string, number> = { low: 0, medium: 0, high: 0 };
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  const _t0 = Date.now();
  let _idx = 0;
  const _hb = setInterval(() => {
    const m = Math.round((Date.now() - _t0) / 60000);
    console.log(`\n[${new Date().toTimeString().slice(0, 5)}] ${processed}/${systems.length} done (${m}m elapsed)\n`);
  }, 5 * 60 * 1000);

  for (const system of systems) {
    const label = (system.slug ?? system.name ?? system.id).slice(0, 43);
    _idx++;
    console.log(`[${new Date().toTimeString().slice(0, 5)}] [${_idx}/${systems.length}] ${label}`);

    // Reconstruct geometry
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

    const bbox = bboxOfLines(systemLines, 0.002);
    if (!bbox) {
      console.log(`${"SKIP (no bbox)".padEnd(14)}${label}`);
      skipped++;
      continue;
    }

    if ((system.lengthMilesTotal as number ?? 0) < 1) {
      console.log(`${"SKIP (<1mi)".padEnd(14)}${label}`);
      skipped++;
      continue;
    }

    // Fetch shade features (local OSM cache preferred; Overpass fallback)
    let elements: any[] = [];
    if (localOsmIndex) {
      elements = osmFilterByBbox(localOsmIndex, bbox);
    } else {
      try {
        elements = await overpassPost(shadeQuery(bbox));
      } catch (err: any) {
        console.warn(`  ERROR (Overpass) for ${label}: ${err.message}`);
        continue;
      }
      await sleep(1_500);
    }

    // Compute shade
    let result: ShadeResult;
    try {
      result = computeShade(systemLines, elements, sampleMeters, nearMeters);
    } catch (err: any) {
      console.warn(`  ERROR (compute) for ${label}: ${err.message}`);
      continue;
    }

    processed++;
    sumScore += result.shadeProxyScore;
    classCounts[result.shadeClass]++;

    const status = isDryRun ? "WOULD UPDATE" : "UPDATE";
    const src = result.shadeSources;
    console.log(
      `${status.padEnd(14)}${label.padEnd(44)}` +
      `${result.shadeProxyScore.toFixed(3).padStart(7)}` +
      `${(result.shadeProxyPercent * 100).toFixed(1).padStart(10)}%` +
      `${"  " + result.shadeClass.padStart(6)}` +
      `${String(`${src.strongPolyCount}+${src.mediumPolyCount}`).padStart(13)}` +
      `${String(src.treeRowCount).padStart(7)}` +
      `${String(src.treeNodeCountUsed).padStart(8)}`,
    );

    if (isVerbose) {
      console.log(`  samples: (computed from trail geometry with step=${sampleMeters}m, near=${nearMeters}m)`);
    }

    const shadePayload = {
      shadeProxyScore:    result.shadeProxyScore,
      shadeProxyPercent:  result.shadeProxyPercent,
      shadeClass:         result.shadeClass,
      shadeSources:       result.shadeSources,
      shadeLastComputedAt: result.shadeLastComputedAt,
    };
    updates.push({ systemId: system.id, payload: shadePayload });
    if (!isDryRun) {
      await db.transact([(db as any).tx.trailSystems[system.id].update(shadePayload)]);
      console.log(`[${new Date().toTimeString().slice(0, 5)}] ${processed}/${systems.length} done: ${label}`);
    }
  }

  clearInterval(_hb);
  console.log("─".repeat(COL));

  // ── summary ──
  const avgScore = processed > 0 ? (sumScore / processed).toFixed(3) : "n/a";
  console.log("\n=== SHADE ENRICHMENT SUMMARY ===");
  console.log(`Systems processed:    ${processed}`);
  console.log(`Systems skipped:      ${skipped}  (no geometry)`);
  console.log(`Avg shadeProxyScore:  ${avgScore}`);
  console.log(`Shade LOW:            ${classCounts.low}`);
  console.log(`Shade MEDIUM:         ${classCounts.medium}`);
  console.log(`Shade HIGH:           ${classCounts.high}`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist changes to InstantDB.");
    return;
  }

  console.log(`\nDone. ${updates.length} system(s) enriched with shade data (written incrementally).`);
  console.log("================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
