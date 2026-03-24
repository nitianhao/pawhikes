#!/usr/bin/env npx tsx
/**
 * Store water proximity profile per-trail data to trailSystems.waterProfile.
 *
 * For each trailSystem:
 *   1. Order trailSegments spatially using greedy nearest-neighbour
 *   2. Compute bbox from segment geometry + buffer
 *   3. Query Overpass for water features (rivers, streams, lakes, canals, springs)
 *   4. Sample every SAMPLE_M meters along the trail polyline
 *   5. For each sample, find nearest water feature within WATER_NEAR_M → classify type
 *   6. Build change-point array (only emit when type changes): [{d, type}]
 *   7. Normalize d to system.lengthMilesTotal
 *   8. Persist { waterProfile: [{d, type}] } to trailSystems
 *
 * Water types: "river" | "stream" | "lake" | "canal" | "spring" | "dry"
 *
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/dev/store-water-profile.ts \
 *     --city "Austin" \
 *     [--slug "mueller-trail--mueller-trail-1fdcd490"] \
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

const args       = parseArgs(process.argv.slice(2));
const cityFilter = typeof args.city          === "string" ? args.city          : undefined;
const slugFilter = typeof args.slug          === "string" ? args.slug          : undefined;
const osmCityArg = typeof args["osm-city"]   === "string" ? args["osm-city"]   : undefined;
const limitArg   = typeof args.limit         === "string" ? parseInt(args.limit, 10) : undefined;
const isDryRun   = !args.write;
const isVerbose  = !!args.verbose;

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
console.log("appId:  ", appId);
console.log("token:  ", maskToken(adminToken));
console.log("city:   ", cityFilter ?? "(not set)");
console.log("slug:   ", slugFilter ?? "(all)");
console.log("limit:  ", limitArg ?? "(all)");
console.log("mode:   ", isDryRun ? "DRY RUN (pass --write to persist)" : "WRITE");
console.log("verbose:", isVerbose);
console.log("==============\n");

// ── constants ─────────────────────────────────────────────────────────────────
const SAMPLE_M     = 50;  // sample every 50m along trail
const WATER_NEAR_M = 200; // threshold: within 200m = near water
const METERS_PER_MILE = 1609.344;
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SLEEP_MS     = 1200; // polite delay between Overpass calls

// Water type priority (when multiple types within threshold, use highest priority)
const TYPE_PRIORITY: Record<string, number> = {
  river: 0,
  lake: 1,
  stream: 2,
  canal: 3,
  spring: 4,
};

// ── types ─────────────────────────────────────────────────────────────────────
type Coord = [number, number]; // [lon, lat]

export type WaterProfilePoint = { d: number; type: string };

type WaterFeature = {
  waterType: string;       // river | stream | lake | canal | spring
  coords: Coord[];         // representative geometry coords
};

// ── geometry helpers ──────────────────────────────────────────────────────────
function haversineM(a: Coord, b: Coord): number {
  const R  = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180, φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function endpointsOfGeom(geom: any): { first: Coord; last: Coord; lengthM: number; coords: Coord[] } | null {
  if (!geom?.coordinates) return null;
  let coords: Coord[];
  if (geom.type === "LineString") {
    coords = geom.coordinates as Coord[];
  } else if (geom.type === "MultiLineString") {
    const lines = geom.coordinates as Coord[][];
    if (lines.length === 0) return null;
    coords = lines.flat();
  } else {
    return null;
  }
  if (coords.length < 2) return null;
  let totalM = 0;
  for (let i = 1; i < coords.length; i++) totalM += haversineM(coords[i - 1], coords[i]);
  return { first: coords[0], last: coords[coords.length - 1], lengthM: totalM, coords };
}

function orderSegments(
  segs: Array<{ endpoints: { first: Coord; last: Coord; lengthM: number; coords: Coord[] } }>
): Array<{ endpoints: { first: Coord; last: Coord; lengthM: number; coords: Coord[] }; reversed: boolean }> {
  if (segs.length <= 1) return segs.map(s => ({ ...s, reversed: false }));
  const remaining = segs.map(s => ({ ...s, reversed: false }));
  const ordered: typeof remaining = [];
  let bestStart = 0, bestLon = Infinity;
  for (let i = 0; i < remaining.length; i++) {
    const lon = remaining[i].endpoints.first[0];
    if (lon < bestLon) { bestLon = lon; bestStart = i; }
  }
  ordered.push(remaining.splice(bestStart, 1)[0]);
  while (remaining.length > 0) {
    const curEnd = ordered[ordered.length - 1].reversed
      ? ordered[ordered.length - 1].endpoints.first
      : ordered[ordered.length - 1].endpoints.last;
    let bestIdx = 0, bestDist = Infinity, bestReverse = false;
    for (let i = 0; i < remaining.length; i++) {
      const ep = remaining[i].endpoints;
      const dF = haversineM(curEnd, ep.first);
      const dR = haversineM(curEnd, ep.last);
      if (dF < bestDist) { bestDist = dF; bestIdx = i; bestReverse = false; }
      if (dR < bestDist) { bestDist = dR; bestIdx = i; bestReverse = true; }
    }
    ordered.push({ ...remaining.splice(bestIdx, 1)[0], reversed: bestReverse });
  }
  return ordered;
}

function buildPolyline(
  ordered: Array<{ endpoints: { coords: Coord[] }; reversed: boolean }>
): Coord[] {
  const full: Coord[] = [];
  for (const seg of ordered) {
    const coords = seg.reversed ? [...seg.endpoints.coords].reverse() : seg.endpoints.coords;
    if (full.length === 0) full.push(...coords);
    else full.push(...coords.slice(1));
  }
  return full;
}

/** Sample points evenly along a polyline every SAMPLE_M meters. */
function samplePolyline(polyline: Coord[], stepM: number): { coord: Coord; distM: number }[] {
  const samples: { coord: Coord; distM: number }[] = [];
  if (polyline.length === 0) return samples;

  samples.push({ coord: polyline[0], distM: 0 });
  let accumulated = 0;
  let nextTarget = stepM;

  for (let i = 1; i < polyline.length; i++) {
    const segLen = haversineM(polyline[i - 1], polyline[i]);
    let segPos = 0;

    while (nextTarget <= accumulated + segLen) {
      const t = (nextTarget - accumulated) / segLen;
      const lon = polyline[i - 1][0] + t * (polyline[i][0] - polyline[i - 1][0]);
      const lat = polyline[i - 1][1] + t * (polyline[i][1] - polyline[i - 1][1]);
      samples.push({ coord: [lon, lat], distM: nextTarget });
      segPos = nextTarget - accumulated;
      nextTarget += stepM;
    }

    accumulated += segLen;
  }

  // Always include last point
  const last = polyline[polyline.length - 1];
  if (haversineM(samples[samples.length - 1].coord, last) > 1) {
    samples.push({ coord: last, distM: accumulated });
  }

  return samples;
}

