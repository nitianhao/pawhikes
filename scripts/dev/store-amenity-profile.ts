#!/usr/bin/env npx tsx
/**
 * Store amenity profile per-trail data to trailSystems.amenityPoints.
 *
 * For each trailSystem:
 *   1. Read trailheadPOIs (already in DB) — extract amenity POIs with lat/lon
 *   2. Order trailSegments spatially using greedy nearest-neighbour on geometry endpoints
 *   3. Build concatenated trail polyline from ordered segments
 *   4. Project each POI's [lon, lat] onto the polyline → cumulative distance in meters
 *   5. Normalize to system.lengthMilesTotal → d in miles
 *   6. Deduplicate very close same-kind POIs (within 15m along trail)
 *   7. Persist { amenityPoints: [{d, kind}] } to trailSystems (sorted by d)
 *
 * NO external API calls — all data already lives in the DB.
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/dev/store-amenity-profile.ts \
 *     --city "Austin" \
 *     [--slug "mueller-trail--mueller-trail-1fdcd490"] \
 *     [--limit 5] [--write] [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

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
const cityFilter = typeof args.city  === "string" ? args.city  : undefined;
const slugFilter = typeof args.slug  === "string" ? args.slug  : undefined;
const limitArg   = typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
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

// ── types ─────────────────────────────────────────────────────────────────────
type Coord = [number, number]; // [lon, lat]

export type AmenityPoint = { d: number; kind: string };

// Amenity kinds we care about (excludes parking, parking_entrance)
const AMENITY_KINDS = new Set([
  "bench",
  "shelter",
  "toilets",
  "drinking_water",
  "picnic_table",
  "waste_basket",
  "information",
  "dog_waste",
]);

// ── geometry helpers ──────────────────────────────────────────────────────────
function haversineM(a: Coord, b: Coord): number {
  const R  = 6_371_000;
  const φ1 = (a[1] * Math.PI) / 180, φ2 = (b[1] * Math.PI) / 180;
  const Δφ = ((b[1] - a[1]) * Math.PI) / 180;
  const Δλ = ((b[0] - a[0]) * Math.PI) / 180;
  const s  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

const METERS_PER_MILE = 1609.344;

/** Extract first and last coordinate from a GeoJSON geometry. */
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
  for (let i = 1; i < coords.length; i++) {
    totalM += haversineM(coords[i - 1], coords[i]);
  }

  return { first: coords[0], last: coords[coords.length - 1], lengthM: totalM, coords };
}

/** Greedy nearest-neighbour segment ordering. */
function orderSegments(
  segs: Array<{ endpoints: { first: Coord; last: Coord; lengthM: number; coords: Coord[] } }>
): Array<{ endpoints: { first: Coord; last: Coord; lengthM: number; coords: Coord[] }; reversed: boolean }> {
  if (segs.length <= 1) return segs.map(s => ({ ...s, reversed: false }));

  const remaining = segs.map((s, i) => ({ ...s, idx: i, reversed: false }));
  const ordered: typeof remaining = [];

  // Start with westernmost segment
  let bestStart = 0;
  let bestLon = Infinity;
  for (let i = 0; i < remaining.length; i++) {
    const lon = remaining[i].endpoints.first[0];
    if (lon < bestLon) { bestLon = lon; bestStart = i; }
  }

  ordered.push(remaining.splice(bestStart, 1)[0]);

  while (remaining.length > 0) {
    const curEnd = ordered[ordered.length - 1].reversed
      ? ordered[ordered.length - 1].endpoints.first
      : ordered[ordered.length - 1].endpoints.last;

    let bestIdx = 0;
    let bestDist = Infinity;
    let bestReverse = false;

    for (let i = 0; i < remaining.length; i++) {
      const ep = remaining[i].endpoints;
      const dForward = haversineM(curEnd, ep.first);
      const dReverse = haversineM(curEnd, ep.last);
      if (dForward < bestDist) { bestDist = dForward; bestIdx = i; bestReverse = false; }
      if (dReverse < bestDist) { bestDist = dReverse; bestIdx = i; bestReverse = true; }
    }

    const next = { ...remaining.splice(bestIdx, 1)[0], reversed: bestReverse };
    ordered.push(next);
  }

  return ordered;
}

/** Build full concatenated polyline from ordered segments. */
function buildPolyline(
  ordered: Array<{ endpoints: { coords: Coord[] }; reversed: boolean }>
): Coord[] {
  const full: Coord[] = [];
  for (const seg of ordered) {
    const coords = seg.reversed ? [...seg.endpoints.coords].reverse() : seg.endpoints.coords;
    if (full.length === 0) {
      full.push(...coords);
    } else {
      // Skip first point to avoid duplicate at junction
      full.push(...coords.slice(1));
    }
  }
  return full;
}

/**
 * Project a point onto a polyline, returning the cumulative distance in meters
 * from the start of the polyline to the closest point on it.
 */
