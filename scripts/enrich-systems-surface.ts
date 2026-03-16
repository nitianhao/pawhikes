#!/usr/bin/env npx tsx
/**
 * Surface & Paw Safety enrichment for trailSystems.
 *
 * For each trailSystem:
 *   1. Reconstruct geometry from its trailSegments
 *   2. Compute bbox → query Overpass for walkable OSM ways
 *   3. Geometrically intersect OSM ways with the system geometry
 *   4. Compute length-weighted surface breakdown & paw safety metrics
 *   5. Persist results onto trailSystems (surfaceBreakdown, heatRisk,
 *      roughnessRisk, asphaltPercent, naturalSurfacePercent, surfaceLastComputedAt)
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-surface.ts \
 *     --city "Austin" \
 *     --state "TX" \
 *     [--limit 5] \
 *     [--write] \
 *     [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

// ── env loading ──────────────────────────────────────────────────────────────
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
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvLocal(ROOT);

// ── argv parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv: string[]): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const cityFilter = typeof args.city === "string" ? args.city : undefined;
const stateFilter = typeof args.state === "string" ? args.state : undefined;
const limitArg =
  typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
const isDryRun = !args.write;
const isVerbose = !!args.verbose;

if (!cityFilter) {
  console.error("Error: --city is required");
  process.exit(1);
}

// ── InstantDB init ───────────────────────────────────────────────────────────
const appId = process.env.INSTANT_APP_ID;
const adminToken =
  process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

if (!appId) {
  console.error("Error: INSTANT_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!adminToken) {
  console.error(
    "Error: INSTANT_APP_ADMIN_TOKEN or INSTANT_ADMIN_TOKEN must be set in .env.local"
  );
  process.exit(1);
}

function maskToken(t: string | undefined): string {
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
type Coord = [number, number]; // [lon, lat]
type LineCoords = Coord[];
type MultiLineCoords = LineCoords[];

interface GeoJsonGeometry {
  type: string;
  coordinates: any;
}

interface OsmWay {
  id: number;
  tags: Record<string, string>;
  geometry: Coord[]; // ordered node positions
}

interface SurfaceBreakdown {
  [surface: string]: number; // fraction 0–1, sum = 1.0
}

interface EnrichResult {
  surfaceBreakdown: SurfaceBreakdown;
  heatRisk: "low" | "medium" | "high";
  roughnessRisk: "low" | "medium" | "high";
  asphaltPercent: number;
  naturalSurfacePercent: number;
  surfaceLastComputedAt: number;
}

// ── geometry utilities (no external deps) ───────────────────────────────────

/** Haversine distance in metres between two [lon, lat] points. */
function haversineM(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180;
  const φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Total length of a polyline in metres. */
function polylineLength(coords: Coord[]): number {
  let len = 0;
  for (let i = 1; i < coords.length; i++) len += haversineM(coords[i - 1], coords[i]);
  return len;
}

/**
 * Extract all constituent LineString coordinate arrays from a GeoJSON geometry
 * (handles LineString and MultiLineString).
 */
function extractLines(geom: GeoJsonGeometry): MultiLineCoords {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString") return [geom.coordinates as LineCoords];
  if (geom.type === "MultiLineString") return geom.coordinates as MultiLineCoords;
  return [];
}

/**
 * Compute a bounding box [minLon, minLat, maxLon, maxLat] from a geometry,
 * with an optional buffer in degrees.
 */
function bboxOfGeom(
  geom: GeoJsonGeometry,
  bufferDeg = 0.001
): [number, number, number, number] | null {
  const lines = extractLines(geom);
  if (lines.length === 0) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const line of lines) {
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return minLon === Infinity
    ? null
    : [minLon - bufferDeg, minLat - bufferDeg, maxLon + bufferDeg, maxLat + bufferDeg];
}

/**
 * Squared distance from point P to line segment AB (all in [lon,lat]).
 * Returns metres (approximate, using haversine at midpoint).
 */
function pointToSegmentDistM(p: Coord, a: Coord, b: Coord): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineM(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const closest: Coord = [a[0] + t * dx, a[1] + t * dy];
  return haversineM(p, closest);
}

/**
 * Check whether two line segments (a→b) and (c→d) intersect.
 * Returns true if they share any point (including endpoints).
 */
function segmentsIntersect(a: Coord, b: Coord, c: Coord, d: Coord): boolean {
  function cross(o: Coord, u: Coord, v: Coord): number {
    return (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0]);
  }
  function onSeg(p: Coord, q: Coord, r: Coord): boolean {
    return (
      Math.min(q[0], r[0]) <= p[0] + 1e-10 &&
      p[0] <= Math.max(q[0], r[0]) + 1e-10 &&
      Math.min(q[1], r[1]) <= p[1] + 1e-10 &&
      p[1] <= Math.max(q[1], r[1]) + 1e-10
    );
  }
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSeg(a, c, d)) return true;
  if (d2 === 0 && onSeg(b, c, d)) return true;
  if (d3 === 0 && onSeg(c, a, b)) return true;
  if (d4 === 0 && onSeg(d, a, b)) return true;
  return false;
}