/** Min distance from a point to the nearest coordinate in a feature. */
function distToFeature(point: Coord, feature: WaterFeature): number {
  let minDist = Infinity;
  for (const c of feature.coords) {
    const d = haversineM(point, c);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

/** Find the closest water type for a given trail point, within threshold. */
function classifyPoint(point: Coord, features: WaterFeature[], thresholdM: number): string {
  let bestType = "dry";
  let bestPriority = Infinity;
  let bestDist = Infinity;

  for (const feature of features) {
    const dist = distToFeature(point, feature);
    if (dist <= thresholdM) {
      const priority = TYPE_PRIORITY[feature.waterType] ?? 99;
      if (dist < bestDist || priority < bestPriority) {
        bestDist = dist;
        bestType = feature.waterType;
        bestPriority = priority;
      }
    }
  }

  return bestType;
}

// ── bbox helpers ──────────────────────────────────────────────────────────────
function computeBbox(coords: Coord[], padDeg = 0.005): [number, number, number, number] | null {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  if (!isFinite(minLon)) return null;
  return [minLat - padDeg, minLon - padDeg, maxLat + padDeg, maxLon + padDeg];
}

// ── Overpass ──────────────────────────────────────────────────────────────────
function buildOverpassQuery(bbox: [number, number, number, number]): string {
  const [s, w, n, e] = bbox;
  const b = `${s},${w},${n},${e}`;
  return `[out:json][timeout:60];\n(\n  way["natural"~"^(water|bay|strait)$"](${b});\n  way["waterway"~"^(river|stream|canal|drain)$"](${b});\n  relation["natural"="water"](${b});\n  node["natural"~"^(water|spring)$"](${b});\n);\nout geom;`;
}

async function fetchOverpass(query: string, attempt = 0): Promise<any> {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(90_000),
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt < 3) {
      await sleep(Math.pow(2, attempt + 1) * 2000);
      return fetchOverpass(query, attempt + 1);
    }
    throw new Error(`Overpass HTTP ${res.status}`);
  }
  return res.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Parse Overpass response elements into WaterFeature array. */
function parseWaterFeatures(elements: any[]): WaterFeature[] {
  const features: WaterFeature[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const natural  = tags.natural ?? "";
    const waterway = tags.waterway ?? "";
    const water    = tags.water ?? "";

    // Determine water type
    let waterType: string | null = null;
    if (waterway === "river") waterType = "river";
    else if (waterway === "canal") waterType = "canal";
    else if (waterway === "stream" || waterway === "drain") waterType = "stream";
    else if (natural === "water") {
      // Sub-classify: river = linear body, else lake/pond
      waterType = (water === "river" || water === "stream") ? "river" : "lake";
    }
    else if (natural === "bay" || natural === "strait") waterType = "lake";
    else if (natural === "spring") waterType = "spring";

    if (!waterType) continue;

    // Extract coordinates
    const coords: Coord[] = [];

    if (el.type === "node" && typeof el.lat === "number" && typeof el.lon === "number") {
      coords.push([el.lon, el.lat]);
    } else if (el.type === "way" && Array.isArray(el.geometry)) {
      for (const pt of el.geometry) {
        if (typeof pt.lat === "number" && typeof pt.lon === "number") {
          coords.push([pt.lon, pt.lat]);
        }
      }
    } else if (el.type === "relation" && Array.isArray(el.members)) {
      for (const member of el.members) {
        if (Array.isArray(member.geometry)) {
          for (const pt of member.geometry) {
            if (typeof pt.lat === "number" && typeof pt.lon === "number") {
              coords.push([pt.lon, pt.lat]);
            }
          }
        }
      }
    }

    if (coords.length > 0) {
      // Thin out dense features — keep every Nth coordinate for performance
      // (200m threshold + 50m sampling → vertex density of ~50m is fine)
      const MAX_COORDS = 500;
      const thinned = coords.length > MAX_COORDS
        ? coords.filter((_, i) => i % Math.ceil(coords.length / MAX_COORDS) === 0)
        : coords;
      features.push({ waterType, coords: thinned });
    }
  }

  return features;
}

// ── profile builder ───────────────────────────────────────────────────────────
function buildWaterProfile(
  samples: { coord: Coord; distM: number }[],
  features: WaterFeature[],
  totalRawM: number,
  lengthMilesTotal: number,
): WaterProfilePoint[] {
  if (samples.length === 0) return [];

  const normFactor = totalRawM > 0 && lengthMilesTotal > 0
    ? (lengthMilesTotal * METERS_PER_MILE) / totalRawM
    : 1;

  // Classify each sample
  const classified = samples.map(s => ({
    distM: s.distM,
    type: classifyPoint(s.coord, features, WATER_NEAR_M),
  }));

  // Build change-point array
  const profile: WaterProfilePoint[] = [];
  let prevType = "";

  for (const s of classified) {
    if (s.type !== prevType) {
      const d = Math.round((s.distM * normFactor / METERS_PER_MILE) * 1000) / 1000;
      profile.push({ d, type: s.type });
      prevType = s.type;
    }
  }

  return profile;
}

// ── InstantDB helpers ─────────────────────────────────────────────────────────
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
  } else if (cityFilter) {
    const n = cityFilter.toLowerCase();
    systems = systems.filter((s: any) => (s.city ?? "").toLowerCase().includes(n));
    console.log(`  After city="${cityFilter}": ${systems.length}`);
  }
  if (limitArg && !Number.isNaN(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }
  if (systems.length === 0) { console.log("\nNothing to do."); return; }

  // ── fetch all segments ──
  console.log("\nFetching trailSegments...");
  const segRes = await db.query({ trailSegments: { $: { limit: 50000 } } });
  const allSegs = entityList(segRes, "trailSegments");
  console.log(`  Total segments: ${allSegs.length}`);

  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegs) {
    if (!seg.systemRef) continue;
    if (!segsByRef.has(seg.systemRef)) segsByRef.set(seg.systemRef, []);
    segsByRef.get(seg.systemRef)!.push(seg);
  }

  // ── load local OSM index if available ──
  const osmCityKey = osmCityArg ?? cityFilter ?? slugFilter ?? "";
  let localOsmIndex: OsmLocalIndex | null = null;
  if (osmCityKey) {
    localOsmIndex = loadOsmCategory(osmCityKey, "water");
    if (localOsmIndex) {
      console.log(`  Using local OSM cache for water (${localOsmIndex.elements.length} features)\n`);
    } else {
      console.log(`  No local OSM cache found for "${osmCityKey}" — will use Overpass\n`);
    }
  }

  // ── per-system loop ──
  console.log(`\n${"─".repeat(90)}`);
  let processed = 0, skipped = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (let si = 0; si < systems.length; si++) {
    const system = systems[si];
    const label = (system.slug ?? system.name ?? system.id).slice(0, 55);
    console.log(`[${si + 1}/${systems.length}] ${label}`);
    const lengthMilesTotal = (system.lengthMilesTotal as number) ?? 0;

    // ── parse segment geometry ──
    const rawSegs = segsByRef.get(system.extSystemRef) ?? [];
    const parsedSegs: Array<{ endpoints: { first: Coord; last: Coord; lengthM: number; coords: Coord[] } }> = [];
    for (const seg of rawSegs) {
      const ep = seg.geometry ? endpointsOfGeom(seg.geometry) : null;
      if (!ep) continue;
      parsedSegs.push({ endpoints: ep });
    }

    if (parsedSegs.length === 0) {
      console.log(`SKIP (no geom)  ${label}`);
      skipped++;
      continue;
    }

    if (lengthMilesTotal < 1) {
      console.log(`SKIP (<1mi)     ${label}`);
      skipped++;
      continue;
    }

    // ── build polyline + bbox ──
    const ordered = orderSegments(parsedSegs);
    const polyline = buildPolyline(ordered);
    const totalRawM = ordered.reduce((s, seg) => s + seg.endpoints.lengthM, 0);

    const allCoords: Coord[] = parsedSegs.flatMap(s => s.endpoints.coords);
    const bbox = computeBbox(allCoords);
    if (!bbox) {
      console.log(`SKIP (bad bbox) ${label}`);
      skipped++;
      continue;
    }

    // ── fetch water features (local OSM cache preferred; Overpass fallback) ──
    let elements: any[] = [];
    if (localOsmIndex) {
      // bbox here is [minLat, minLon, maxLat, maxLon] (Overpass order); osmFilterByBbox needs [minLon, minLat, maxLon, maxLat]
      const [s, w, n, e] = bbox;
      elements = osmFilterByBbox(localOsmIndex, [w, s, e, n]);
    } else {
      if (si > 0) await sleep(SLEEP_MS);
      try {
        const overpassRes = await fetchOverpass(buildOverpassQuery(bbox));
        elements = overpassRes?.elements ?? [];
      } catch (err) {
        console.log(`SKIP (overpass) ${label}  err=${String(err).slice(0, 60)}`);
        skipped++;
        continue;
      }
    }

    const features = parseWaterFeatures(elements);

    // ── sample + classify ──
    const samples = samplePolyline(polyline, SAMPLE_M);
    const profile = buildWaterProfile(samples, features, totalRawM, lengthMilesTotal);

    if (profile.length === 0) {
      console.log(`SKIP (no prof)  ${label}`);
      skipped++;
      continue;
    }

    const waterTypes = [...new Set(profile.map(p => p.type).filter(t => t !== "dry"))];
    const pctNear = Math.round(
      (samples.filter(s => classifyPoint(s.coord, features, WATER_NEAR_M) !== "dry").length / samples.length) * 100
    );

    processed++;
    const status = isDryRun ? "WOULD WRITE" : "WRITE";
    console.log(
      `${status.padEnd(14)}${label.padEnd(56)}segs=${String(ordered.length).padStart(3)}  pts=${String(profile.length).padStart(3)}  near=${pctNear}%  types: ${waterTypes.join(", ") || "dry only"}`
    );

    if (isVerbose) {
      profile.slice(0, 5).forEach(p => console.log(`    d=${p.d.toFixed(3)}  type=${p.type}`));
      if (profile.length > 5) console.log(`    ... (${profile.length - 5} more)`);
    }

    updates.push({ systemId: system.id, payload: { waterProfile: profile } });
  }

  console.log("─".repeat(90));
  console.log(`\n=== WATER PROFILE SUMMARY ===`);
  console.log(`Processed:  ${processed}`);
  console.log(`Skipped:    ${skipped}`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed. Pass --write to persist.");
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

  console.log(`\nDone. ${written} system(s) updated with water profile.`);
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