function projectOnPolyline(point: Coord, polyline: Coord[]): number {
  let bestDist = Infinity;
  let bestAlongM = 0;
  let cumulativeM = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLenM = haversineM(a, b);

    // t = parameter [0,1] of closest point on segment [a,b] to point
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lenSq));

    const nearest: Coord = [a[0] + t * dx, a[1] + t * dy];
    const dist = haversineM(point, nearest);

    if (dist < bestDist) {
      bestDist = dist;
      bestAlongM = cumulativeM + t * segLenM;
    }

    cumulativeM += segLenM;
  }

  return bestAlongM;
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
  } else {
    if (cityFilter) {
      const n = cityFilter.toLowerCase();
      systems = systems.filter((s: any) => (s.city ?? "").toLowerCase().includes(n));
      console.log(`  After city="${cityFilter}": ${systems.length}`);
    }
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

  // Group segments by systemRef
  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegs) {
    if (!seg.systemRef) continue;
    if (!segsByRef.has(seg.systemRef)) segsByRef.set(seg.systemRef, []);
    segsByRef.get(seg.systemRef)!.push(seg);
  }

  // ── per-system loop ──
  console.log(`\n${"─".repeat(90)}`);
  let processed = 0, skipped = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (const system of systems) {
    const label = (system.slug ?? system.name ?? system.id).slice(0, 55);
    const lengthMilesTotal = (system.lengthMilesTotal as number) ?? 0;

    // ── get amenity POIs from trailheadPOIs ──
    const rawPOIs = Array.isArray(system.trailheadPOIs) ? system.trailheadPOIs : [];
    const amenityPOIs = rawPOIs.filter(
      (p: any) =>
        p != null &&
        typeof p === "object" &&
        typeof p.kind === "string" &&
        AMENITY_KINDS.has(p.kind) &&
        Array.isArray(p.location?.coordinates) &&
        p.location.coordinates.length >= 2,
    );

    if (amenityPOIs.length === 0) {
      console.log(`SKIP (no pois)  ${label}`);
      skipped++;
      continue;
    }

    // ── get segment geometry ──
    const rawSegs = segsByRef.get(system.extSystemRef) ?? [];
    if (rawSegs.length === 0) {
      console.log(`SKIP (no segs)  ${label}`);
      skipped++;
      continue;
    }

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

    // ── build polyline ──
    const ordered = orderSegments(parsedSegs);
    const polyline = buildPolyline(ordered);
    const totalRawM = ordered.reduce((s, seg) => s + seg.endpoints.lengthM, 0);

    if (polyline.length < 2 || totalRawM === 0) {
      console.log(`SKIP (bad geom) ${label}`);
      skipped++;
      continue;
    }

    const normFactor = lengthMilesTotal > 0
      ? (lengthMilesTotal * METERS_PER_MILE) / totalRawM
      : 1;

    // ── project each POI onto polyline ──
    const rawPoints: AmenityPoint[] = [];
    for (const poi of amenityPOIs) {
      const [lon, lat] = poi.location.coordinates as [number, number];
      const alongM = projectOnPolyline([lon, lat], polyline);
      const d = Math.round((alongM * normFactor / METERS_PER_MILE) * 1000) / 1000;
      rawPoints.push({ d, kind: poi.kind as string });
    }

    // Sort by d ascending
    rawPoints.sort((a, b) => a.d - b.d);

    // Deduplicate same-kind amenities within 15m (0.01 miles) of each other
    const DEDUP_MILES = 0.01;
    const profile: AmenityPoint[] = [];
    for (const pt of rawPoints) {
      const last = profile.filter(p => p.kind === pt.kind).pop();
      if (!last || pt.d - last.d > DEDUP_MILES) {
        profile.push(pt);
      }
    }

    if (profile.length === 0) {
      console.log(`SKIP (empty)    ${label}`);
      skipped++;
      continue;
    }

    processed++;
    const kinds = [...new Set(profile.map(p => p.kind))].join(", ");
    const status = isDryRun ? "WOULD WRITE" : "WRITE";
    console.log(
      `${status.padEnd(14)}${label.padEnd(56)}pois=${String(amenityPOIs.length).padStart(3)}  pts=${String(profile.length).padStart(3)}  kinds: ${kinds}`
    );

    if (isVerbose) {
      profile.slice(0, 5).forEach(p => console.log(`    d=${p.d.toFixed(3)}  kind=${p.kind}`));
      if (profile.length > 5) console.log(`    ... (${profile.length - 5} more)`);
    }

    updates.push({ systemId: system.id, payload: { amenityPoints: profile } });
  }

  console.log("─".repeat(90));
  console.log(`\n=== AMENITY PROFILE SUMMARY ===`);
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

  console.log(`\nDone. ${written} system(s) updated with amenity profile.`);
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
