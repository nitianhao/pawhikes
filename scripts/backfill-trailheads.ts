#!/usr/bin/env npx tsx
/**
 * Backfill trailHeads for a given city/state from trailSystems geometry.
 *
 * Strategy per trailSystem:
 *   1. Reconstruct geometry from trailSegments (same pattern as enrich-* scripts)
 *   2. Query Overpass for "access POIs" within ~300m of the geometry bbox
 *   3. Score candidates → pick top 1–maxPerCluster
 *   4. Fallback to geometry-derived endpoints if no OSM POIs found
 *   5. Upsert trailHeads (idempotent via stable composite key in trailSlug)
 *
 * Schema mapping:
 *   trailHeads.trailSlug  → stable upsert key: "<extSystemRef>::<source>::<rank>"
 *   trailHeads.name       → OSM name tag or synthetic label
 *   trailHeads.lat        → latitude
 *   trailHeads.lon        → longitude
 *   trailHeads.parking    → parking-specific metadata if source is osm:parking
 *   trailHeads.raw        → { source, rank, score, distanceMeters, osmId, osmType,
 *                             osmTags, systemRef, systemSlug, systemName, computedAt }
 *
 * Usage:
 *   npx tsx scripts/backfill-trailheads.ts \
 *     --city "Austin" --state "TX" \
 *     [--limit 50] [--maxPerCluster 3] [--dryRun] [--verbose]
 *
 * Notes:
 *   - dryRun is OFF by default (writes by default). Pass --dryRun to skip writes.
 *   - Overpass concurrency is capped to 1 request at a time with polite delays.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { id as instantId, init } from "@instantdb/admin";

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
    const key  = a.slice(2);
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
const maxPerCluster  = typeof args.maxPerCluster  === "string" ? parseInt(args.maxPerCluster, 10) : 3;
const isDryRun       = !!args.dryRun;
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
console.log("maxPerCluster:  ", maxPerCluster);
console.log("mode:           ", isDryRun ? "DRY RUN (omit --dryRun to write)" : "WRITE");
console.log("verbose:        ", isVerbose);
console.log("==============\n");

// ── types ─────────────────────────────────────────────────────────────────────

type Coord         = [number, number]; // [lon, lat]
type MultiLineCoords = Coord[][];

/** Candidate OSM element after scoring. */
interface ScoredCandidate {
  osmType:        "node" | "way" | "relation";
  osmId:          string;   // e.g. "node/123"
  source:         string;   // e.g. "osm:trailhead", "osm:parking"
  name:           string | null;
  lat:            number;
  lon:            number;
  score:          number;
  distanceMeters: number;
  osmTags:        Record<string, string>;
  capacity:       number | null;
}

/** A trailHead record ready to write. */
interface TrailHeadRecord {
  upsertKey:      string;   // stable composite key → stored in trailSlug
  name:           string;
  lat:            number;
  lon:            number;
  source:         string;
  rank:           number;
  parking:        Record<string, any> | null;
  raw:            Record<string, any>;
  systemRef:      string;   // extSystemRef — for systemRef field
  systemInstantId: string;  // InstantDB id of the trailSystem — for .link()
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
 * Sample N evenly-spaced points along a MultiLine geometry.
 * Used as reference points for distance calculations.
 */
function samplePoints(lines: MultiLineCoords, n = 30): Coord[] {
  const all: Coord[] = [];
  for (const line of lines) for (const pt of line) all.push(pt);
  if (all.length === 0) return [];
  if (all.length <= n)  return all;
  const step = Math.floor(all.length / n);
  const out: Coord[] = [];
  for (let i = 0; i < all.length; i += step) out.push(all[i]);
  return out;
}

/** Minimum haversine distance from a point to any sampled geometry point. */
function minDistToSamples(pt: Coord, samples: Coord[]): number {
  let best = Infinity;
  for (const s of samples) {
    const d = haversineM(pt, s);
    if (d < best) best = d;
  }
  return best;
}

/** Bounding box of lines, padded by bufDeg degrees. */
function bboxOfLines(
  lines: MultiLineCoords,
  bufDeg = 0.003,
): [number, number, number, number] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const line of lines)
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon; if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon; if (lat > maxLat) maxLat = lat;
    }
  if (minLon === Infinity) return null;
  return [minLon - bufDeg, minLat - bufDeg, maxLon + bufDeg, maxLat + bufDeg];
}

