#!/usr/bin/env npx tsx
/**
 * Night + Winter Proxy enrichment for trailSystems (OSM-only v1).
 *
 * For each trailSystem:
 *   1. Compute bbox from segment geometry
 *   2. Fetch walkable ways (with lighting/surface/winter tags) via Overpass
 *   3. Fetch street lamp nodes via Overpass
 *   4. Sample points along trail every sampleMeters
 *   5. Compute Night proxy: lit coverage of trail
 *   6. Compute Winter proxy: paved surface coverage + explicit winter tags
 *   7. Persist scores, classes, reasons, signals to trailSystems
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-night-winter.ts \
 *     --city "Austin" --state "TX" \
 *     [--sampleMeters 50] [--nearMeters 30] \
 *     [--limit 5] [--write] [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { loadOsmCategory, filterByBbox, type OsmLocalIndex } from "./lib/osmLocal.js";

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

const args         = parseArgs(process.argv.slice(2));
const cityFilter   = typeof args.city         === "string" ? args.city         : undefined;
const stateFilter  = typeof args.state        === "string" ? args.state        : undefined;
const limitArg     = typeof args.limit        === "string" ? parseInt(args.limit, 10) : undefined;
const sampleMeters = typeof args.sampleMeters === "string" ? parseFloat(args.sampleMeters) : 50;
const nearMeters   = typeof args.nearMeters   === "string" ? parseFloat(args.nearMeters)   : 30;
const isDryRun     = !args.write;
const isVerbose    = !!args.verbose;
const minLength    = typeof args["min-length"] === "string" ? parseFloat(args["min-length"]) : undefined;

// Street lamp enhancement — count lamps within this radius of trail
const LAMP_NEAR_M  = 50;

if (!cityFilter) { console.error("Error: --city is required"); process.exit(1); }

// ── InstantDB ─────────────────────────────────────────────────────────────────
const appId      = process.env.INSTANT_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
if (!appId)      { console.error("Error: INSTANT_APP_ID missing");      process.exit(1); }
if (!adminToken) { console.error("Error: INSTANT_ADMIN_TOKEN missing"); process.exit(1); }

const maskToken = (t?: string) =>
  !t || t.length < 10 ? (t ? "***" : "(none)") : t.slice(0, 6) + "..." + t.slice(-4);

console.log("=== CONFIG ===");
console.log("appId:         ", appId);
console.log("token:         ", maskToken(adminToken));
console.log("city:          ", cityFilter);
console.log("state:         ", stateFilter ?? "(not set)");
console.log("limit:         ", limitArg ?? "(all)");
console.log("sampleMeters:  ", sampleMeters, "m");
console.log("nearMeters:    ", nearMeters, "m");
console.log("lampNearM:     ", LAMP_NEAR_M, "m");
console.log("mode:          ", isDryRun ? "DRY RUN (pass --write to persist)" : "WRITE");
console.log("verbose:       ", isVerbose);
console.log("==============\n");

// ── types ─────────────────────────────────────────────────────────────────────
type Coord         = [number, number]; // [lon, lat]
type MultiLineCoords = Coord[][];

type NightClass  = "low" | "medium" | "high";
type WinterClass = "low" | "medium" | "high";

interface NightWinterSignals {
  totalSamples: number;
  litKnownSamples: number;
  litYesSamples: number;
  explicitUnlitSamples: number;
  litPercentKnown: number;
  litCoverageProxy: number;
  streetLampCountNearTrail: number;
  lampDensityPerKm: number;
  relevantWayCount: number;
  pavedWayLengthM: number;
  totalWayLengthM: number;
  pavedPercentProxy: number;
  winterTagFound: string | null;
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

/** Minimum distance from point p to line segment [a, b] in metres. */
function pointToSegmentM(p: Coord, a: Coord, b: Coord): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return haversineM(p, a);
  const t = Math.max(0, Math.min(1,
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
  ));
  const closest: Coord = [a[0] + t * dx, a[1] + t * dy];
  return haversineM(p, closest);
}

/** Minimum distance from point p to any segment of the MultiLine in metres. */
function distanceToMultiLineM(p: Coord, lines: MultiLineCoords): number {
  let min = Infinity;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const d = pointToSegmentM(p, line[i], line[i + 1]);
      if (d < min) min = d;
    }
  }
  return min;
}

