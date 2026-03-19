#!/usr/bin/env npx tsx
/**
 * Store surface profile per-segment data to trailSystems.surfaceProfile.
 *
 * For each trailSystem:
 *   1. Fetch trailSegments with matching systemRef
 *   2. Order segments spatially using greedy nearest-neighbour on geometry endpoints
 *   3. Build {d, surface}[] change-point array: each entry = where a new surface starts
 *   4. Normalize cumulative distance to system.lengthMilesTotal
 *   5. Persist { surfaceProfile: [{d, surface}[]] } to trailSystems
 *
 * NO external API calls — all data already lives in the DB.
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/dev/store-surface-profile.ts \
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

export type SurfaceProfilePoint = { d: number; surface: string };

// ── surface key normalisation (mirrors SurfaceSection.tsx) ────────────────────
function normalizeSurfaceKey(raw: string): string {
  if (!raw || !raw.trim()) return "unknown";
  const cleaned = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "unknown";
  if (cleaned === "hard other" || cleaned === "hardother") return "hard other";
  if (cleaned === "boards wood" || cleaned === "wood boards" || cleaned === "boardwalk wood") return "boards wood";
  if (cleaned === "fine gravel" || cleaned === "finegravel") return "fine gravel";
  if (cleaned === "crushed stone" || cleaned === "crushedstone") return "crushed stone";
  return cleaned;
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

const METERS_PER_MILE = 1609.344;

/** Extract first and last coordinate from a GeoJSON geometry. */
function endpointsOfGeom(geom: any): { first: Coord; last: Coord; lengthM: number } | null {
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

  // Approximate total length in metres
  let totalM = 0;
  for (let i = 1; i < coords.length; i++) {
    totalM += haversineM(coords[i - 1], coords[i]);
  }

  return { first: coords[0], last: coords[coords.length - 1], lengthM: totalM };
}

/** Greedy nearest-neighbour segment ordering.
 *  Returns the segments in an order that minimises the total gap between
 *  the end of one segment and the start of the next.
 *  Each segment can be traversed forward or reversed.
 */
function orderSegments(segs: Array<{ surface: string; lengthMiles: number; endpoints: { first: Coord; last: Coord; lengthM: number } }>): typeof segs {
  if (segs.length <= 1) return segs;

  const remaining = segs.map((s, i) => ({ ...s, idx: i, reversed: false }));
  const ordered: typeof remaining = [];

  // Start with the westernmost segment start (most negative lon)
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

/** Build surface profile from spatially-ordered segments.
 *  Returns change-point array: each entry marks where a new surface begins.
 *  Cumulative distance is normalized to lengthMilesTotal.
 */
function buildSurfaceProfile(
  orderedSegs: Array<{ surface: string; lengthMiles: number; endpoints: { lengthM: number } }>,
  lengthMilesTotal: number,
): SurfaceProfilePoint[] {
  if (orderedSegs.length === 0) return [];

  // Total raw length from segment geometries (in metres)
  const rawTotalM = orderedSegs.reduce((s, seg) => s + seg.endpoints.lengthM, 0);
  const normFactor = rawTotalM > 0 && lengthMilesTotal > 0
    ? (lengthMilesTotal * METERS_PER_MILE) / rawTotalM
    : 1;

  const profile: SurfaceProfilePoint[] = [];
  let cumulativeMiles = 0;
  let prevSurface = "";

  for (const seg of orderedSegs) {
    const surface = normalizeSurfaceKey(seg.surface);

    // Only emit a change-point when the surface actually changes
    if (surface !== prevSurface) {
      profile.push({
        d: Math.round(cumulativeMiles * 1000) / 1000,
        surface,
      });
      prevSurface = surface;
    }

    const segMiles = (seg.endpoints.lengthM * normFactor) / METERS_PER_MILE;
    cumulativeMiles += segMiles;
  }

  // Clamp last distance to reported trail length
  if (profile.length > 0) {
    // The last point's distance is already correct (where it starts)
    // No adjustment needed — consumer uses totalMiles to know where the last surface ends
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

    const rawSegs = segsByRef.get(system.extSystemRef) ?? [];
    if (rawSegs.length === 0) {
      console.log(`SKIP (no segs)  ${label}`);
      skipped++;
      continue;
    }

    // Parse endpoints from geometry for ordering
    const parsedSegs: Array<{ surface: string; lengthMiles: number; endpoints: { first: Coord; last: Coord; lengthM: number } }> = [];
    for (const seg of rawSegs) {
      const ep = seg.geometry ? endpointsOfGeom(seg.geometry) : null;
      if (!ep) continue;
      const surface = typeof seg.surface === "string" && seg.surface.trim()
        ? seg.surface.trim()
        : "unknown";
      const lengthMiles = typeof seg.lengthMiles === "number" && seg.lengthMiles > 0
        ? seg.lengthMiles
        : ep.lengthM / METERS_PER_MILE;
      parsedSegs.push({ surface, lengthMiles, endpoints: ep });
    }

    if (parsedSegs.length === 0) {
      console.log(`SKIP (no geom)  ${label}`);
      skipped++;
      continue;
    }

    // Order spatially
    const ordered = orderSegments(parsedSegs);

    // Build profile
    const profile = buildSurfaceProfile(ordered, lengthMilesTotal);

    if (profile.length === 0) {
      console.log(`SKIP (empty)    ${label}`);
      skipped++;
      continue;
    }

    processed++;
    const surfaces = [...new Set(ordered.map(s => normalizeSurfaceKey(s.surface)))].join(", ");
    const status = isDryRun ? "WOULD WRITE" : "WRITE";
    console.log(
      `${status.padEnd(14)}${label.padEnd(56)}segs=${String(ordered.length).padStart(3)}  pts=${String(profile.length).padStart(3)}  surfaces: ${surfaces}`
    );

    if (isVerbose) {
      profile.slice(0, 5).forEach(p => console.log(`    d=${p.d.toFixed(3)}  surface=${p.surface}`));
      if (profile.length > 5) console.log(`    ... (${profile.length - 5} more)`);
    }

    updates.push({ systemId: system.id, payload: { surfaceProfile: profile } });
  }

  console.log("─".repeat(90));
  console.log(`\n=== SURFACE PROFILE SUMMARY ===`);
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

  console.log(`\nDone. ${written} system(s) updated with surface profile.`);
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