/** Collect unique endpoints from a MultiLine (first/last of each line). */
function collectEndpoints(lines: MultiLineCoords): Coord[] {
  const pts: Coord[] = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    pts.push(line[0]);
    if (line.length > 1) pts.push(line[line.length - 1]);
  }
  return pts;
}

/**
 * Group points by proximity (simple greedy clustering).
 * Returns clusters sorted by size desc.
 */
function clusterByProximity(
  pts: Coord[],
  thresholdM = 50,
): Coord[][] {
  const clusters: Coord[][] = [];
  for (const pt of pts) {
    let placed = false;
    for (const cluster of clusters) {
      const centroid = clusterCentroid(cluster);
      if (haversineM(pt, centroid) <= thresholdM) {
        cluster.push(pt);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([pt]);
  }
  clusters.sort((a, b) => b.length - a.length);
  return clusters;
}

function clusterCentroid(pts: Coord[]): Coord {
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of pts) { sumLon += lon; sumLat += lat; }
  return [sumLon / pts.length, sumLat / pts.length];
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
          method:  "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body:    `data=${encodeURIComponent(query)}`,
          signal:  AbortSignal.timeout(90_000),
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

/** Build an Overpass QL query for access POIs within a bounding box. */
function accessPOIQuery([minLon, minLat, maxLon, maxLat]: [number, number, number, number]): string {
  // Overpass bbox order: (minLat, minLon, maxLat, maxLon)
  const b = `${minLat},${minLon},${maxLat},${maxLon}`;
  return `[out:json][timeout:60];
(
  node["highway"="trailhead"](${b});
  way["highway"="trailhead"](${b});
  node["amenity"="parking"](${b});
  way["amenity"="parking"](${b});
  node["entrance"](${b});
  node["barrier"="gate"](${b});
  node["information"~"guidepost|map|board"](${b});
  node["tourism"="information"](${b});
);
out center tags;`;
}

// ── OSM element helpers ───────────────────────────────────────────────────────

function elementLocation(el: any): Coord | null {
  if (el.type === "node" && el.lat != null) return [el.lon, el.lat];
  if (el.center?.lat != null) return [el.center.lon, el.center.lat];
  const geom: { lat: number; lon: number }[] =
    el.geometry ?? el.members?.flatMap((m: any) => m.geometry ?? []) ?? [];
  if (geom.length === 0) return null;
  const sumLon = geom.reduce((s: number, n: any) => s + n.lon, 0);
  const sumLat = geom.reduce((s: number, n: any) => s + n.lat, 0);
  return [sumLon / geom.length, sumLat / geom.length];
}

/** Classify OSM element into a source string. Returns null if not a target POI. */
function classifySource(tags: Record<string, string>): string | null {
  if (tags.highway    === "trailhead")                           return "osm:trailhead";
  if (tags.amenity    === "parking")                             return "osm:parking";
  if (tags.entrance   !== undefined)                             return "osm:entrance";
  if (tags.barrier    === "gate")                                return "osm:gate";
  if (tags.information === "guidepost" ||
      tags.information === "map"       ||
      tags.information === "board")                              return "osm:information";
  if (tags.tourism    === "information")                         return "osm:information";
  return null;
}

/** Scoring heuristic per element. Higher = more likely trailhead access point. */
function scoreElement(tags: Record<string, string>): number {
  let s = 0;
  if (tags.highway  === "trailhead") s += 4;
  if (tags.amenity  === "parking")   s += 4;
  if (tags.entrance !== undefined || tags.barrier === "gate") s += 2;
  if (tags.information === "guidepost" || tags.information === "map" ||
      tags.information === "board"     || tags.tourism === "information") s += 1;
  if (tags.name)     s += 1;
  if (tags.capacity) s += 1;
  return s;
}

const KEPT_TAGS = new Set([
  "name", "highway", "amenity", "entrance", "barrier", "information",
  "tourism", "capacity", "fee", "access", "opening_hours", "operator",
]);

function trimTags(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of KEPT_TAGS) if (raw[k] != null) out[k] = raw[k];
  return out;
}

function parseCapacity(tags: Record<string, string>): number | null {
  if (!tags.capacity) return null;
  const n = parseInt(tags.capacity, 10);
  return Number.isNaN(n) || n <= 0 ? null : n;
}

// ── candidate scoring pipeline ────────────────────────────────────────────────

const MAX_DIST_M = 400; // reject candidates further than this from sampled points

function buildCandidates(
  elements:       any[],
  samplePts:      Coord[],
): ScoredCandidate[] {
  const candidates: ScoredCandidate[] = [];

  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {};
    const source = classifySource(tags);
    if (!source) continue;

    const loc = elementLocation(el);
    if (!loc) continue;

    const dist = minDistToSamples(loc, samplePts);
    if (dist > MAX_DIST_M) continue;

    candidates.push({
      osmType:        el.type as "node" | "way" | "relation",
      osmId:          `${el.type}/${el.id}`,
      source,
      name:           tags.name ?? null,
      lat:            loc[1],
      lon:            loc[0],
      score:          scoreElement(tags),
      distanceMeters: parseFloat(dist.toFixed(1)),
      osmTags:        trimTags(tags),
      capacity:       parseCapacity(tags),
    });
  }

  // Sort: score desc, then distance asc
  candidates.sort((a, b) => b.score - a.score || a.distanceMeters - b.distanceMeters);

  // Deduplicate by osmId (keep first / best)
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.osmId)) return false;
    seen.add(c.osmId);
    return true;
  });
}

