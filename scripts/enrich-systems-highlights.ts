#!/usr/bin/env npx tsx
/**
 * Highlights / Scenic POIs enrichment for trailSystems (OSM-derived).
 *
 * For each trailSystem:
 *   1. Compute bbox from segment geometry
 *   2. Fetch highlight candidates from Overpass (viewpoints, waterfalls, peaks, etc.)
 *   3. Parse GeoJSON Point locations (node lat/lon or way/relation center)
 *   4. Filter by distance to trail geometry (default 150m)
 *   5. Deduplicate, sort, cap at 40
 *   6. Persist highlights array + counts to trailSystems
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-highlights.ts \
 *     --city "Austin" --state "TX" \
 *     [--nearMeters 150] [--limit 5] [--write] [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { loadOsmCategory, filterByBbox as osmFilterByBbox, type OsmLocalIndex } from "./lib/osmLocal.js";

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
const cityFilter   = typeof args.city       === "string" ? args.city       : undefined;
const osmCityArg   = typeof args["osm-city"] === "string" ? args["osm-city"] : undefined;
const stateFilter  = typeof args.state      === "string" ? args.state      : undefined;
const limitArg     = typeof args.limit      === "string" ? parseInt(args.limit, 10) : undefined;
const nearMeters   = typeof args.nearMeters === "string" ? parseFloat(args.nearMeters) : 150;
const isDryRun     = !args.write;
const isVerbose    = !!args.verbose;
const minLength    = typeof args["min-length"] === "string" ? parseFloat(args["min-length"]) : undefined;
const skipExisting = !!args["skip-existing"];

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
console.log("nearMeters:    ", nearMeters, "m");
console.log("mode:          ", isDryRun ? "DRY RUN (pass --write to persist)" : "WRITE");
console.log("verbose:       ", isVerbose);
console.log("==============\n");

// ── types ─────────────────────────────────────────────────────────────────────
type Coord         = [number, number]; // [lon, lat]
type MultiLineCoords = Coord[][];

type HighlightKind =
  | "viewpoint"
  | "waterfall"
  | "peak"
  | "cave_entrance"
  | "spring"
  | "attraction"
  | "historic"
  | "ruins";

const ALL_KINDS: HighlightKind[] = [
  "viewpoint", "waterfall", "peak", "cave_entrance",
  "spring", "attraction", "historic", "ruins",
];

type HighlightsByType = Record<HighlightKind, number>;

interface GeoJsonPoint { type: "Point"; coordinates: Coord; }

interface Highlight {
  osmType: "node" | "way" | "relation";
  osmId: string;
  kind: HighlightKind;
  name: string | null;
  location: GeoJsonPoint;
  distanceToTrailMeters: number;
  tags: Record<string, string>;
}

const KEPT_TAGS = new Set(["name", "tourism", "natural", "waterway", "historic", "ruins", "ele"]);
const MAX_HIGHLIGHTS = 40;

// ── geometry helpers ──────────────────────────────────────────────────────────

function haversineM(a: Coord, b: Coord): number {
  const R  = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180, φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Minimum distance from point p to a line segment [a, b] in metres. */
function pointToSegmentM(p: Coord, a: Coord, b: Coord): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return haversineM(p, a);
  const t = Math.max(0, Math.min(1,
    ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy),
  ));
  const closest: Coord = [a[0] + t * dx, a[1] + t * dy];
  return haversineM(p, closest);
}

/** Minimum distance from point p to any segment of the MultiLine. */
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

/**
 * Compute bounding box [minLon, minLat, maxLon, maxLat] from a MultiLine.
 * Overpass bbox format: (minLat, minLon, maxLat, maxLon)
 */
function computeBbox(lines: MultiLineCoords): [number, number, number, number] | null {
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
  return [minLon, minLat, maxLon, maxLat];
}

