#!/usr/bin/env npx tsx
/**
 * Mud Risk enrichment for trailSystems (v1 — OSM surface tags only).
 *
 * For each trailSystem:
 *   1. Reconstruct geometry from its trailSegments
 *   2. Compute bbox → query Overpass for walkable OSM ways
 *   3. Geometrically intersect ways with system geometry
 *   4. Compute length-weighted HARD/SEMI/NATURAL/UNKNOWN bucket mix
 *   5. Score mudRisk (low/medium/high) and write to trailSystems
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-mud.ts \
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
import { loadOsmCategory, filterByBbox, type OsmLocalIndex } from "./lib/osmLocal.js";

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
const minLength =
  typeof args["min-length"] === "string" ? parseFloat(args["min-length"]) : undefined;

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

type SurfaceBucket = "hard" | "semi" | "natural" | "unknown";
type MudRiskLevel = "low" | "medium" | "high" | "unknown";

interface OsmWay {
  id: number;
  tags: Record<string, string>;
  geometry: Coord[];
}

interface BucketMix {
  hardPercent: number;   // 0–1
  semiPercent: number;
  naturalPercent: number;
  unknownPercent: number;
}

interface MudEnrichResult {
  buckets: BucketMix;
  mudRiskScore: number | null;   // null when no ways intersect
  mudRisk: MudRiskLevel;
  mudRiskReason: string;
  mudLastComputedAt: number;
}

// ── surface normalization ────────────────────────────────────────────────────

const HARD_SURFACES = new Set([
  "asphalt", "concrete", "paving_stones", "paved", "sett",
  "metal", "rubber",
]);

const SEMI_SURFACES = new Set([
  "gravel", "fine_gravel", "compacted", "crushed_stone", "pebblestone",
  "unpaved", // borderline — treated as semi for mud risk
]);

const NATURAL_SURFACES = new Set([
  "dirt", "earth", "ground", "mud", "sand", "grass", "woodchips",
  "forest_floor", "snow", "ice",
]);

/**
 * Normalize a raw OSM surface tag value to a SurfaceBucket.
 * If surface is absent, fall back to tracktype.
 */
export function normalizeSurface(
  surface: string | undefined,
  tracktype: string | undefined
): SurfaceBucket {
  if (surface) {
    const s = surface.toLowerCase().trim();
    if (HARD_SURFACES.has(s)) return "hard";
    if (SEMI_SURFACES.has(s)) return "semi";
    if (NATURAL_SURFACES.has(s)) return "natural";
    // Partial matches
    if (s.includes("asphalt") || s.includes("concrete") || s.includes("pav")) return "hard";
    if (s.includes("gravel") || s.includes("compacted") || s.includes("crushed")) return "semi";
    if (s.includes("dirt") || s.includes("earth") || s.includes("grass") || s.includes("sand")) return "natural";
    return "unknown";
  }

  // Fall back to tracktype
  if (tracktype) {
    const t = tracktype.toLowerCase().trim();
    if (t === "grade1") return "hard";
    if (t === "grade2") return "semi";
    if (t === "grade3" || t === "grade4" || t === "grade5") return "natural";
  }

  return "unknown";
}

// ── mud risk scoring ─────────────────────────────────────────────────────────

/**
 * Compute mudRiskScore ∈ [0,1] from bucket percentages.
 *
 * Score = naturalPercent * 1.0 + semiPercent * 0.35 + unknownPercent * 0.25
 * Clamped to [0, 1].
 */
export function scoreMudRisk(mix: BucketMix): number {
  const raw =
    mix.naturalPercent * 1.0 +
    mix.semiPercent * 0.35 +
    mix.unknownPercent * 0.25;
  return Math.min(1, Math.max(0, raw));
}

function bucketMudRisk(score: number): "low" | "medium" | "high" {
  if (score >= 0.6) return "high";
  if (score >= 0.3) return "medium";
  return "low";
}

