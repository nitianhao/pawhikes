#!/usr/bin/env npx tsx
/**
 * Store shade profile per-point data to trailSystems.shadeProfile.
 *
 * For each trailSystem:
 *   1. Reconstruct geometry from trailSegments
 *   2. Query Overpass for shade features (same as enrich-systems-shade)
 *   3. Sample points every N metres, classify shade weight per point
 *   4. Downsample to ≤150 points, normalize distance to lengthMilesTotal
 *   5. Persist { shadeProfile: [{d, shade}[]] } to trailSystems
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/dev/store-shade-profile.ts \
 *     --city "Austin" --state "TX" \
 *     [--slug "mueller-trail--mueller-trail-1fdcd490"] \
 *     [--sampleMeters 50] [--nearMeters 25] \
 *     [--limit 5] [--write] [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { loadOsmCategory, filterByBbox as osmFilterByBbox, type OsmLocalIndex } from "../lib/osmLocal.js";

// ── env ──────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const ROOT       = join(__dirname, "../..");

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
const slugFilter   = typeof args.slug         === "string" ? args.slug         : undefined;
const limitArg     = typeof args.limit        === "string" ? parseInt(args.limit, 10) : undefined;
const sampleMeters = typeof args.sampleMeters === "string" ? parseFloat(args.sampleMeters) : 50;
const nearMeters   = typeof args.nearMeters   === "string" ? parseFloat(args.nearMeters)   : 25;
const isDryRun     = !args.write;
const isVerbose    = !!args.verbose;

if (!cityFilter && !slugFilter) {
  console.error("Error: --city or --slug is required");
  process.exit(1);
}

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
console.log("city:         ", cityFilter ?? "(not set)");
console.log("state:        ", stateFilter ?? "(not set)");
console.log("slug:         ", slugFilter ?? "(all)");
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

const WEIGHT_STRONG = 1.0;
const WEIGHT_MEDIUM = 0.6;
const WEIGHT_WEAK   = 0.3;
const TREE_NEAR_M   = 10;
const MAX_TREE_NODES = 2000;
const MAX_PROFILE_POINTS = 150;
const METERS_PER_MILE = 1609.344;

// ── geometry helpers ──────────────────────────────────────────────────────────

function haversineM(a: Coord, b: Coord): number {
  const R  = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180, φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function ptToSegM(p: Coord, a: Coord, b: Coord): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineM(p, a);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  return haversineM(p, [a[0] + t * dx, a[1] + t * dy]);
}

function ptToPolylineM(p: Coord, ring: Ring): number {
  let best = Infinity;
  for (let i = 1; i < ring.length; i++) {
    const d = ptToSegM(p, ring[i - 1], ring[i]);
    if (d < best) best = d;
  }
  return best;
}

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

function osmNodesToRing(nodes: { lat: number; lon: number }[]): Ring {
  return nodes.map((n) => [n.lon, n.lat]);
}

function ringIsClosed(ring: Ring): boolean {
  if (ring.length < 4) return false;
  const f = ring[0], l = ring[ring.length - 1];
  return Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9;
}

function extractLines(geom: any): MultiLineCoords {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString")      return [geom.coordinates as Ring];
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

function sampleAlongMultiLine(
  lines: MultiLineCoords,
  stepM: number,
  minPoints = 10,
): Coord[] {
  const points: Coord[] = [];
  let remainder = 0;

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
      remainder = d - segLen;
    }
  }

  if (points.length === 0) {
    for (const line of lines)
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i];
        points.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      }
  }

  if (points.length < minPoints) {
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

interface ShadeFeatureIndex {
  strongPolys: Ring[];
  mediumPolys: Ring[];
  treeRowLines: Ring[];
  treePoints: Coord[];
}

function ptNearPolygon(p: Coord, ring: Ring, nearM: number): boolean {
  if (pointInPolygon(p, ring)) return true;
  return ptToPolylineM(p, ring) <= nearM;
}

function ptNearLine(p: Coord, ring: Ring, nearM: number): boolean {
  return ptToPolylineM(p, ring) <= nearM;
}

function ptNearTreeNode(p: Coord, trees: Coord[], nearM: number): boolean {
  for (const t of trees) {
    if (haversineM(p, t) <= nearM) return true;
  }
  return false;
}

function shadeWeightForPoint(
  p: Coord,
  idx: ShadeFeatureIndex,
  nearM: number,
): number {
  for (const ring of idx.strongPolys)
    if (ptNearPolygon(p, ring, nearM)) return WEIGHT_STRONG;
  for (const ring of idx.mediumPolys)
    if (ptNearPolygon(p, ring, nearM)) return WEIGHT_MEDIUM;
  for (const line of idx.treeRowLines)
    if (ptNearLine(p, line, nearM)) return WEIGHT_WEAK;
  if (idx.treePoints.length > 0 && ptNearTreeNode(p, idx.treePoints, TREE_NEAR_M))
    return WEIGHT_WEAK;
  return 0;
}

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
    const isScrub   = tags.natural === "scrub";
    const isPark    = tags.leisure === "park";
    const isTreeRow = tags.natural === "tree_row";
    const isTree    = tags.natural === "tree";

    if (el.type === "node") {
      if (isTree && el.lat != null) rawTreePoints.push([el.lon, el.lat]);
      continue;
    }

    if (el.type === "way") {
      const geomNodes: { lat: number; lon: number }[] = el.geometry ?? [];
      if (geomNodes.length < 2) continue;
      const ring = osmNodesToRing(geomNodes);
      if (isTreeRow) {
        treeRowLines.push(ring);
      } else if (isWood) {
        if (ringIsClosed(ring)) strongPolys.push(ring);
        else treeRowLines.push(ring);
      } else if (isScrub || isPark) {
        if (ringIsClosed(ring)) mediumPolys.push(ring);
      }
      continue;
    }

    if (el.type === "relation") {
      const rings = ringsFromRelation(el);
      for (const ring of rings) {
        if (isWood) strongPolys.push(ring);
        else if (isScrub || isPark) mediumPolys.push(ring);
      }
    }
  }

  let treePoints = rawTreePoints;
  if (rawTreePoints.length > MAX_TREE_NODES) {
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

// ── profile builder ───────────────────────────────────────────────────────────

export type ShadeProfilePoint = { d: number; shade: number };

function buildShadeProfile(
  weights: number[],
  lengthMilesTotal: number,
): ShadeProfilePoint[] {
  const n = weights.length;
  if (n < 2) return [];

  const totalMiles =
    Number.isFinite(lengthMilesTotal) && lengthMilesTotal > 0
      ? lengthMilesTotal
      : (n - 1) * sampleMeters / METERS_PER_MILE;

  const step = Math.max(1, Math.ceil(n / MAX_PROFILE_POINTS));
  const profile: ShadeProfilePoint[] = [];

  for (let i = 0; i < n; i += step) {
    const end = Math.min(i + step, n);
    const chunk = weights.slice(i, end);
    const avgShade = chunk.reduce((s, w) => s + w, 0) / chunk.length;
    const midRaw = i + Math.floor((end - i) / 2);
    const d = Math.round((midRaw / (n - 1)) * totalMiles * 1000) / 1000;
    profile.push({ d, shade: Math.round(avgShade * 100) / 100 });
  }

  // Ensure last point is at totalMiles
  if (profile.length > 0) {
    profile[profile.length - 1].d = Math.round(totalMiles * 1000) / 1000;
  }

  return profile;
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

  if (slugFilter) {
    systems = systems.filter((s: any) =>
      (s.slug ?? "") === slugFilter ||
      (s.slug ?? "").endsWith(slugFilter) ||
      slugFilter.endsWith(s.slug ?? ""),
    );
    console.log(`  After --slug="${slugFilter}": ${systems.length}`);
  } else {
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
  const osmCityKey = cityFilter ?? slugFilter ?? "";
  let localOsmIndex: OsmLocalIndex | null = null;
  if (osmCityKey) {
    localOsmIndex = loadOsmCategory(osmCityKey, "shade");
    if (localOsmIndex) {
      console.log(`  Using local OSM cache for shade (${localOsmIndex.elements.length} features)\n`);
    } else {
      console.log(`  No local OSM cache found for "${osmCityKey}" — will use Overpass\n`);
    }
  }

  // ── per-system loop ──
  console.log(`\n${"─".repeat(80)}`);
  let processed = 0, skipped = 0, sysIdx = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (const system of systems) {
    sysIdx++;
    const label = (system.slug ?? system.name ?? system.id).slice(0, 50);
    console.log(`[${sysIdx}/${systems.length}] ${label}`);
    const lengthMilesTotal = system.lengthMilesTotal as number ?? 0;

    // Reconstruct geometry
    const segs = segsByRef.get(system.extSystemRef) ?? [];
    const systemLines: MultiLineCoords = [];
    for (const seg of segs) {
      if (!seg.geometry) continue;
      try { systemLines.push(...extractLines(seg.geometry)); } catch { /* skip */ }
    }

    if (systemLines.length === 0) {
      console.log(`SKIP (no geom)  ${label}`);
      skipped++;
      continue;
    }

    if (lengthMilesTotal < 1) {
      console.log(`SKIP (<1mi)     ${label}`);
      skipped++;
      continue;
    }

    const bbox = bboxOfLines(systemLines, 0.002);
    if (!bbox) {
      console.log(`SKIP (no bbox)  ${label}`);
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
        skipped++;
        continue;
      }
      await sleep(1_500);
    }

    // Build shade feature index
    const idx = buildShadeIndex(elements, systemLines, nearMeters);

    // Sample points + classify per-point
    const samples = sampleAlongMultiLine(systemLines, sampleMeters, 10);
    const weights = samples.map((p) => shadeWeightForPoint(p, idx, nearMeters));

    // Build downsampled profile
    const profile = buildShadeProfile(weights, lengthMilesTotal);

    processed++;
    const shadeAvg = weights.length > 0
      ? (weights.reduce((s, w) => s + w, 0) / weights.length).toFixed(3)
      : "—";

    const status = isDryRun ? "WOULD WRITE" : "WRITE";
    console.log(`${status.padEnd(14)}${label.padEnd(50)}  samples=${samples.length}  profile=${profile.length}  avgShade=${shadeAvg}`);

    if (isVerbose && profile.length > 0) {
      console.log(`  first: d=${profile[0].d} shade=${profile[0].shade}`);
      console.log(`  last:  d=${profile[profile.length - 1].d} shade=${profile[profile.length - 1].shade}`);
    }

    updates.push({ systemId: system.id, payload: { shadeProfile: profile } });
  }

  console.log("─".repeat(80));
  console.log(`\n=== SHADE PROFILE SUMMARY ===`);
  console.log(`Processed:  ${processed}`);
  console.log(`Skipped:    ${skipped}`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist.");
    return;
  }

  if (updates.length === 0) { console.log("\nNothing to write."); return; }

  console.log(`\nWriting ${updates.length} system update(s)...`);
  const BATCH = 50;
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

  console.log(`\nDone. ${written} system(s) updated with shade profile.`);
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