/** Expand bbox by paddingM metres on each side. */
function expandBbox(
  bbox: [number, number, number, number],
  paddingM: number,
): [number, number, number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
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

// ── query builder ─────────────────────────────────────────────────────────────

/**
 * Build an Overpass bbox query for highlight POIs.
 * bbox format for Overpass: (minLat, minLon, maxLat, maxLon)
 */
function highlightsQuery(
  minLon: number, minLat: number, maxLon: number, maxLat: number,
): string {
  const b = `${minLat},${minLon},${maxLat},${maxLon}`;
  return `[out:json][timeout:60];
(
  node["tourism"="viewpoint"](${b});
  way["tourism"="viewpoint"](${b});
  relation["tourism"="viewpoint"](${b});

  node["waterway"="waterfall"](${b});
  way["waterway"="waterfall"](${b});
  relation["waterway"="waterfall"](${b});

  node["natural"="waterfall"](${b});
  way["natural"="waterfall"](${b});
  relation["natural"="waterfall"](${b});

  node["natural"="peak"](${b});
  way["natural"="peak"](${b});
  relation["natural"="peak"](${b});

  node["natural"="cave_entrance"](${b});
  way["natural"="cave_entrance"](${b});
  relation["natural"="cave_entrance"](${b});

  node["natural"="spring"](${b});
  way["natural"="spring"](${b});
  relation["natural"="spring"](${b});

  node["tourism"="attraction"](${b});
  way["tourism"="attraction"](${b});
  relation["tourism"="attraction"](${b});

  node["historic"](${b});
  way["historic"](${b});
  relation["historic"](${b});

  node["ruins"="yes"](${b});
  way["ruins"="yes"](${b});
);
out center tags;`;
}

// ── POI parsing ───────────────────────────────────────────────────────────────

function classifyKind(tags: Record<string, string>): HighlightKind | null {
  if (tags.tourism === "viewpoint")                       return "viewpoint";
  if (tags.waterway === "waterfall" || tags.natural === "waterfall") return "waterfall";
  if (tags.natural === "peak")                            return "peak";
  if (tags.natural === "cave_entrance")                   return "cave_entrance";
  if (tags.natural === "spring")                          return "spring";
  if (tags.tourism === "attraction")                      return "attraction";
  if (tags.ruins === "yes")                               return "ruins";
  if (tags.historic !== undefined)                        return "historic";
  return null;
}

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

function trimTags(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of KEPT_TAGS) if (raw[k] != null) out[k] = raw[k];
  return out;
}

/** Parse raw Overpass elements into Highlight candidates (unfiltered). */
function parseElements(elements: any[]): Omit<Highlight, "distanceToTrailMeters">[] {
  const results: Omit<Highlight, "distanceToTrailMeters">[] = [];
  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {};
    const kind = classifyKind(tags);
    if (!kind) continue;

    const loc = elementLocation(el);
    if (!loc) continue;

    results.push({
      osmType: el.type as "node" | "way" | "relation",
      osmId:   `${el.type}/${el.id}`,
      kind,
      name:    tags.name ?? null,
      location: { type: "Point", coordinates: loc },
      tags:    trimTags(tags),
    });
  }
  return results;
}

// ── dedupe ────────────────────────────────────────────────────────────────────

function deduplicateHighlights(highlights: Highlight[]): Highlight[] {
  const map = new Map<string, Highlight>();
  for (const h of highlights) {
    const key = `${h.osmId}|${h.kind}`;
    const existing = map.get(key);
    if (!existing || h.distanceToTrailMeters < existing.distanceToTrailMeters) {
      map.set(key, h);
    }
  }
  return [...map.values()];
}

// ── count by type ─────────────────────────────────────────────────────────────

