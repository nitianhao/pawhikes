#!/usr/bin/env npx tsx
/**
 * Rollup system-level aggregates computed from segments.
 *
 * DRY RUN by default. Pass --write to persist to InstantDB.
 *
 * Usage:
 *   npx tsx scripts/rollup-systems-from-segments.ts \
 *     --city "Austin" \
 *     --dataset "austin_socrata_jdwm-wfps" \
 *     [--state "TX"] \
 *     [--limit 3] \
 *     [--write] \
 *     [--verbose]
 *
 * Computed fields written to trailSystems:
 *   bbox, centroid, lengthMilesTotal, segmentCount,
 *   surfaceSummary, widthSummary, computedAt
 *
 * Join key: segment.systemRef <-> system.extSystemRef
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

// ---- env loading (mirrors _loadEnvLocal.mjs behaviour: overrides process.env) ----
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
    process.env[key] = val; // override unconditionally
  }
}

loadEnvLocal(ROOT);

// ---- argv parsing ----
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
const datasetFilter = typeof args.dataset === "string" ? args.dataset : undefined;
const limitArg =
  typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
const isDryRun = !args.write; // dry-run is default; --write enables writes
const isVerbose = !!args.verbose;

if (!cityFilter) {
  console.error("Error: --city is required");
  process.exit(1);
}

// ---- InstantDB init ----
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
console.log("dataset:  ", datasetFilter ?? "(all)");
console.log("limit:    ", limitArg ?? "(all)");
console.log("mode:     ", isDryRun ? "DRY RUN (pass --write to persist)" : "WRITE");
console.log("verbose:  ", isVerbose);
console.log("==============\n");

// ---- types ----
type Bbox = [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
type Centroid = [number, number]; // [lon, lat]

interface SurfaceSummary {
  primary: string | null;
  distribution: Record<string, number>; // surface -> fraction (0–1)
  unknownPct: number;
}

interface WidthSummary {
  min: number;
  p50: number;
  p90: number;
  max: number;
  unknownPct: number;
}

interface SystemRollup {
  bbox: Bbox | null;
  centroid: Centroid | null;
  lengthMilesTotal: number | null;
  segmentCount: number;
  surfaceSummary: SurfaceSummary | null;
  widthSummary: WidthSummary | null;
  computedAt: string;
}

// ---- geometry helpers ----
function extractBboxFromGeom(geom: any): Bbox | null {
  if (!geom?.coordinates) return null;
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;

  const visit = (coords: any): void => {
    if (!Array.isArray(coords)) return;
    // leaf coordinate pair: [lon, lat, ...]
    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      minLon = Math.min(minLon, coords[0]);
      minLat = Math.min(minLat, coords[1]);
      maxLon = Math.max(maxLon, coords[0]);
      maxLat = Math.max(maxLat, coords[1]);
    } else {
      for (const c of coords) visit(c);
    }
  };

  try {
    visit(geom.coordinates);
  } catch {
    return null;
  }

  return minLon === Infinity ? null : [minLon, minLat, maxLon, maxLat];
}

function mergeBboxes(bboxes: Bbox[]): Bbox | null {
  if (!bboxes.length) return null;
  let [minLon, minLat, maxLon, maxLat] = bboxes[0];
  for (const [a, b, c, d] of bboxes.slice(1)) {
    minLon = Math.min(minLon, a);
    minLat = Math.min(minLat, b);
    maxLon = Math.max(maxLon, c);
    maxLat = Math.max(maxLat, d);
  }
  return [minLon, minLat, maxLon, maxLat];
}

// ---- percentile (unweighted, linear interpolation) ----
function pctile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

// ---- rollup computation ----
function computeRollup(segments: any[]): SystemRollup {
  const segmentCount = segments.length;

  // lengthMilesTotal: sum of valid lengthMiles values
  let lengthMilesTotal: number | null = null;
  for (const seg of segments) {
    const v = seg.lengthMiles;
    const n = typeof v === "number" ? v : parseFloat(v);
    if (!Number.isNaN(n) && n >= 0) {
      lengthMilesTotal = (lengthMilesTotal ?? 0) + n;
    }
  }

  // bbox: union of all segment geometry bboxes
  const bboxes: Bbox[] = [];
  for (const seg of segments) {
    if (!seg.geometry) continue;
    try {
      const b = extractBboxFromGeom(seg.geometry);
      if (b) bboxes.push(b);
    } catch {
      // skip malformed geometry
    }
  }
  const bbox = mergeBboxes(bboxes);
  const centroid: Centroid | null = bbox
    ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
    : null;

  // surfaceSummary: length-weighted distribution
  let surfaceSummary: SurfaceSummary | null = null;
  {
    const surfaceWeight: Record<string, number> = {};
    let unknownWeight = 0;
    let totalWeight = 0;

    for (const seg of segments) {
      // weight = lengthMiles if valid and > 0, else fallback to 1
      const lm = seg.lengthMiles;
      const weight =
        typeof lm === "number" && lm > 0
          ? lm
          : typeof lm === "string" && parseFloat(lm) > 0
          ? parseFloat(lm)
          : 1;

      totalWeight += weight;
      const surface: string | null = seg.surface ?? null;
      if (!surface) {
        unknownWeight += weight;
      } else {
        surfaceWeight[surface] = (surfaceWeight[surface] ?? 0) + weight;
      }
    }

    if (totalWeight > 0) {
      const distribution: Record<string, number> = {};
      for (const [surf, w] of Object.entries(surfaceWeight)) {
        distribution[surf] = parseFloat((w / totalWeight).toFixed(4));
      }
      if (unknownWeight > 0) {
        distribution["unknown"] = parseFloat(
          (unknownWeight / totalWeight).toFixed(4)
        );
      }
      const primary =
        Object.entries(surfaceWeight).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        null;
      surfaceSummary = {
        primary,
        distribution,
        unknownPct: parseFloat((unknownWeight / totalWeight).toFixed(4)),
      };
    }
  }

  // widthSummary: unweighted percentiles
  let widthSummary: WidthSummary | null = null;
  {
    const widths: number[] = [];
    let missingCount = 0;
    for (const seg of segments) {
      const v = seg.width;
      if (v == null) {
        missingCount++;
        continue;
      }
      const n = typeof v === "number" ? v : parseFloat(String(v));
      if (Number.isNaN(n)) {
        missingCount++;
      } else {
        widths.push(n);
      }
    }

    const unknownPct =
      segmentCount > 0
        ? parseFloat((missingCount / segmentCount).toFixed(4))
        : 0;

    if (widths.length > 0) {
      widths.sort((a, b) => a - b);
      widthSummary = {
        min: widths[0],
        p50: parseFloat(pctile(widths, 50).toFixed(2)),
        p90: parseFloat(pctile(widths, 90).toFixed(2)),
        max: widths[widths.length - 1],
        unknownPct,
      };
    } else {
      widthSummary = { min: 0, p50: 0, p90: 0, max: 0, unknownPct: 1 };
    }
  }

  return {
    bbox,
    centroid,
    lengthMilesTotal,
    segmentCount,
    surfaceSummary,
    widthSummary,
    computedAt: new Date().toISOString(),
  };
}

// ---- detect meaningful change (ignore computedAt) ----
function rollupChanged(existing: any, computed: SystemRollup): boolean {
  const fields: (keyof Omit<SystemRollup, "computedAt">)[] = [
    "bbox",
    "centroid",
    "lengthMilesTotal",
    "segmentCount",
    "surfaceSummary",
    "widthSummary",
  ];
  for (const field of fields) {
    if (
      JSON.stringify(existing[field] ?? null) !==
      JSON.stringify(computed[field] ?? null)
    ) {
      return true;
    }
  }
  return false;
}

// ---- InstantDB entity list helper ----
function entityList(res: any, name: string): any[] {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

// ---- main ----
async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });
  console.log("Admin SDK initialized OK\n");

  // --- fetch all systems (client-side filter for city/state/dataset) ---
  console.log("Fetching trailSystems...");
  const sysRes = await db.query({
    trailSystems: { $: { limit: 5000 } },
  });
  let systems = entityList(sysRes, "trailSystems");
  console.log(`  Total systems in DB: ${systems.length}`);

  if (datasetFilter) {
    systems = systems.filter((s: any) => s.extDataset === datasetFilter);
    console.log(`  After extDataset="${datasetFilter}": ${systems.length}`);
  }

  if (cityFilter) {
    const needle = cityFilter.toLowerCase();
    systems = systems.filter((s: any) => {
      const c = (s.city ?? "").toLowerCase();
      return c.includes(needle);
    });
    console.log(`  After city="${cityFilter}": ${systems.length}`);
  }

  // state filter is lenient: only applies if the system has a state value set
  if (stateFilter) {
    const needle = stateFilter.toLowerCase();
    systems = systems.filter((s: any) => {
      if (!s.state) return true; // state not populated on this system → keep
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

  // --- fetch all segments ---
  console.log("\nFetching trailSegments...");
  const segRes = await db.query({
    trailSegments: { $: { limit: 5000 } },
  });
  let allSegments = entityList(segRes, "trailSegments");
  console.log(`  Total segments in DB: ${allSegments.length}`);

  if (datasetFilter) {
    allSegments = allSegments.filter(
      (s: any) => s.extDataset === datasetFilter
    );
    console.log(`  After extDataset="${datasetFilter}": ${allSegments.length}`);
  }

  // Group segments by systemRef
  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegments) {
    const ref = seg.systemRef;
    if (!ref) continue;
    if (!segsByRef.has(ref)) segsByRef.set(ref, []);
    segsByRef.get(ref)!.push(seg);
  }

  // --- per-system rollup ---
  console.log(`\n${"─".repeat(120)}`);
  const HDR =
    "STATUS".padEnd(13) +
    "SYSTEM".padEnd(46) +
    "SEGS".padStart(5) +
    "  MILES".padStart(8) +
    "  BBOX".padEnd(34) +
    "  SURFACE".padEnd(22) +
    "  W_P50";
  console.log(HDR);
  console.log("─".repeat(120));

  let needsUpdateCount = 0;
  let skippedCount = 0;
  let noGeomCount = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];

  for (const system of systems) {
    const ref: string = system.extSystemRef;
    const segs = segsByRef.get(ref) ?? [];

    if (segs.length === 0) {
      console.log(
        `${"SKIP (0 segs)".padEnd(13)}${(system.slug ?? system.name ?? ref).slice(0, 45).padEnd(46)}`
      );
      skippedCount++;
      continue;
    }

    const rollup = computeRollup(segs);
    if (!rollup.bbox) noGeomCount++;

    const changed = rollupChanged(system, rollup);

    const milesStr =
      rollup.lengthMilesTotal != null
        ? rollup.lengthMilesTotal.toFixed(2)
        : "n/a";
    const bboxStr = rollup.bbox
      ? `[${rollup.bbox.map((v) => v.toFixed(3)).join(",")}]`
      : "no-geom";
    const surfStr = rollup.surfaceSummary?.primary ?? "(unknown)";
    const widthStr =
      rollup.widthSummary && rollup.widthSummary.unknownPct < 1
        ? rollup.widthSummary.p50.toFixed(1)
        : "n/a";
    const status = changed
      ? isDryRun
        ? "WOULD UPDATE"
        : "UPDATE"
      : "no-change";

    const label = (system.slug ?? system.name ?? ref).slice(0, 45);
    console.log(
      `${status.padEnd(13)}${label.padEnd(46)}${String(rollup.segmentCount).padStart(5)}  ${milesStr.padStart(7)}  ${bboxStr.padEnd(34)}  ${surfStr.slice(0, 20).padEnd(21)}  ${widthStr}`
    );

    if (isVerbose && changed) {
      const oldSnap = {
        bbox: system.bbox ?? null,
        centroid: system.centroid ?? null,
        lengthMilesTotal: system.lengthMilesTotal ?? null,
        segmentCount: system.segmentCount ?? null,
        surfaceSummary: system.surfaceSummary ?? null,
        widthSummary: system.widthSummary ?? null,
      };
      const { computedAt: _ct, ...newSnap } = rollup;
      console.log("  OLD:", JSON.stringify(oldSnap));
      console.log("  NEW:", JSON.stringify(newSnap));
    }

    if (changed) {
      needsUpdateCount++;
      // Build payload: only computed fields; omit null numerics (use undefined → not written)
      const payload: Record<string, any> = {
        segmentCount: rollup.segmentCount,
        computedAt: rollup.computedAt,
        // i.any() fields: include null explicitly to clear stale values
        bbox: rollup.bbox ?? null,
        centroid: rollup.centroid ?? null,
        surfaceSummary: rollup.surfaceSummary ?? null,
        widthSummary: rollup.widthSummary ?? null,
      };
      // i.number() fields: only include when non-null to avoid type errors
      if (rollup.lengthMilesTotal !== null) {
        payload.lengthMilesTotal = rollup.lengthMilesTotal;
      }
      updates.push({ systemId: system.id, payload });
    }
  }

  console.log("─".repeat(120));

  // --- summary ---
  console.log("\n=== ROLLUP SUMMARY ===");
  console.log(`Systems processed:  ${systems.length}`);
  console.log(`Skipped (0 segs):   ${skippedCount}`);
  console.log(`No geometry:        ${noGeomCount}`);
  console.log(`Need update:        ${needsUpdateCount}`);
  console.log(
    `Already current:    ${systems.length - skippedCount - needsUpdateCount}`
  );

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Pass --write to persist changes to InstantDB.");
    return;
  }

  if (updates.length === 0) {
    console.log("\nAll systems already up to date. Nothing to write.");
    return;
  }

  // --- write ---
  console.log(`\nWriting ${updates.length} system update(s)...`);
  const BATCH = 50;
  let written = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txSteps = chunk.map(({ systemId, payload }) =>
      (db as any).tx.trailSystems[systemId].update(payload)
    );
    await db.transact(txSteps);
    written += chunk.length;
    console.log(`  Written ${written}/${updates.length}...`);
  }

  console.log(`\nDone. ${written} system(s) updated with rollup data.`);
  console.log("======================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