// ── fallback: geometry-derived endpoints ──────────────────────────────────────

function buildFallbackCandidates(
  lines: MultiLineCoords,
  maxN:  number,
): { lat: number; lon: number; clusterSize: number }[] {
  const endpoints   = collectEndpoints(lines);
  const clusters    = clusterByProximity(endpoints, 50);
  const topClusters = clusters.slice(0, maxN);

  return topClusters.map((cl) => {
    const [lon, lat] = clusterCentroid(cl);
    return { lat, lon, clusterSize: cl.length };
  });
}

// ── trailHead record builder ──────────────────────────────────────────────────

function buildOSMRecords(
  candidates:   ScoredCandidate[],
  system:       any,
  maxN:         number,
  computedAt:   number,
): TrailHeadRecord[] {
  return candidates.slice(0, maxN).map((c, i) => {
    const rank       = i + 1;
    const upsertKey  = `${system.extSystemRef}::${c.source}::${rank}`;

    const parkingMeta: Record<string, any> | null = c.source === "osm:parking"
      ? {
          osmId:    c.osmId,
          capacity: c.capacity,
          fee:      c.osmTags.fee ?? null,
          access:   c.osmTags.access ?? null,
        }
      : null;

    return {
      upsertKey,
      name:            c.name ?? `${humanSource(c.source)} #${rank}`,
      lat:             c.lat,
      lon:             c.lon,
      source:          c.source,
      rank,
      parking:         parkingMeta,
      systemRef:       system.extSystemRef,
      systemInstantId: system.id,
      raw: {
        source:         c.source,
        rank,
        score:          c.score,
        distanceMeters: c.distanceMeters,
        osmId:          c.osmId,
        osmType:        c.osmType,
        osmTags:        c.osmTags,
        systemRef:      system.extSystemRef,
        systemSlug:     system.slug ?? null,
        systemName:     system.name ?? null,
        computedAt,
      },
    };
  });
}