function mudRiskReason(mix: BucketMix): string {
  if (mix.naturalPercent >= 0.5) return "Mostly natural surfaces (dirt/earth/grass)";
  if (mix.semiPercent >= 0.5) return "Mostly gravel/compacted surfaces";
  return "Mostly paved / low mud risk";
}

// ── geometry utilities (no external deps) ───────────────────────────────────

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

function extractLines(geom: any): MultiLineCoords {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString") return [geom.coordinates as LineCoords];
  if (geom.type === "MultiLineString") return geom.coordinates as MultiLineCoords;
  return [];
}

function bboxOfLines(
  lines: MultiLineCoords,
  bufferDeg = 0.001
): [number, number, number, number] | null {
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

function pointToSegmentDistM(p: Coord, a: Coord, b: Coord): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineM(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return haversineM(p, [a[0] + t * dx, a[1] + t * dy]);
}

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
  const d1 = cross(c, d, a), d2 = cross(c, d, b);
  const d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSeg(a, c, d)) return true;
  if (d2 === 0 && onSeg(b, c, d)) return true;
  if (d3 === 0 && onSeg(c, a, b)) return true;
  if (d4 === 0 && onSeg(d, a, b)) return true;
  return false;
}

const SNAP_M = 20; // metres — OSM way within this distance of system segment counts

/** Length of an OSM way that overlaps the system geometry, in metres. */
function intersectionLength(wayCoords: Coord[], sysLines: MultiLineCoords): number {
  if (wayCoords.length < 2 || sysLines.length === 0) return 0;
  const sysSegs: [Coord, Coord][] = [];
  for (const line of sysLines) {
    for (let i = 1; i < line.length; i++) sysSegs.push([line[i - 1], line[i]]);
  }
  if (sysSegs.length === 0) return 0;

  let total = 0;
  for (let i = 1; i < wayCoords.length; i++) {
    const wa = wayCoords[i - 1], wb = wayCoords[i];
    let matched = false;
    for (const [sa, sb] of sysSegs) {
      if (segmentsIntersect(wa, wb, sa, sb)) { matched = true; break; }
      const mid: Coord = [(wa[0] + wb[0]) / 2, (wa[1] + wb[1]) / 2];
      if (pointToSegmentDistM(mid, sa, sb) <= SNAP_M) { matched = true; break; }
    }
    if (matched) total += haversineM(wa, wb);
  }
  return total;
}