/**
 * Estimate the length (metres) of an OSM way that intersects with the given
 * system geometry (MultiLineString).
 *
 * Strategy: for each segment of the OSM way, check if it comes within
 * SNAP_M metres of any segment of the system geometry OR actually crosses it.
 * Sum the lengths of matching OSM way segments.
 *
 * This avoids heavy polygon operations while still being geometrically sound
 * for comparing two sets of polylines.
 */
const SNAP_M = 20; // metres — ways within this distance count as intersecting

function intersectionLength(wayCoords: Coord[], systemLines: MultiLineCoords): number {
  if (wayCoords.length < 2 || systemLines.length === 0) return 0;

  // Build a flat array of system segments for fast iteration
  const sysSegs: [Coord, Coord][] = [];
  for (const line of systemLines) {
    for (let i = 1; i < line.length; i++) sysSegs.push([line[i - 1], line[i]]);
  }
  if (sysSegs.length === 0) return 0;

  let totalLen = 0;
  for (let i = 1; i < wayCoords.length; i++) {
    const wa = wayCoords[i - 1];
    const wb = wayCoords[i];
    let matched = false;

    for (const [sa, sb] of sysSegs) {
      // Check geometric intersection (crossing)
      if (segmentsIntersect(wa, wb, sa, sb)) {
        matched = true;
        break;
      }
      // Check proximity: midpoint of OSM segment close to system segment
      const mid: Coord = [(wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2];
      if (pointToSegmentDistM(mid, sa, sb) <= SNAP_M) {
        matched = true;
        break;
      }
    }

    if (matched) totalLen += haversineM(wa, wb);
  }
  return totalLen;
}

// ── Overpass API ─────────────────────────────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function queryOverpass(bbox: [number, number, number, number]): Promise<OsmWay[]> {
  // Overpass bbox order: (minLat,minLon,maxLat,maxLon)
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;

  const query = `[out:json][timeout:60];
(
  way["highway"~"^(path|footway|track)$"](${bboxStr});
);
out geom tags;`;

  const RETRIES = 3;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(75_000),
        });

        if (resp.status === 429 || resp.status === 504) {
          const wait = attempt * 10_000;
          console.log(
            `    Overpass ${resp.status} from ${endpoint}, waiting ${wait / 1000}s...`
          );
          await sleep(wait);
          continue;
        }

        if (!resp.ok) {
          console.warn(`    Overpass error ${resp.status} from ${endpoint}`);
          continue;
        }

        const json: any = await resp.json();
        const ways: OsmWay[] = [];
        for (const el of json.elements ?? []) {
          if (el.type !== "way") continue;
          const coords: Coord[] = (el.geometry ?? []).map((n: any) => [n.lon, n.lat]);
          if (coords.length < 2) continue;
          ways.push({ id: el.id, tags: el.tags ?? {}, geometry: coords });
        }
        return ways;
      } catch (err: any) {
        if (attempt < RETRIES) {
          console.warn(`    Overpass fetch error (attempt ${attempt}): ${err.message}`);
          await sleep(5_000 * attempt);
        }
      }
    }
  }
  console.warn("    All Overpass attempts failed — returning empty way list.");
  return [];
}