function buildFallbackRecords(
  fallback:   { lat: number; lon: number; clusterSize: number }[],
  system:     any,
  computedAt: number,
): TrailHeadRecord[] {
  return fallback.map((f, i) => {
    const rank      = i + 1;
    const source    = "derived:endpoints";
    const upsertKey = `${system.extSystemRef}::${source}::${rank}`;

    return {
      upsertKey,
      name:            `${system.name ?? "Trail"} Endpoint #${rank}`,
      lat:             f.lat,
      lon:             f.lon,
      source,
      rank,
      parking:         null,
      systemRef:       system.extSystemRef,
      systemInstantId: system.id,
      raw: {
        source,
        rank,
        score:          0,
        distanceMeters: null,
        osmId:          null,
        osmType:        null,
        osmTags:        null,
        clusterSize:    f.clusterSize,
        systemRef:      system.extSystemRef,
        systemSlug:     system.slug ?? null,
        systemName:     system.name ?? null,
        computedAt,
      },
    };
  });
}

function humanSource(source: string): string {
  const map: Record<string, string> = {
    "osm:trailhead":  "Trailhead",
    "osm:parking":    "Parking",
    "osm:entrance":   "Entrance",
    "osm:gate":       "Gate",
    "osm:information":"Info Point",
  };
  return map[source] ?? source;
}

// ── InstantDB helpers ─────────────────────────────────────────────────────────