// ── Overpass ─────────────────────────────────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function queryOverpass(
  bbox: [number, number, number, number]
): Promise<OsmWay[]> {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const bboxStr = `${minLat},${minLon},${maxLat},${maxLon}`;
  const query = `[out:json][timeout:60];\n(\n  way["highway"~"^(path|footway|track)$"](${bboxStr});\n);\nout geom tags;`;

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
          console.log(`    Overpass ${resp.status} from ${endpoint}, waiting ${wait / 1000}s...`);
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

// ── per-system enrichment ────────────────────────────────────────────────────

function computeMudEnrichment(
  osmWays: OsmWay[],
  systemLines: MultiLineCoords
): MudEnrichResult {
  const bucketLengths: Record<SurfaceBucket, number> = {
    hard: 0, semi: 0, natural: 0, unknown: 0,
  };
  let totalLength = 0;

  for (const way of osmWays) {
    const len = intersectionLength(way.geometry, systemLines);
    if (len <= 0) continue;
    const bucket = normalizeSurface(way.tags.surface, way.tags.tracktype);
    bucketLengths[bucket] += len;
    totalLength += len;
  }

  if (totalLength === 0) {
    return {
      buckets: { hardPercent: 0, semiPercent: 0, naturalPercent: 0, unknownPercent: 0 },
      mudRiskScore: null,
      mudRisk: "unknown",
      mudRiskReason: "No intersecting OSM ways found",
      mudLastComputedAt: Date.now(),
    };
  }

  const mix: BucketMix = {
    hardPercent:    parseFloat((bucketLengths.hard    / totalLength).toFixed(4)),
    semiPercent:    parseFloat((bucketLengths.semi    / totalLength).toFixed(4)),
    naturalPercent: parseFloat((bucketLengths.natural / totalLength).toFixed(4)),
    unknownPercent: parseFloat((bucketLengths.unknown / totalLength).toFixed(4)),
  };

  // Fix floating-point drift so fractions sum to exactly 1.0
  const sum = mix.hardPercent + mix.semiPercent + mix.naturalPercent + mix.unknownPercent;
  const diff = parseFloat((1 - sum).toFixed(4));
  if (diff !== 0) {
    // Adjust the largest bucket
    const largest = (["hard", "semi", "natural", "unknown"] as SurfaceBucket[])
      .map((k) => ({ k, v: mix[`${k}Percent` as keyof BucketMix] }))
      .sort((a, b) => b.v - a.v)[0];
    (mix as any)[`${largest.k}Percent`] = parseFloat(
      ((mix as any)[`${largest.k}Percent`] + diff).toFixed(4)
    );
  }

  const score = scoreMudRisk(mix);
  return {
    buckets: mix,
    mudRiskScore: parseFloat(score.toFixed(4)),
    mudRisk: bucketMudRisk(score),
    mudRiskReason: mudRiskReason(mix),
    mudLastComputedAt: Date.now(),
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
  if (minLength != null && minLength > 0) {
    systems = systems.filter((s: any) => (s.lengthMilesTotal ?? 0) > minLength);
    console.log(`  After min-length=${minLength}: ${systems.length}`);
  }
  if (limitArg && !Number.isNaN(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }

  if (systems.length === 0) {
    console.log("\nNo systems match the given filters. Nothing to do.");
    return;
  }

  // ── fetch segments for geometry reconstruction ──
  console.log("\nFetching trailSegments...");
  const segRes = await db.query({ trailSegments: { $: { limit: 50000 } } });
  const allSegments = entityList(segRes, "trailSegments");
  console.log(`  Total segments in DB: ${allSegments.length}`);

  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegments) {
    const ref = seg.systemRef;
    if (!ref) continue;
    if (!segsByRef.has(ref)) segsByRef.set(ref, []);
    segsByRef.get(ref)!.push(seg);
  }

  // ── load local OSM surface index ──
  const TRAIL_HW = /^(path|footway|track)$/;
  const surfaceIndex: OsmLocalIndex | null = loadOsmCategory(
    cityFilter!, "surface", (el) => TRAIL_HW.test(el.tags.highway ?? ""),
  );
  if (surfaceIndex) {
    console.log(`  Local OSM surface index loaded (${surfaceIndex.elements.length} elements)`);
  } else {
    console.log("  No local OSM surface cache — will use Overpass API");
  }

  // ── process each system ──
  const COL = 110;
  console.log(`\n${"─".repeat(COL)}`);
  const HDR =
    "STATUS".padEnd(14) +
    "SYSTEM".padEnd(44) +
    "NATURAL%".padStart(9) +
    "  SEMI%".padStart(8) +
    "  HARD%".padStart(8) +
    "  SCORE".padStart(8) +
    "  MUD".padStart(7) +
    "  WAYS".padStart(7);
  console.log(HDR);
  console.log("─".repeat(COL));

  let processedCount = 0;
  let skippedNoGeom = 0;
  const mudCounts: Record<MudRiskLevel, number> = { low: 0, medium: 0, high: 0, unknown: 0 };
  let sumNatural = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (const system of systems) {
    const label = (system.slug ?? system.name ?? system.id).slice(0, 43);

    // Reconstruct geometry from segments
    const segs = segsByRef.get(system.extSystemRef) ?? [];
    const systemLines: MultiLineCoords = [];
    for (const seg of segs) {
      if (!seg.geometry) continue;
      try {
        systemLines.push(...extractLines(seg.geometry));
      } catch { /* skip malformed */ }
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

    const bbox = bboxOfLines(systemLines, 0.001);
    if (!bbox) {
      console.log(`${"SKIP (no bbox)".padEnd(14)}${label}`);
      skippedNoGeom++;
      continue;
    }

    // Query OSM ways — prefer local index, fall back to Overpass
    let osmWays: OsmWay[] = [];
    if (surfaceIndex) {
      const localElements = filterByBbox(surfaceIndex, bbox);
      const HIGHWAY_RE = /^(path|footway|track)$/;
      osmWays = localElements
        .filter((el) => el.tags.highway && HIGHWAY_RE.test(el.tags.highway))
        .map((el) => ({
          id: Number(el.id.replace(/\D/g, "")),
          tags: el.tags,
          geometry: (el.geometry || []).map((p) => [p.lon, p.lat] as Coord),
        }))
        .filter((w) => w.geometry.length >= 2);
    } else {
      try {
        osmWays = await queryOverpass(bbox);
      } catch (err: any) {
        console.warn(`  ERROR (Overpass) for ${label}: ${err.message}`);
        continue;
      }
      await sleep(1_500);
    }

    // Compute
    let result: MudEnrichResult;
    try {
      result = computeMudEnrichment(osmWays, systemLines);
    } catch (err: any) {
      console.warn(`  ERROR (compute) for ${label}: ${err.message}`);
      continue;
    }

    processedCount++;
    mudCounts[result.mudRisk]++;
    if (result.mudRiskScore !== null) sumNatural += result.buckets.naturalPercent;

    const status = isDryRun ? "WOULD UPDATE" : "UPDATE";
    const scoreStr = result.mudRiskScore !== null
      ? result.mudRiskScore.toFixed(3)
      : " n/a";
    console.log(
      `${status.padEnd(14)}${label.padEnd(44)}` +
      `${(result.buckets.naturalPercent * 100).toFixed(1).padStart(8)}%` +
      `${(result.buckets.semiPercent * 100).toFixed(1).padStart(7)}%` +
      `${(result.buckets.hardPercent * 100).toFixed(1).padStart(7)}%` +
      `${scoreStr.padStart(8)}` +
      `${"  " + result.mudRisk.padStart(6)}` +
      `${String(osmWays.length).padStart(7)}`
    );

    if (isVerbose) {
      console.log(`  reason: ${result.mudRiskReason}`);
      console.log(`  buckets:`, result.buckets);
    }

    updates.push({
      systemId: system.id,
      payload: {
        mudRisk: result.mudRisk,
        mudRiskReason: result.mudRiskReason,
        mudLastComputedAt: result.mudLastComputedAt,
        // only write mudRiskScore if we have a real value
        ...(result.mudRiskScore !== null ? { mudRiskScore: result.mudRiskScore } : {}),
      },
    });
  }

  console.log("─".repeat(COL));

  // ── summary ──
  const avgNatural =
    processedCount > 0
      ? ((sumNatural / processedCount) * 100).toFixed(1)
      : "n/a";

  console.log("\n=== MUD RISK ENRICHMENT SUMMARY ===");
  console.log(`Systems processed:    ${processedCount}`);
  console.log(`Systems skipped:      ${skippedNoGeom}  (no geometry)`);
  console.log(`Avg naturalPercent:   ${avgNatural}%`);
  console.log(`Mud risk LOW:         ${mudCounts.low}`);
  console.log(`Mud risk MEDIUM:      ${mudCounts.medium}`);
  console.log(`Mud risk HIGH:        ${mudCounts.high}`);
  console.log(`Mud risk UNKNOWN:     ${mudCounts.unknown}  (no OSM ways)`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist changes to InstantDB.");
    return;
  }

  if (updates.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  // ── write in batches ──
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

  console.log(`\nDone. ${written} system(s) enriched with mud risk data.`);
  console.log("===================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