function extractLines(geom: any): MultiLineCoords {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString")      return [geom.coordinates as Coord[]];
  if (geom.type === "MultiLineString") return geom.coordinates as MultiLineCoords;
  return [];
}

/** Total length of a MultiLine in metres. */
function multiLineLength(lines: MultiLineCoords): number {
  let total = 0;
  for (const line of lines)
    for (let i = 0; i + 1 < line.length; i++)
      total += haversineM(line[i], line[i + 1]);
  return total;
}

/**
 * Sample evenly-spaced points along a MultiLine.
 * Returns at least minPoints, spaced ~stepM apart.
 */
function sampleAlongMultiLine(
  lines: MultiLineCoords,
  stepM: number,
  minPoints = 10,
): Coord[] {
  // Flatten all line segments into (start, end, cumulative_start_dist)
  const segs: { a: Coord; b: Coord; start: number; len: number }[] = [];
  let cumLen = 0;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const len = haversineM(line[i], line[i + 1]);
      segs.push({ a: line[i], b: line[i + 1], start: cumLen, len });
      cumLen += len;
    }
  }
  if (segs.length === 0) return [];

  const totalLen = cumLen;
  const effectiveStep = Math.min(stepM, totalLen / Math.max(1, minPoints - 1));
  const points: Coord[] = [];
  let dist = 0;

  while (dist <= totalLen + 1e-6) {
    // Find the segment containing `dist`
    for (const seg of segs) {
      if (dist >= seg.start && dist <= seg.start + seg.len + 1e-6) {
        const t = seg.len > 0 ? Math.min(1, (dist - seg.start) / seg.len) : 0;
        points.push([
          seg.a[0] + t * (seg.b[0] - seg.a[0]),
          seg.a[1] + t * (seg.b[1] - seg.a[1]),
        ]);
        break;
      }
    }
    dist += effectiveStep;
  }

  // Always include the very last point
  const lastLine = lines[lines.length - 1];
  if (lastLine && lastLine.length > 0) {
    const last = lastLine[lastLine.length - 1];
    const prev = points[points.length - 1];
    if (!prev || haversineM(prev, last) > 1) points.push(last);
  }

  return points;
}

/**
 * Compute bbox [minLon, minLat, maxLon, maxLat] from a MultiLine.
 * Returns Overpass-format (minLat,minLon,maxLat,maxLon) padded by paddingM.
 */
function bboxForOverpass(lines: MultiLineCoords, paddingM: number): string | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const line of lines) {
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!isFinite(minLon)) return null;
  const dLat = (paddingM / 6_371_000) * (180 / Math.PI);
  const midLat = (minLat + maxLat) / 2;
  const dLon = dLat / Math.cos((midLat * Math.PI) / 180);
  return `${(minLat - dLat).toFixed(6)},${(minLon - dLon).toFixed(6)},` +
         `${(maxLat + dLat).toFixed(6)},${(maxLon + dLon).toFixed(6)}`;
}