function entityList(res: any, name: string): any[] {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });
  console.log("Admin SDK initialized OK\n");

  // ── fetch trailSystems ──
  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems  = entityList(sysRes, "trailSystems");
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

  // ── fetch trailSegments for geometry ──
  console.log("\nFetching trailSegments...");
  const segRes  = await db.query({ trailSegments: { $: { limit: 10000 } } });
  const allSegs = entityList(segRes, "trailSegments");
  console.log(`  Total segments in DB: ${allSegs.length}`);

  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegs) {
    if (!seg.systemRef) continue;
    if (!segsByRef.has(seg.systemRef)) segsByRef.set(seg.systemRef, []);
    segsByRef.get(seg.systemRef)!.push(seg);
  }

  // ── load existing trailHeads to support idempotent upsert ──
  console.log("\nFetching existing trailHeads...");
  const thRes        = await db.query({ trailHeads: { $: { limit: 50000 } } });
  const existingTHs  = entityList(thRes, "trailHeads");
  // Map: upsertKey (trailSlug value) → instantdb id
  const existingMap  = new Map<string, string>();
  for (const th of existingTHs) {
    if (th.trailSlug) existingMap.set(th.trailSlug, th.id);
  }
  console.log(`  Existing trailHeads: ${existingTHs.length}`);

  // ── per-system loop ──
  const COL = 100;
  console.log(`\n${"─".repeat(COL)}`);
  console.log(
    "STATUS".padEnd(16) +
    "SYSTEM".padEnd(46) +
    "HEADS".padStart(6) +
    "  SOURCE".padStart(20),
  );
  console.log("─".repeat(COL));

  let processed        = 0;
  let skippedNoGeom    = 0;
  let osmCount         = 0;
  let fallbackCount    = 0;
  let overpassFailed   = 0;
  let totalHeads       = 0;
  const pendingWrites: TrailHeadRecord[] = [];

  const computedAt = Date.now();

  for (const system of systems) {
    const label = (system.slug ?? system.name ?? system.id).slice(0, 45);

    // Reconstruct geometry from segments
    const segs        = segsByRef.get(system.extSystemRef) ?? [];
    const systemLines: MultiLineCoords = [];
    for (const seg of segs) {
      if (!seg.geometry) continue;
      try { systemLines.push(...extractLines(seg.geometry)); } catch { /* skip */ }
    }

    if (systemLines.length === 0) {
      console.log(`${"SKIP (no geom)".padEnd(16)}${label}`);
      skippedNoGeom++;
      continue;
    }

    const bbox = bboxOfLines(systemLines, 0.003);
    if (!bbox) {
      console.log(`${"SKIP (no bbox)".padEnd(16)}${label}`);
      skippedNoGeom++;
      continue;
    }

    const samplePts = samplePoints(systemLines, 30);

    // ── Overpass query ──
    let elements: any[] = [];
    let overpassOk = true;
    try {
      elements = await overpassPost(accessPOIQuery(bbox));
      await sleep(800); // polite delay between requests
    } catch (err: any) {
      console.warn(`  ERROR (Overpass) for "${label}": ${err.message}`);
      overpassOk = false;
      overpassFailed++;
    }

    // ── Score & pick candidates ──
    const candidates = overpassOk
      ? buildCandidates(elements, samplePts)
      : [];

    let records: TrailHeadRecord[];
    let sourceLabel: string;

    if (candidates.length > 0) {
      records      = buildOSMRecords(candidates, system, maxPerCluster, computedAt);
      sourceLabel  = records.map((r) => r.source).join(", ");
      osmCount++;
    } else {
      // Fallback to geometry-derived endpoints
      const fallback = buildFallbackCandidates(systemLines, maxPerCluster);
      if (fallback.length === 0) {
        console.log(`${"SKIP (no heads)".padEnd(16)}${label}`);
        skippedNoGeom++;
        continue;
      }
      records     = buildFallbackRecords(fallback, system, computedAt);
      sourceLabel = "derived:endpoints";
      fallbackCount++;
    }

    processed++;
    totalHeads += records.length;
    pendingWrites.push(...records);

    const status = isDryRun ? "WOULD WRITE" : "WRITE";
    console.log(
      `${status.padEnd(16)}${label.padEnd(46)}` +
      `${String(records.length).padStart(6)}` +
      `  ${sourceLabel.slice(0, 18)}`,
    );

    if (isVerbose) {
      for (const r of records) {
        console.log(
          `    [rank${r.rank}] ${r.name.slice(0, 40)} ` +
          `@(${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}) ` +
          `src=${r.source}` +
          (r.raw.score ? ` score=${r.raw.score}` : "") +
          (r.raw.distanceMeters != null ? ` dist=${r.raw.distanceMeters}m` : ""),
        );
      }
    }
  }

  console.log("─".repeat(COL));

  // ── summary ──
  console.log("\n=== BACKFILL TRAILHEADS SUMMARY ===");
  console.log(`Systems processed:          ${processed}`);
  console.log(`Systems skipped (no geom):  ${skippedNoGeom}`);
  console.log(`Systems with OSM trailheads:${osmCount}`);
  console.log(`Systems using fallback:     ${fallbackCount}`);
  console.log(`Overpass failures:          ${overpassFailed}`);
  console.log(`Total trailHeads to write:  ${totalHeads}`);
  console.log(`Existing trailHeads in DB:  ${existingTHs.length}`);
  const toUpdate = pendingWrites.filter((r) => existingMap.has(r.upsertKey)).length;
  const toCreate = pendingWrites.filter((r) => !existingMap.has(r.upsertKey)).length;
  console.log(`  → UPDATE (existing):      ${toUpdate}`);
  console.log(`  → CREATE (new):           ${toCreate}`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Omit --dryRun to persist changes to InstantDB.");
    return;
  }

  if (pendingWrites.length === 0) { console.log("\nNothing to write."); return; }

  // ── upsert trailHeads ──
  console.log(`\nUpserting ${pendingWrites.length} trailHead(s)...`);
  const BATCH = 50;
  let written = 0;

  for (let i = 0; i < pendingWrites.length; i += BATCH) {
    const chunk = pendingWrites.slice(i, i + BATCH);

    const txSteps = chunk.flatMap((r) => {
      // Determine the InstantDB record id: reuse existing or generate new
      const existingInstantId = existingMap.get(r.upsertKey);
      const recordId = existingInstantId ?? instantId();

      const data: Record<string, any> = {
        trailSlug: r.upsertKey,
        name:      r.name,
        lat:       r.lat,
        lon:       r.lon,
        systemRef: r.systemRef,
        raw:       r.raw,
      };
      if (r.parking !== null) data.parking = r.parking;

      return [
        (db as any).tx.trailHeads[recordId].update(data),
        (db as any).tx.trailHeads[recordId].link({ system: r.systemInstantId }),
      ];
    });

    await db.transact(txSteps);
    written += chunk.length;
    console.log(`  Written ${written}/${pendingWrites.length}...`);
  }

  console.log(`\nDone. ${written} trailHead(s) upserted.`);
  console.log("===================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