// ── surface classification helpers ──────────────────────────────────────────

const NATURAL_SURFACES = new Set([
  "dirt", "earth", "ground", "grass", "mud", "sand", "wood",
  "woodchips", "fine_gravel", "compacted", "unpaved", "natural",
]);

const HARD_SURFACES = new Set([
  "asphalt", "concrete", "paving_stones", "sett", "cobblestone",
  "metal", "rubber",
]);

/** Map a raw surface tag value to a canonical bucket. */
function canonicalizeSurface(raw: string | undefined): string {
  if (!raw) return "unknown";
  const s = raw.toLowerCase().trim();
  if (s === "asphalt") return "asphalt";
  if (s === "concrete") return "concrete";
  if (NATURAL_SURFACES.has(s)) return s;
  if (HARD_SURFACES.has(s)) return "hard_other";
  if (s.includes("gravel") || s.includes("pebble")) return "gravel";
  return s; // pass through unknown values verbatim
}

/** Compute heat risk score (0–1) from surface breakdown. */
function heatRiskScore(breakdown: SurfaceBreakdown): number {
  return (
    (breakdown.asphalt ?? 0) * 1.0 +
    (breakdown.concrete ?? 0) * 1.0 +
    (breakdown.hard_other ?? 0) * 0.7 +
    (breakdown.gravel ?? 0) * 0.5
  );
}

/**
 * Roughness score based on smoothness / tracktype / sac_scale tags.
 * Returns 0 (smooth) → 2 (rough).
 */
function roughnessScore(tags: Record<string, string>): number {
  let score = 0;
  const smoothness = tags.smoothness ?? "";
  if (["bad", "very_bad", "horrible", "very_horrible", "impassable"].includes(smoothness)) {
    score = Math.max(score, 2);
  } else if (["poor", "robust_wheels"].includes(smoothness)) {
    score = Math.max(score, 1);
  }

  const tracktype = tags.tracktype ?? "";
  if (tracktype === "grade5") score = Math.max(score, 2);
  else if (tracktype === "grade4") score = Math.max(score, 1);

  const sac = tags.sac_scale ?? "";
  if (["mountain_hiking", "demanding_mountain_hiking", "alpine_hiking",
       "demanding_alpine_hiking", "difficult_alpine_hiking"].includes(sac)) {
    score = Math.max(score, 2);
  }

  return score;
}

function classify(score: number, low: number, high: number): "low" | "medium" | "high" {
  if (score >= high) return "high";
  if (score >= low) return "medium";
  return "low";
}

// ── per-system enrichment ────────────────────────────────────────────────────