function countByType(highlights: Highlight[]): HighlightsByType {
  const counts = Object.fromEntries(ALL_KINDS.map((k) => [k, 0])) as HighlightsByType;
  for (const h of highlights) counts[h.kind]++;
  return counts;
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
  if (skipExisting) {
    systems = systems.filter((s: any) => !s.highlightsLastComputedAt);
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

  // ── load local OSM index if available ──
  let localOsmIndex: OsmLocalIndex | null = null;
  if (cityFilter) {
    localOsmIndex = loadOsmCategory(osmCityArg ?? cityFilter, "highlights");
    if (localOsmIndex) {
      console.log(`  Using local OSM cache for highlights (${localOsmIndex.elements.length} features)\n`);
    } else {
      console.log(`  No local OSM cache found for "${cityFilter}" — will use Overpass\n`);
    }
  }

  // ── per-system loop ──
  const COL = 100;
  console.log(`\n${"─".repeat(COL)}`);
  console.log(
    "STATUS".padEnd(14) +
    "SYSTEM".padEnd(46) +
    "CANDS".padStart(7) +
    "  KEPT".padStart(7) +
    "  TYPES".padStart(8),
  );
  console.log("─".repeat(COL));

  let processed = 0, skipped = 0;
  let totalHighlights = 0, systemsWithHighlights = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];
  const allResults: { name: string; count: number }[] = [];

  const _t0 = Date.now();
  let _idx = 0;
  const _hb = setInterval(() => {
    const m = Math.round((Date.now() - _t0) / 60000);
    console.log(`\n[${new Date().toTimeString().slice(0, 5)}] ${processed}/${systems.length} done (${m}m elapsed)\n`);
  }, 5 * 60 * 1000);

  for (const system of systems) {
    const displayName = (system.slug ?? system.name ?? system.id).slice(0, 45);
    _idx++;
    console.log(`[${new Date().toTimeString().slice(0, 5)}] [${_idx}/${systems.length}] ${displayName}`);

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

    const rawBbox = computeBbox(systemLines);
    if (!rawBbox) {
      console.log(`${"SKIP (no bbox)".padEnd(14)}${displayName}`);
      skipped++;
      continue;
    }

    // Expand bbox by nearMeters so candidates just outside the raw bbox are included
    const [minLon, minLat, maxLon, maxLat] = expandBbox(rawBbox, nearMeters);

    // ── fetch highlight candidates (local OSM cache preferred; Overpass fallback) ──
    let rawElements: any[] = [];
    if (localOsmIndex) {
      rawElements = osmFilterByBbox(localOsmIndex, [minLon, minLat, maxLon, maxLat]);
    } else {
      try {
        rawElements = await overpassPost(highlightsQuery(minLon, minLat, maxLon, maxLat));
      } catch (err: any) {
        console.warn(`  WARN (Overpass) for ${displayName}: ${err.message}`);
      }
      await sleep(700);
    }

    const candidates = parseElements(rawElements);

    // ── filter by distance to trail ──
    const filtered: Highlight[] = [];
    for (const c of candidates) {
      const dist = distanceToMultiLineM(c.location.coordinates, systemLines);
      if (dist <= nearMeters) {
        filtered.push({
          ...c,
          distanceToTrailMeters: parseFloat(dist.toFixed(1)),
        });
      }
    }

    // ── dedupe ──
    const deduped = deduplicateHighlights(filtered);

    // ── sort: distance asc, named items preferred ──
    deduped.sort((a, b) => {
      if (a.distanceToTrailMeters !== b.distanceToTrailMeters)
        return a.distanceToTrailMeters - b.distanceToTrailMeters;
      const aHasName = a.name !== null ? 0 : 1;
      const bHasName = b.name !== null ? 0 : 1;
      return aHasName - bHasName;
    });

    // ── cap ──
    const capped = deduped.slice(0, MAX_HIGHLIGHTS);

    // ── count by type ──
    const byType = countByType(capped);
    const typesSummary = ALL_KINDS
      .filter((k) => byType[k] > 0)
      .map((k) => `${k.slice(0, 4)}:${byType[k]}`)
      .join(" ");

    processed++;
    totalHighlights += capped.length;
    if (capped.length > 0) systemsWithHighlights++;
    allResults.push({ name: system.slug ?? system.name ?? system.id, count: capped.length });

    const status = isDryRun ? "WOULD UPDATE" : "UPDATE";
    console.log(
      `${status.padEnd(14)}${displayName.padEnd(46)}` +
      `${String(candidates.length).padStart(7)}` +
      `${String(capped.length).padStart(7)}` +
      `  ${typesSummary || "(none)"}`,
    );

    if (isVerbose && capped.length > 0) {
      for (const h of capped.slice(0, 5)) {
        const loc = h.location.coordinates.map((v) => v.toFixed(5)).join(",");
        console.log(
          `    [${h.kind}] ${h.name ?? "(unnamed)"} @[${loc}] ` +
          `${h.distanceToTrailMeters}m  ${h.osmId}`,
        );
      }
      if (capped.length > 5) console.log(`    ... and ${capped.length - 5} more`);
    }

    const highlightsPayload = {
      highlightsCount:          capped.length,
      highlightsByType:         byType,
      highlights:               capped,
      highlightsLastComputedAt: Date.now(),
    };
    updates.push({ systemId: system.id, payload: highlightsPayload });
    if (!isDryRun) {
      await db.transact([(db as any).tx.trailSystems[system.id].update(highlightsPayload)]);
      console.log(`[${new Date().toTimeString().slice(0, 5)}] ${processed}/${systems.length} done: ${displayName}`);
    }
  }

  clearInterval(_hb);
  console.log("─".repeat(COL));

  // ── summary ──
  const pct = (n: number) => processed > 0 ? ((n / processed) * 100).toFixed(1) + "%" : "n/a";

  console.log("\n=== HIGHLIGHTS ENRICHMENT SUMMARY ===");
  console.log(`Systems processed:        ${processed}`);
  console.log(`Systems skipped:          ${skipped}  (no geometry/bbox)`);
  console.log(`Total highlights stored:  ${totalHighlights}`);
  console.log(`Systems with >=1 highlight: ${systemsWithHighlights}  (${pct(systemsWithHighlights)})`);

  const top10 = [...allResults].sort((a, b) => b.count - a.count).slice(0, 10);
  if (top10.length > 0) {
    console.log("\nTop 10 systems by highlightsCount:");
    for (let i = 0; i < top10.length; i++) {
      const { name, count } = top10[i];
      console.log(`  ${String(i + 1).padStart(2)}. ${name.padEnd(52)} ${count}`);
    }
  }

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist changes to InstantDB.");
    return;
  }

  console.log(`\nDone. ${updates.length} system(s) enriched with highlights (written incrementally).`);
  console.log("======================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
