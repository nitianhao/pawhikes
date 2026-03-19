#!/usr/bin/env npx tsx
/**
 * Store highlight profile per-trail data to trailSystems.highlightPoints.
 *
 * For each trailSystem:
 *   1. Read highlights (already in DB from enrich-systems-highlights.ts)
 *   2. Order trailSegments spatially using greedy nearest-neighbour on geometry endpoints
 *   3. Build concatenated trail polyline from ordered segments
 *   4. Project each highlight's [lon, lat] onto the polyline → cumulative distance in meters
 *   5. Normalize to system.lengthMilesTotal → d in miles
 *   6. Deduplicate same-kind highlights within 0.01 miles (~16m) of each other
 *   7. Persist { highlightPoints: [{d, kind, name}] } to trailSystems (sorted by d)
 *
 * NO external API calls — all data already lives in the DB.
 * DRY RUN by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/dev/store-highlights-profile.ts \
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

export type HighlightPoint = { d: number; kind: string; name: string | null; distM: number };

// ── tag-based kind refinement ─────────────────────────────────────────────────
// Some OSM features have multiple tags where the raw `kind` (assigned by
// classifyKind() in enrich-systems-highlights.ts) is less specific than the
// tags indicate. For example: waterway=waterfall + natural=cliff gets
// kind="waterfall" because waterfall is checked first, but the feature is
// primarily a cliff. We derive a more specific displayKind from tags.
const NATURAL_KIND_OVERRIDE: Record<string, string> = {
  cliff:      "cliff",
  rock:       "rock",
  arch:       "arch",
  gorge:      "gorge",
  beach:      "beach",
  hot_spring: "hot_spring",
};

function deriveDisplayKind(kind: string, tags: unknown): string {
  if (tags == null || typeof tags !== "object") return kind;
  const t = tags as Record<string, string>;
  if (t.natural && NATURAL_KIND_OVERRIDE[t.natural]) return NATURAL_KIND_OVERRIDE[t.natural];
  return kind;
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

/** Project a point onto a polyline.
 *  Returns alongM = cumulative distance in meters from trail start to the
 *  nearest point on the polyline, and distM = perpendicular distance in meters
 *  from the feature to that nearest point (i.e. how far off-trail it is). */
function projectOnPolyline(point: Coord, polyline: Coord[]): { alongM: number; distM: number } {
  let bestDist = Infinity;
  let bestAlongM = 0;
  let cumulativeM = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const a = polyline[i];
    const b = polyline[i + 1];
    const segLenM = haversineM(a, b);
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

  return { alongM: bestAlongM, distM: bestDist === Infinity ? 0 : bestDist };
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

  // ── per-system loop ──
  console.log(`\n${"─".repeat(90)}`);
  let processed = 0, skipped = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (const system of systems) {
    const label = (system.slug ?? system.name ?? system.id).slice(0, 55);
    const lengthMilesTotal = (system.lengthMilesTotal as number) ?? 0;

    // ── get highlights from DB ──
    const rawHighlights = Array.isArray(system.highlights) ? system.highlights : [];
    const validHighlights = rawHighlights.filter(
      (h: any) =>
        h != null &&
        typeof h === "object" &&
        typeof h.kind === "string" &&
        Array.isArray(h.location?.coordinates) &&
        h.location.coordinates.length >= 2,
    );

    if (validHighlights.length === 0) {
      console.log(`SKIP (no highlights) ${label}`);
      skipped++;
      continue;
    }

    // ── get segment geometry ──
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

    // ── project each highlight onto polyline ──
    const rawPoints: HighlightPoint[] = [];
    for (const h of validHighlights) {
      const [lon, lat] = h.location.coordinates as [number, number];
      const { alongM, distM } = projectOnPolyline([lon, lat], polyline);
      const d = Math.round((alongM * normFactor / METERS_PER_MILE) * 1000) / 1000;
      // deriveDisplayKind inspects tags to get a more specific kind than the
      // raw enrich-assigned kind (e.g. waterfall+cliff tags → "cliff" not "waterfall")
      const displayKind = deriveDisplayKind(h.kind as string, h.tags);
      rawPoints.push({
        d,
        kind: displayKind,
        name: typeof h.name === "string" && h.name.trim() ? h.name.trim() : null,
        distM: Math.round(distM), // meters from feature to nearest trail point
      });
    }

    // Sort by d ascending
    rawPoints.sort((a, b) => a.d - b.d);

    // Deduplicate same-kind highlights within 0.01 miles (~16m)
    const DEDUP_MILES = 0.01;
    const profile: HighlightPoint[] = [];
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
      `${status.padEnd(14)}${label.padEnd(56)}raw=${String(validHighlights.length).padStart(3)}  pts=${String(profile.length).padStart(3)}  kinds: ${kinds}`
    );

    if (isVerbose) {
      profile.slice(0, 5).forEach(p =>
        console.log(`    d=${p.d.toFixed(3)}  kind=${p.kind}  name=${p.name ?? "(none)"}`)
      );
      if (profile.length > 5) console.log(`    ... (${profile.length - 5} more)`);
    }

    updates.push({ systemId: system.id, payload: { highlightPoints: profile } });
  }

  console.log("─".repeat(90));
  console.log(`\n=== HIGHLIGHT PROFILE SUMMARY ===`);
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

  console.log(`\nDone. ${written} system(s) updated with highlight profile.`);
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