function computeEnrichment(
  osmWays: OsmWay[],
  systemLines: MultiLineCoords
): EnrichResult {
  // For each OSM way, compute intersection length and surface
  const surfaceLengths: Record<string, number> = {};
  let totalLength = 0;
  let weightedRoughness = 0;

  for (const way of osmWays) {
    const len = intersectionLength(way.geometry, systemLines);
    if (len <= 0) continue;

    const surface = canonicalizeSurface(way.tags.surface);
    surfaceLengths[surface] = (surfaceLengths[surface] ?? 0) + len;
    totalLength += len;

    const rough = roughnessScore(way.tags);
    weightedRoughness += rough * len;
  }

  // Build surface breakdown (fractions summing to 1)
  const surfaceBreakdown: SurfaceBreakdown = {};
  if (totalLength > 0) {
    for (const [surf, len] of Object.entries(surfaceLengths)) {
      surfaceBreakdown[surf] = parseFloat((len / totalLength).toFixed(4));
    }
    // Fix floating-point drift: adjust largest bucket so sum == 1
    const sum = Object.values(surfaceBreakdown).reduce((a, b) => a + b, 0);
    const diff = parseFloat((1 - sum).toFixed(4));
    if (diff !== 0) {
      const largest = Object.entries(surfaceBreakdown).sort((a, b) => b[1] - a[1])[0];
      if (largest) surfaceBreakdown[largest[0]] = parseFloat((largest[1] + diff).toFixed(4));
    }
  } else {
    surfaceBreakdown["unknown"] = 1;
  }

  // asphaltPercent / naturalSurfacePercent
  const asphaltPercent = parseFloat(
    ((surfaceBreakdown.asphalt ?? 0) * 100).toFixed(1)
  );
  const naturalSurfacePercent = parseFloat(
    (Object.entries(surfaceBreakdown)
      .filter(([k]) => NATURAL_SURFACES.has(k))
      .reduce((acc, [, v]) => acc + v, 0) * 100
    ).toFixed(1)
  );

  // heatRisk
  const heatScore = heatRiskScore(surfaceBreakdown);
  const heatRisk = classify(heatScore, 0.2, 0.5);

  // roughnessRisk (weighted average 0–2 → low/medium/high)
  const avgRoughness = totalLength > 0 ? weightedRoughness / totalLength : 0;
  const roughnessRisk = classify(avgRoughness, 0.4, 1.2);

  return {
    surfaceBreakdown,
    heatRisk,
    roughnessRisk,
    asphaltPercent,
    naturalSurfacePercent,
    surfaceLastComputedAt: Date.now(),
  };
}

// ── InstantDB helper ─────────────────────────────────────────────────────────