/** Compute bbox [minLon, minLat, maxLon, maxLat] from MultiLine with padding in metres. */
function bboxArray(lines: MultiLineCoords, paddingM: number): [number, number, number, number] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const line of lines) {
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (!isFinite(minLon)) return null;
  const dLat = (paddingM / 6_371_000) * (180 / Math.PI);
  const midLat = (minLat + maxLat) / 2;
  const dLon = dLat / Math.cos((midLat * Math.PI) / 180);
  return [minLon - dLon, minLat - dLat, maxLon + dLon, maxLat + dLat];
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

/** Query A: walkable ways with lighting/surface/winter tags. */
function walkableWaysQuery(bbox: string): string {
  return `[out:json][timeout:60];
(
  way["highway"~"path|footway|cycleway|track|pedestrian|living_street|residential|service"](${bbox});
);
out geom tags;`;
}

/** Query B: street lamp nodes. */
function streetLampsQuery(bbox: string): string {
  return `[out:json][timeout:60];
(
  node["highway"="street_lamp"](${bbox});
);
out tags;`;
}

// ── Way processing helpers ────────────────────────────────────────────────────

/**
 * Parse the geometry nodes from an Overpass way (out geom).
 * Returns array of [lon, lat] pairs.
 */
function wayGeom(el: any): Coord[] {
  const nodes: { lat: number; lon: number }[] = el.geometry ?? [];
  return nodes.map((n) => [n.lon, n.lat] as Coord);
}

/**
 * Find the minimum distance from point p to any segment of a way.
 */
function distToWay(p: Coord, wayCoords: Coord[]): number {
  let min = Infinity;
  for (let i = 0; i + 1 < wayCoords.length; i++) {
    const d = pointToSegmentM(p, wayCoords[i], wayCoords[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Compute total length of a way's geometry in metres.
 */
function wayLength(coords: Coord[]): number {
  let len = 0;
  for (let i = 0; i + 1 < coords.length; i++)
    len += haversineM(coords[i], coords[i + 1]);
  return len;
}

// ── Surface / pavement classification ────────────────────────────────────────

const PAVED_SURFACES = new Set([
  "asphalt", "concrete", "paving_stones", "paved",
  "sett", "metal", "rubber", "concrete:plates", "concrete:lanes",
]);

const PAVED_HIGHWAY_CLASSES = new Set([
  "residential", "living_street", "pedestrian", "cycleway",
]);

function isPaved(tags: Record<string, string>): boolean {
  if (tags.surface && PAVED_SURFACES.has(tags.surface)) return true;
  if (tags.highway && PAVED_HIGHWAY_CLASSES.has(tags.highway)) return true;
  return false;
}

// ── Night scoring ─────────────────────────────────────────────────────────────

type LitStatus = "yes" | "no" | "unknown";

function getLitStatus(tags: Record<string, string>): LitStatus {
  const lit = (tags.lit ?? "").toLowerCase().trim();
  if (lit === "yes" || lit === "24/7") return "yes";
  if (lit === "no") return "no";
  return "unknown";
}

interface NightResult {
  nightScore: number;
  nightClass: NightClass;
  nightFriendly: boolean;
  nightReasons: string[];
}

function computeNightScore(
  litKnownSamples: number,
  litYesSamples: number,
  totalSamples: number,
  streetLampCount: number,
  trailLengthKm: number,
): NightResult {
  let nightScore = 0;

  if (litKnownSamples > 0) {
    const litPercentKnown = litYesSamples / litKnownSamples;
    const litCoverageProxy = litYesSamples / totalSamples;
    nightScore = 0.7 * litPercentKnown + 0.3 * litCoverageProxy;
  }

  // Street lamp enhancement
  const lampDensity = streetLampCount / (trailLengthKm + 0.5);
  const lampBoost = Math.min(0.2, lampDensity * 0.03);
  nightScore = Math.min(1, Math.max(0, nightScore + lampBoost));

  const nightClass: NightClass =
    nightScore >= 0.60 ? "high" :
    nightScore >= 0.25 ? "medium" : "low";

  const nightFriendly = nightClass === "high";

  const reasons: string[] = [];
  if (litKnownSamples === 0 && streetLampCount < 5) {
    reasons.push("No explicit lighting tags nearby (conservative)");
  }
  if (nightClass === "high") {
    reasons.push("Many nearby ways tagged as lit");
  } else if (nightClass === "medium") {
    reasons.push("Some nearby ways tagged as lit");
  }
  if (streetLampCount >= 10) {
    reasons.push("Street lamps along the route");
  }
  if (reasons.length === 0) {
    reasons.push("Limited or no lighting data nearby");
  }

  return {
    nightScore: parseFloat(nightScore.toFixed(3)),
    nightClass,
    nightFriendly,
    nightReasons: reasons.slice(0, 5),
  };
}

// ── Winter scoring ────────────────────────────────────────────────────────────

interface WinterResult {
  winterScore: number;
  winterClass: WinterClass;
  winterLikelyMaintained: boolean;
  winterReasons: string[];
}

function computeWinterScore(
  pavedPercentProxy: number,
  winterTagFound: string | null,
): WinterResult {
  const winterScore = Math.min(1, Math.max(0,
    0.70 * pavedPercentProxy +
    0.30 * (winterTagFound !== null ? 1.0 : 0.0),
  ));

  const winterClass: WinterClass =
    winterScore >= 0.65 ? "high" :
    winterScore >= 0.30 ? "medium" : "low";

  const winterLikelyMaintained = winterClass === "high";

  const reasons: string[] = [];
  if (winterTagFound !== null) {
    reasons.push(`Explicit winter service tag present (${winterTagFound})`);
  }
  if (pavedPercentProxy >= 0.6) {
    reasons.push("Mostly paved/urban-adjacent surfaces");
  } else if (pavedPercentProxy >= 0.3) {
    reasons.push("Mix of paved and natural surfaces");
  }
  if (winterClass === "low") {
    reasons.push("Mostly natural surfaces; likely less maintained");
  }
  if (reasons.length === 0) {
    reasons.push("Limited surface data nearby");
  }

  return {
    winterScore: parseFloat(winterScore.toFixed(3)),
    winterClass,
    winterLikelyMaintained,
    winterReasons: reasons.slice(0, 5),
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

  // ── load local OSM indexes ──
  const surfaceIndex: OsmLocalIndex | null = loadOsmCategory(cityFilter!, "surface");
  if (surfaceIndex) {
    console.log(`  Local OSM surface index loaded (${surfaceIndex.elements.length} elements)`);
  } else {
    console.log("  No local OSM surface cache — will use Overpass API for walkable ways");
  }
  const hazardsIndex: OsmLocalIndex | null = loadOsmCategory(cityFilter!, "hazards");
  if (hazardsIndex) {
    console.log(`  Local OSM hazards index loaded (${hazardsIndex.elements.length} elements)`);
  } else {
    console.log("  No local OSM hazards cache — will use Overpass API for street lamps");
  }

  // ── per-system loop ──
  const COL = 120;
  console.log(`\n${"─".repeat(COL)}`);
  console.log(
    "STATUS".padEnd(14) +
    "SYSTEM".padEnd(44) +
    "SMPL".padStart(6) +
    " LITK".padStart(6) +
    " LITY".padStart(6) +
    " LMPS".padStart(6) +
    " NSCO".padStart(6) +
    " NCLS".padStart(7) +
    " WPAV".padStart(6) +
    " WSCO".padStart(6) +
    " WCLS".padStart(7),
  );
  console.log("─".repeat(COL));

  let processed = 0, skipped = 0;
  let sumNight = 0, sumWinter = 0;
  const nightCounts: Record<NightClass, number>  = { low: 0, medium: 0, high: 0 };
  const winterCounts: Record<WinterClass, number> = { low: 0, medium: 0, high: 0 };
  let nightFriendlyCount = 0, winterMaintainedCount = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

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

    if ((system.lengthMilesTotal as number ?? 0) < 1) {
      console.log(`${"SKIP (<1mi)".padEnd(14)}${displayName}`);
      skipped++;
      continue;
    }

    const bbox = bboxForOverpass(systemLines, nearMeters + 50);
    if (!bbox) {
      console.log(`${"SKIP (no bbox)".padEnd(14)}${displayName}`);
      skipped++;
      continue;
    }

    // ── Query OSM data — prefer local indexes, fall back to Overpass ──
    let wayElements: any[] = [];
    let lampElements: any[] = [];
    const localBbox = bboxArray(systemLines, nearMeters + 50);

    if (surfaceIndex && localBbox) {
      const localWays = filterByBbox(surfaceIndex, localBbox);
      wayElements = localWays.map((el) => ({
        type: el.type,
        id: Number(el.id.replace(/\D/g, "")),
        tags: el.tags,
        geometry: (el.geometry || []).map((p) => ({ lat: p.lat, lon: p.lon })),
      }));
    } else {
      try {
        wayElements = await overpassPost(walkableWaysQuery(bbox));
        await sleep(600);
      } catch (err: any) {
        console.warn(`  WARN (Overpass ways) for ${displayName}: ${err.message}`);
      }
    }

    if (hazardsIndex && localBbox) {
      const localLamps = filterByBbox(hazardsIndex, localBbox);
      lampElements = localLamps
        .filter((el) => el.tags.highway === "street_lamp")
        .map((el) => ({
          type: el.type,
          id: Number(el.id.replace(/\D/g, "")),
          lat: el.lat,
          lon: el.lon,
          tags: el.tags,
        }));
    } else {
      try {
        lampElements = await overpassPost(streetLampsQuery(bbox));
        await sleep(600);
      } catch (err: any) {
        console.warn(`  WARN (Overpass lamps) for ${displayName}: ${err.message}`);
      }
    }

    // ── Parse ways: compute geometry + tags ──
    interface WayInfo {
      coords: Coord[];
      len: number;
      tags: Record<string, string>;
    }
    const ways: WayInfo[] = [];
    for (const el of wayElements) {
      if (el.type !== "way") continue;
      const coords = wayGeom(el);
      if (coords.length < 2) continue;
      ways.push({ coords, len: wayLength(coords), tags: el.tags ?? {} });
    }

    // ── Parse lamp nodes ──
    interface LampNode { coord: Coord; }
    const lamps: LampNode[] = [];
    for (const el of lampElements) {
      if (el.type === "node" && el.lat != null)
        lamps.push({ coord: [el.lon, el.lat] });
    }

    // ── Sample trail points ──
    const samples = sampleAlongMultiLine(systemLines, sampleMeters, 10);
    const totalSamples = samples.length;
    const trailLengthKm = multiLineLength(systemLines) / 1000;

    // ── Night: per-sample nearest way classification ──
    let litKnownSamples = 0, litYesSamples = 0, explicitUnlitSamples = 0;

    for (const sample of samples) {
      // Find nearest way within nearMeters
      let nearestLit: LitStatus = "unknown";
      let nearestDist = Infinity;

      for (const way of ways) {
        const dist = distToWay(sample, way.coords);
        if (dist <= nearMeters && dist < nearestDist) {
          nearestDist = dist;
          nearestLit = getLitStatus(way.tags);
        }
      }

      if (nearestLit === "yes") {
        litKnownSamples++;
        litYesSamples++;
      } else if (nearestLit === "no") {
        litKnownSamples++;
        explicitUnlitSamples++;
      }
      // "unknown" doesn't count toward litKnownSamples
    }

    // ── Street lamp count near trail ──
    let streetLampCountNearTrail = 0;
    for (const lamp of lamps) {
      const d = distanceToMultiLineM(lamp.coord, systemLines);
      if (d <= LAMP_NEAR_M) streetLampCountNearTrail++;
    }

    // ── Winter: length-weighted paved fraction from nearby ways ──
    // Only count ways that are near the trail (at least one sample within nearMeters)
    let pavedWayLengthM = 0;
    let totalWayLengthM = 0;
    let winterTagFound: string | null = null;

    for (const way of ways) {
      // Check if way is near trail: find min distance from any sample to this way
      let isNear = false;
      for (const sample of samples) {
        const d = distToWay(sample, way.coords);
        if (d <= nearMeters) { isNear = true; break; }
      }
      if (!isNear) continue;

      totalWayLengthM += way.len;
      if (isPaved(way.tags)) pavedWayLengthM += way.len;

      // Check winter tags
      if (winterTagFound === null) {
        const wt = way.tags.winter_service ?? way.tags.winter_road ?? way.tags.snowplowing ?? null;
        if (wt !== null) winterTagFound = wt;
      }
    }

    const pavedPercentProxy = totalWayLengthM > 0
      ? pavedWayLengthM / totalWayLengthM
      : 0;

    // ── Score & classify ──
    const nightResult = computeNightScore(
      litKnownSamples, litYesSamples, totalSamples,
      streetLampCountNearTrail, trailLengthKm,
    );
    const winterResult = computeWinterScore(pavedPercentProxy, winterTagFound);

    // ── Build signals blob ──
    const litPercentKnown = litKnownSamples > 0
      ? parseFloat((litYesSamples / litKnownSamples).toFixed(3))
      : 0;
    const litCoverageProxy = parseFloat((litYesSamples / Math.max(1, totalSamples)).toFixed(3));

    const signals: NightWinterSignals = {
      totalSamples,
      litKnownSamples,
      litYesSamples,
      explicitUnlitSamples,
      litPercentKnown,
      litCoverageProxy,
      streetLampCountNearTrail,
      lampDensityPerKm: parseFloat((streetLampCountNearTrail / (trailLengthKm + 0.5)).toFixed(2)),
      relevantWayCount: ways.filter((w) => {
        for (const s of samples) if (distToWay(s, w.coords) <= nearMeters) return true;
        return false;
      }).length,
      pavedWayLengthM: parseFloat(pavedWayLengthM.toFixed(1)),
      totalWayLengthM: parseFloat(totalWayLengthM.toFixed(1)),
      pavedPercentProxy: parseFloat(pavedPercentProxy.toFixed(3)),
      winterTagFound,
    };

    processed++;
    sumNight  += nightResult.nightScore;
    sumWinter += winterResult.winterScore;
    nightCounts[nightResult.nightClass]++;
    winterCounts[winterResult.winterClass]++;
    if (nightResult.nightFriendly)           nightFriendlyCount++;
    if (winterResult.winterLikelyMaintained) winterMaintainedCount++;

    const status = isDryRun ? "WOULD UPDATE" : "UPDATE";
    console.log(
      `${status.padEnd(14)}${displayName.padEnd(44)}` +
      `${String(totalSamples).padStart(6)}` +
      `${String(litKnownSamples).padStart(6)}` +
      `${String(litYesSamples).padStart(6)}` +
      `${String(streetLampCountNearTrail).padStart(6)}` +
      `${nightResult.nightScore.toFixed(2).padStart(6)}` +
      `  ${nightResult.nightClass.padEnd(6)}` +
      `${pavedPercentProxy.toFixed(2).padStart(6)}` +
      `${winterResult.winterScore.toFixed(2).padStart(6)}` +
      `  ${winterResult.winterClass}`,
    );

    if (isVerbose) {
      console.log(`    night:  ${nightResult.nightReasons.join(" | ")}`);
      console.log(`    winter: ${winterResult.winterReasons.join(" | ")}`);
      console.log(`    lamps=${streetLampCountNearTrail}  paved=${pavedWayLengthM.toFixed(0)}m/${totalWayLengthM.toFixed(0)}m  winterTag=${winterTagFound ?? "none"}`);
    }

    const now = Date.now();
    const payload: Record<string, any> = {
      nightScore:                nightResult.nightScore,
      nightClass:                nightResult.nightClass,
      nightFriendly:             nightResult.nightFriendly,
      litKnownSamples,
      litYesSamples,
      litPercentKnown,
      streetLampCountNearTrail,
      nightLastComputedAt:       now,
      nightReasons:              nightResult.nightReasons,
      winterScore:               winterResult.winterScore,
      winterClass:               winterResult.winterClass,
      winterLikelyMaintained:    winterResult.winterLikelyMaintained,
      pavedPercentProxy:         parseFloat(pavedPercentProxy.toFixed(3)),
      winterLastComputedAt:      now,
      winterReasons:             winterResult.winterReasons,
      nightWinterSignals:        signals,
    };
    if (winterTagFound !== null) payload.winterTagFound = winterTagFound;

    updates.push({ systemId: system.id, payload });
  }

  console.log("─".repeat(COL));

  // ── summary ──
  const avgNight  = processed > 0 ? (sumNight  / processed).toFixed(3) : "n/a";
  const avgWinter = processed > 0 ? (sumWinter / processed).toFixed(3) : "n/a";
  const pct = (n: number) => processed > 0 ? ((n / processed) * 100).toFixed(1) + "%" : "n/a";

  console.log("\n=== NIGHT + WINTER ENRICHMENT SUMMARY ===");
  console.log(`Systems processed:         ${processed}`);
  console.log(`Systems skipped:           ${skipped}  (no geometry/bbox)`);
  console.log(`Avg nightScore:            ${avgNight}`);
  console.log(`nightClass=low:            ${nightCounts.low}  (${pct(nightCounts.low)})`);
  console.log(`nightClass=medium:         ${nightCounts.medium}  (${pct(nightCounts.medium)})`);
  console.log(`nightClass=high:           ${nightCounts.high}  (${pct(nightCounts.high)})`);
  console.log(`nightFriendly:             ${nightFriendlyCount}  (${pct(nightFriendlyCount)})`);
  console.log(`Avg winterScore:           ${avgWinter}`);
  console.log(`winterClass=low:           ${winterCounts.low}  (${pct(winterCounts.low)})`);
  console.log(`winterClass=medium:        ${winterCounts.medium}  (${pct(winterCounts.medium)})`);
  console.log(`winterClass=high:          ${winterCounts.high}  (${pct(winterCounts.high)})`);
  console.log(`winterLikelyMaintained:    ${winterMaintainedCount}  (${pct(winterMaintainedCount)})`);

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

  console.log(`\nDone. ${written} system(s) enriched with night+winter data.`);
  console.log("==========================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