function entityList(res: any, name: string): any[] {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });
  console.log("Admin SDK initialized OK\n");

  // ── fetch systems ──
  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = entityList(sysRes, "trailSystems");
  console.log(`  Total systems in DB: ${systems.length}`);

  if (cityFilter) {
    const needle = cityFilter.toLowerCase();
    systems = systems.filter((s: any) => (s.city ?? "").toLowerCase().includes(needle));
    console.log(`  After city="${cityFilter}": ${systems.length}`);
  }

  if (stateFilter) {
    const needle = stateFilter.toLowerCase();
    systems = systems.filter((s: any) => {
      if (!s.state) return true;
      return s.state.toLowerCase().includes(needle);
    });
    console.log(`  After state="${stateFilter}": ${systems.length}`);
  }

  if (limitArg && !Number.isNaN(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }

  if (systems.length === 0) {
    console.log("\nNo systems match the given filters. Nothing to do.");
    return;
  }

  // ── fetch all segments (needed for geometry reconstruction) ──
  console.log("\nFetching trailSegments...");
  const segRes = await db.query({ trailSegments: { $: { limit: 10000 } } });
  const allSegments = entityList(segRes, "trailSegments");
  console.log(`  Total segments in DB: ${allSegments.length}`);

  // Group segments by systemRef
  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegments) {
    const ref = seg.systemRef;
    if (!ref) continue;
    if (!segsByRef.has(ref)) segsByRef.set(ref, []);
    segsByRef.get(ref)!.push(seg);
  }

  // ── per-system processing ──
  console.log(`\n${"─".repeat(110)}`);
  const HDR =
    "STATUS".padEnd(14) +
    "SYSTEM".padEnd(44) +
    "ASPHALT%".padStart(9) +
    "  NATURAL%".padStart(11) +
    "  HEAT".padStart(7) +
    "  ROUGH".padStart(8) +
    "  OSM_WAYS".padStart(11);
  console.log(HDR);
  console.log("─".repeat(110));

  let processedCount = 0;
  let skippedNoGeom = 0;
  let updatedCount = 0;
  let sysIdx = 0;

  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (const system of systems) {
    sysIdx++;
    const ref: string = system.extSystemRef ?? system.id;
    const label = (system.slug ?? system.name ?? ref).slice(0, 43);

    // Reconstruct system geometry from its segments
    const segs = segsByRef.get(system.extSystemRef) ?? [];
    const systemLines: MultiLineCoords = [];
    for (const seg of segs) {
      if (!seg.geometry) continue;
      try {
        const lines = extractLines(seg.geometry);
        systemLines.push(...lines);
      } catch {
        // ignore malformed geometry
      }
    }

    if (systemLines.length === 0) {
      console.log(`${"SKIP (no geom)".padEnd(14)}${label}`);
      skippedNoGeom++;
      continue;
    }

    if ((system.lengthMilesTotal as number ?? 0) < 1) {
      console.log(`${"SKIP (<1mi)".padEnd(14)}${label}`);
      skippedNoGeom++;
      continue;
    }

    // Build a composite geometry object for bbox computation
    const compositeGeom: GeoJsonGeometry = {
      type: "MultiLineString",
      coordinates: systemLines,
    };
    const bbox = bboxOfGeom(compositeGeom, 0.001);
    if (!bbox) {
      console.log(`${"SKIP (no bbox)".padEnd(14)}${label}`);
      skippedNoGeom++;
      continue;
    }

    // Query Overpass
    console.log(`[${sysIdx}/${systems.length}] ${label}`);
    let osmWays: OsmWay[] = [];
    try {
      osmWays = await queryOverpass(bbox);
    } catch (err: any) {
      console.warn(`  ERROR querying Overpass for ${label}: ${err.message}`);
      continue;
    }

    // Throttle between Overpass requests to be a good citizen
    await sleep(1_500);

    // Compute enrichment
    let result: EnrichResult;
    try {
      result = computeEnrichment(osmWays, systemLines);
    } catch (err: any) {
      console.warn(`  ERROR computing enrichment for ${label}: ${err.message}`);
      continue;
    }

    processedCount++;

    const status = isDryRun ? "WOULD UPDATE" : "UPDATE";
    console.log(
      `${status.padEnd(14)}${label.padEnd(44)}` +
        `${String(result.asphaltPercent.toFixed(1) + "%").padStart(9)}` +
        `${String(result.naturalSurfacePercent.toFixed(1) + "%").padStart(11)}` +
        `${"  " + result.heatRisk.padStart(5)}` +
        `${"  " + result.roughnessRisk.padStart(6)}` +
        `${String(osmWays.length).padStart(11)}`
    );

    if (isVerbose) {
      console.log("  breakdown:", JSON.stringify(result.surfaceBreakdown));
    }

    const payload: Record<string, any> = {
      surfaceBreakdown: result.surfaceBreakdown,
      heatRisk: result.heatRisk,
      roughnessRisk: result.roughnessRisk,
      asphaltPercent: result.asphaltPercent,
      naturalSurfacePercent: result.naturalSurfacePercent,
      surfaceLastComputedAt: result.surfaceLastComputedAt,
    };
    updates.push({ systemId: system.id, payload });
    updatedCount++;
  }

  console.log("─".repeat(110));

  // ── summary ──
  console.log("\n=== SURFACE ENRICHMENT SUMMARY ===");
  console.log(`Systems processed:    ${processedCount}`);
  console.log(`Systems skipped:      ${skippedNoGeom}  (no geometry)`);
  console.log(`Systems to update:    ${updatedCount}`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist changes to InstantDB.");
    return;
  }

  if (updates.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  // ── write ──
  console.log(`\nWriting ${updates.length} system update(s)...`);
  const BATCH = 50;
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    const txSteps = chunk.map(({ systemId, payload }) =>
      (db as any).tx.trailSystems[systemId].update(payload)
    );
    await db.transact(txSteps);
    written += chunk.length;
    console.log(`  Written ${written}/${updates.length}...`);
  }

  console.log(`\nDone. ${written} system(s) enriched with surface & paw safety data.`);
  console.log("===================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
