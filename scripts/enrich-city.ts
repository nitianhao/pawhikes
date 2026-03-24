#!/usr/bin/env npx tsx
/**
 * City-scoped enrichment runner for trailSystems.
 *
 * Default mode is DRY RUN. Use --dry-run false to persist updates.
 *
 * Usage:
 *   npx tsx scripts/enrich-city.ts --city "Austin" --state "TX" --modules elevation --limit 5 --dry-run
 *   npx tsx scripts/enrich-city.ts --city "Austin" --state "TX" --modules hazards --limit 5 --dry-run
 *   npx tsx scripts/enrich-city.ts --city "Austin" --state "TX" --modules route_structure --limit 5 --dry-run
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { init } from "@instantdb/admin";
import { enrichSystemElevation, type ElevationSummary } from "../src/lib/enrich/modules/elevation";
import { enrichSystemHazards, type HazardsSummary } from "./enrich/modules/hazards";
import { enrichSystemRouteStructure, type RouteStructureSummary } from "./enrich/modules/route-structure";
import { enrichSystemAccessRules, type AccessRulesSystemSummary } from "./enrich/modules/access-rules";
import { loadOsmCategory, type OsmLocalIndex } from "./lib/osmLocal.js";

const ROOT = process.cwd();

type TrailSystem = {
  id: string;
  city?: string;
  state?: string;
  slug?: string;
  extSystemRef?: string;

  elevationMinFt?: number;
  elevationMaxFt?: number;
  elevationGainFt?: number;
  elevationLossFt?: number;
  gradeP50?: number;
  gradeP90?: number;
  elevationSampleCount?: number;
  elevationProvider?: string;
  elevationComputedAt?: string;

  hazardsLastComputedAt?: number;
  hazardsScore?: number;
  hazardsClass?: "low" | "medium" | "high";
  hazardsReasons?: string[];
  hazards?: any;
  hazardPoints?: any[];
  structureLastComputedAt?: number;
  routeType?: "loop" | "out_and_back" | "lollipop" | "network" | "point_to_point" | "unknown";
  bailoutScore?: number;
  bailoutClass?: "low" | "medium" | "high";
  bailoutReasons?: string[];
  accessPoints?: any;
  loopStats?: any;
  routeGraphStats?: any;
  bailoutPoints?: any[];
  accessRulesLastComputedAt?: number;
  accessRulesScore?: number;
  accessRulesClass?: "easy" | "some_constraints" | "restricted" | "unknown";
  accessRulesReasons?: string[];
  accessRules?: any;

  [key: string]: any;
};

type TrailSegment = {
  id: string;
  systemRef?: string;
  systemSlug?: string;
  modifiedDate?: string;
  geometry?: unknown;
  [key: string]: any;
};

type TrailHead = {
  id: string;
  name?: string;
  systemRef?: string;
  trailSlug?: string;
  googleWeekdayText?: unknown;
  googleOpenNow?: unknown;
  googleMatchConfidence?: unknown;
  googleReviewCount?: unknown;
  googleWebsite?: unknown;
  parking?: unknown;
  raw?: unknown;
  [key: string]: any;
};

const ELEVATION_FIELDS: (keyof ElevationSummary)[] = [
  "elevationMinFt",
  "elevationMaxFt",
  "elevationGainFt",
  "elevationLossFt",
  "gradeP50",
  "gradeP90",
  "elevationSampleCount",
  "elevationProvider",
  "elevationComputedAt",
];

const HAZARDS_FIELDS: (keyof HazardsSummary)[] = [
  "hazardsLastComputedAt",
  "hazardsScore",
  "hazardsClass",
  "hazardsReasons",
  "hazards",
  "hazardPoints",
];

const ROUTE_STRUCTURE_FIELDS: (keyof RouteStructureSummary)[] = [
  "structureLastComputedAt",
  "routeType",
  "bailoutScore",
  "bailoutClass",
  "bailoutReasons",
  "accessPoints",
  "loopStats",
  "routeGraphStats",
  "bailoutPoints",
];

const ACCESS_RULES_FIELDS: (keyof AccessRulesSystemSummary)[] = [
  "accessRulesLastComputedAt",
  "accessRulesScore",
  "accessRulesClass",
  "accessRulesReasons",
  "accessRules",
];

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

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];

    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function parseBool(input: unknown, fallback: boolean): boolean {
  if (typeof input === "boolean") return input;
  if (typeof input !== "string") return fallback;
  const normalized = input.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parseModules(input: unknown): string[] {
  if (typeof input !== "string" || input.trim() === "") return ["elevation"];
  const modules = input
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  return modules.length > 0 ? modules : ["elevation"];
}

function entityList<T = any>(result: any, key: string): T[] {
  const v = result?.[key];
  if (Array.isArray(v)) return v as T[];
  if (v && Array.isArray(v.data)) return v.data as T[];
  return [];
}

function slugLabel(system: TrailSystem): string {
  return String(system.slug ?? system.extSystemRef ?? system.id ?? "unknown");
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 0.000001;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function displayValue(v: unknown): string {
  if (v === undefined || v === null) return "<empty>";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  const raw = JSON.stringify(v);
  if (!raw) return "<empty>";
  return raw.length > 180 ? `${raw.slice(0, 180)}...` : raw;
}

function buildDiffLines<T extends Record<string, any>>(
  system: TrailSystem,
  summary: T,
  fields: (keyof T)[]
): string[] {
  const lines: string[] = [];
  for (const key of fields) {
    const oldVal = system[key as string];
    const newVal = summary[key];
    if (!sameValue(oldVal, newVal)) {
      lines.push(`  ${String(key)}: ${displayValue(oldVal)} -> ${displayValue(newVal)}`);
    }
  }
  return lines;
}

const PER_MODULE_TIMEOUT_MS = 4 * 60 * 1000; // 4 min max per module per system

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[${label}] timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

function firstHazardPoints(points: any[] | undefined, n = 3): string {
  if (!Array.isArray(points) || points.length === 0) return "none";
  return points
    .slice(0, n)
    .map((p) => {
      const kind = String(p?.kind ?? "unknown");
      const d = typeof p?.distanceToTrailMeters === "number" ? p.distanceToTrailMeters.toFixed(1) : "?";
      return `${kind}@${d}m`;
    })
    .join(", ");
}

async function main(): Promise<void> {
  loadEnvLocal(ROOT);

  const args = parseArgs(process.argv.slice(2));
  const cityFilter = typeof args.city === "string" ? args.city : undefined;
  const osmCityArg = typeof args["osm-city"] === "string" ? args["osm-city"] : undefined;
  const stateFilter = typeof args.state === "string" ? args.state : undefined;
  const slugFilter = typeof args.slug === "string" ? args.slug : undefined;
  const modules = parseModules(args.modules);
  const limitArg = typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
  const minLength = typeof args["min-length"] === "string" ? parseFloat(args["min-length"]) : undefined;
  const skipExisting = !!args["skip-existing"];

  const dryRunExplicit = args["dry-run"] ?? args.dry;
  const dryRun = parseBool(dryRunExplicit, true);

  if (!cityFilter) {
    console.error("Error: --city is required");
    process.exit(1);
  }

  const supportedModules = new Set(["elevation", "hazards", "route_structure", "access_rules"]);
  const unsupported = modules.filter((m) => !supportedModules.has(m));
  if (unsupported.length > 0) {
    console.error(`Unsupported module(s): ${unsupported.join(", ")}`);
    console.error("Supported modules: elevation, hazards, route_structure, access_rules");
    process.exit(1);
  }

  const appId = process.env.INSTANT_APP_ID;
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

  if (!appId) {
    console.error("Error: INSTANT_APP_ID must be set in .env.local");
    process.exit(1);
  }
  if (!adminToken) {
    console.error("Error: INSTANT_APP_ADMIN_TOKEN or INSTANT_ADMIN_TOKEN must be set in .env.local");
    process.exit(1);
  }

  const runElevation = modules.includes("elevation");
  const runHazards = modules.includes("hazards");
  const runRouteStructure = modules.includes("route_structure");
  const runAccessRules = modules.includes("access_rules");

  const db = init({ appId, adminToken });

  console.log("=== CONFIG ===");
  console.log("city:        ", cityFilter);
  console.log("state:       ", stateFilter ?? "(not set)");
  console.log("slug:        ", slugFilter ?? "(all)");
  console.log("limit:       ", limitArg ?? "(all)");
  console.log("modules:     ", modules.join(", "));
  console.log("mode:        ", dryRun ? "DRY RUN (no writes)" : "WRITE");
  if (runElevation) console.log("elevationProvider:", process.env.ELEVATION_PROVIDER ?? "opentopodata");
  if (runHazards) console.log("hazardsProvider:  local-osm (fallback: overpass)");
  if (runRouteStructure) console.log("routeStructureProvider: segment-geometry");
  if (runAccessRules) console.log("accessRulesProvider: heads+local-osm (fallback: overpass)");
  console.log("==============\n");

  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = entityList<TrailSystem>(sysRes, "trailSystems");
  console.log(`  Total systems in DB: ${systems.length}`);

  const cityNeedle = cityFilter.toLowerCase();
  systems = systems.filter((s) => String(s.city ?? "").toLowerCase().includes(cityNeedle));
  console.log(`  After city=\"${cityFilter}\": ${systems.length}`);

  if (stateFilter) {
    const stateNeedle = stateFilter.toLowerCase();
    systems = systems.filter((s) => String(s.state ?? "").toLowerCase().includes(stateNeedle));
    console.log(`  After state=\"${stateFilter}\": ${systems.length}`);
  }

  if (minLength != null && minLength > 0) {
    systems = systems.filter((s: any) => (s.lengthMilesTotal ?? 0) >= minLength);
    console.log(`  After min-length=${minLength}: ${systems.length}`);
  }

  if (skipExisting) {
    const timestamps = {
      elevation: "elevationComputedAt",
      hazards: "hazardsLastComputedAt",
      route_structure: "structureLastComputedAt",
      access_rules: "accessRulesLastComputedAt",
    } as const;
    systems = systems.filter((s) =>
      modules.some((m) => {
        const field = timestamps[m as keyof typeof timestamps];
        return field ? s[field] == null : true;
      })
    );
    console.log(`  After skip-existing: ${systems.length}`);
  }

  if (slugFilter) {
    const slugNeedle = slugFilter.toLowerCase();
    systems = systems.filter((s) => String(s.slug ?? "").toLowerCase() === slugNeedle);
    console.log(`  After slug=\"${slugFilter}\": ${systems.length}`);
  }

  if (limitArg && Number.isFinite(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }

  if (systems.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  console.log("\nFetching trailSegments...");
  const segRes = await db.query({ trailSegments: { $: { limit: 15000 } } });
  const segments = entityList<TrailSegment>(segRes, "trailSegments");
  console.log(`  Loaded segments: ${segments.length}`);
  let trailHeads: TrailHead[] = [];
  if (runAccessRules) {
    console.log("\nFetching trailHeads...");
    const headRes = await db.query({ trailHeads: { $: { limit: 15000 } } });
    trailHeads = entityList<TrailHead>(headRes, "trailHeads");
    console.log(`  Loaded trailHeads: ${trailHeads.length}`);
  }

  let hazardsLocalIndex: OsmLocalIndex | null = null;
  if ((runHazards || runAccessRules) && cityFilter) {
    console.log("\nLoading local OSM hazards index...");
    hazardsLocalIndex = loadOsmCategory(osmCityArg ?? cityFilter, "hazards");
    if (hazardsLocalIndex) {
      console.log(`  Local hazards index: ${hazardsLocalIndex.elements.length} elements`);
    } else {
      console.log("  No local hazards cache found; will fall back to Overpass API");
    }
  }

  const updates: { id: string; payload: Record<string, any> }[] = [];
  const headUpdates: { id: string; payload: Record<string, any> }[] = [];
  let skipped = 0;
  let written = 0;

  const _t0 = Date.now();
  let _idx = 0;
  const _hb = setInterval(() => {
    const m = Math.round((Date.now() - _t0) / 60000);
    console.log(`\n[${new Date().toTimeString().slice(0, 5)}] ${written}/${systems.length} done (${m}m elapsed)\n`);
  }, 5 * 60 * 1000);

  for (const system of systems) {
    _idx++;
    const label = slugLabel(system);
    console.log(`[${new Date().toTimeString().slice(0, 5)}] [${_idx}/${systems.length}] ${label}`);
    const payload: Record<string, any> = {};
    let moduleSucceeded = false;

    if (runElevation) {
      try {
        const result = await withTimeout(
          enrichSystemElevation(system, {
            segments,
            rootDir: ROOT,
            logger: (line) => console.log(`[${label}] ${line}`),
          }),
          PER_MODULE_TIMEOUT_MS,
          label
        );

        if (result.ok === false) {
          console.log(`[elevation][SKIP] ${label} reason=${result.reason}`);
        } else {
          moduleSucceeded = true;
          const diffLines = buildDiffLines(system, result.summary, ELEVATION_FIELDS);
          if (diffLines.length === 0) {
            console.log(
              `[elevation][${dryRun ? "DRY" : "WRITE"}] ${label} no changes provider=${result.meta.provider} cache=${result.meta.cacheHit ? "hit" : "miss"}`
            );
          } else {
            console.log(
              `[elevation][${dryRun ? "DRY" : "WRITE"}] ${label} provider=${result.meta.provider} cache=${result.meta.cacheHit ? "hit" : "miss"}`
            );
            for (const line of diffLines) console.log(line);
          }

          if (!dryRun) Object.assign(payload, result.summary);
        }
      } catch (err: any) {
        console.error(
          `[elevation][ERROR] ${label} (${String(system.extSystemRef ?? "n/a")}) ${String(err?.message ?? err)}`
        );
      }
    }

    if (runHazards) {
      try {
        const result = await withTimeout(
          enrichSystemHazards(system, {
            segments,
            rootDir: ROOT,
            localIndex: hazardsLocalIndex,
            logger: (line) => console.log(`[${label}] ${line}`),
          }),
          PER_MODULE_TIMEOUT_MS,
          label
        );

        if (result.ok === false) {
          console.log(`[hazards][SKIP] ${label} reason=${result.reason}`);
        } else {
          moduleSucceeded = true;
          const summary = result.summary;
          const pointsPreview = firstHazardPoints(summary.hazardPoints, 3);

          console.log(
            `[hazards][${dryRun ? "DRY" : "WRITE"}] ${label} class=${summary.hazardsClass} score=${summary.hazardsScore.toFixed(2)} cache=${result.meta.cacheHit ? "hit" : "miss"}`
          );
          console.log(
            `  counts: road=${summary.hazards.roadCrossings.count} risky=${summary.hazards.roadCrossings.riskyCount} water=${summary.hazards.waterCrossings.count} cliff=${summary.hazards.cliffOrSteepEdge.count} bike=${summary.hazards.bikeConflictProxy.count} offLeashProxy=${summary.hazards.offLeashConflictProxy.count}`
          );
          console.log(`  points: ${pointsPreview}`);

          if (dryRun) {
            const hazardDiffs = buildDiffLines(system, summary, HAZARDS_FIELDS);
            for (const line of hazardDiffs.slice(0, 6)) console.log(line);
          } else {
            Object.assign(payload, summary);
          }
        }
      } catch (err: any) {
        console.error(
          `[hazards][ERROR] ${label} (${String(system.extSystemRef ?? "n/a")}) ${String(err?.message ?? err)}`
        );
      }
    }

    if (runRouteStructure) {
      try {
        const result = await withTimeout(
          enrichSystemRouteStructure(system, {
            segments,
            rootDir: ROOT,
            logger: (line) => console.log(`[${label}] ${line}`),
          }),
          PER_MODULE_TIMEOUT_MS,
          label
        );

        if (result.ok === false) {
          console.log(`[route_structure][SKIP] ${label} reason=${result.reason}`);
        } else {
          moduleSucceeded = true;
          const summary = result.summary;
          console.log(
            `[route_structure][${dryRun ? "DRY" : "WRITE"}] ${label} routeType=${summary.routeType} bailout=${summary.bailoutClass}(${summary.bailoutScore.toFixed(2)}) cache=${result.meta.cacheHit ? "hit" : "miss"}`
          );
          console.log(
            `  graph: nodes=${summary.routeGraphStats.nodeCount} edges=${summary.routeGraphStats.edgeCount} intersections=${summary.routeGraphStats.intersectionCount} deadEnds=${summary.routeGraphStats.deadEndCount} components=${summary.routeGraphStats.componentCount}`
          );
          console.log(
            `  access: entrances=${summary.accessPoints.entranceCount} density=${summary.accessPoints.entranceDensityPerMile}/mi maxGap=${summary.accessPoints.maxGapBetweenEntrancesMiles}`
          );

          if (dryRun) {
            const routeDiffs = buildDiffLines(system, summary, ROUTE_STRUCTURE_FIELDS);
            for (const line of routeDiffs.slice(0, 6)) console.log(line);
          } else {
            Object.assign(payload, summary);
          }
        }
      } catch (err: any) {
        console.error(
          `[route_structure][ERROR] ${label} (${String(system.extSystemRef ?? "n/a")}) ${String(err?.message ?? err)}`
        );
      }
    }

    if (runAccessRules) {
      try {
        const result = await withTimeout(
          enrichSystemAccessRules(system, {
            segments,
            trailHeads,
            rootDir: ROOT,
            localIndex: hazardsLocalIndex,
            logger: (line) => console.log(`[${label}] ${line}`),
          }),
          PER_MODULE_TIMEOUT_MS,
          label
        );

        if (result.ok === false) {
          console.log(`[access_rules][SKIP] ${label} reason=${result.reason}`);
        } else {
          moduleSucceeded = true;
          const summary = result.systemSummary;
          console.log(
            `[access_rules][${dryRun ? "DRY" : "WRITE"}] ${label} class=${summary.accessRulesClass} score=${summary.accessRulesScore.toFixed(2)} cache=${result.meta.cacheHit ? "hit" : "miss"}`
          );
          console.log(
            `  hours: known=${summary.accessRules.hours.known} source=${summary.accessRules.hours.source} confidence=${summary.accessRules.hours.confidence}`
          );
          console.log(
            `  fees: feeLikely=${summary.accessRules.fees.feeLikely} source=${summary.accessRules.fees.source}`
          );
          console.log(`  access: ${summary.accessRules.access.accessClass}`);
          console.log(
            `  landManager: operator=${String(summary.accessRules.landManager.operator ?? "n/a")} owner=${String(summary.accessRules.landManager.owner ?? "n/a")} agency=${String(summary.accessRules.landManager.agencyClass ?? "unknown")}`
          );

          for (const head of result.headUpdates) {
            const feeText = head.feeLikely === null ? "unknown" : String(head.feeLikely);
            console.log(`  head: ${head.headName} hours=${head.hasHours} feeLikely=${feeText}`);
          }

          if (dryRun) {
            const accessDiffs = buildDiffLines(system, summary, ACCESS_RULES_FIELDS);
            for (const line of accessDiffs.slice(0, 6)) console.log(line);
          } else {
            Object.assign(payload, summary);
            for (const head of result.headUpdates) {
              headUpdates.push({ id: head.headId, payload: head.payload });
            }
          }
        }
      } catch (err: any) {
        console.error(
          `[access_rules][ERROR] ${label} (${String(system.extSystemRef ?? "n/a")}) ${String(err?.message ?? err)}`
        );
      }
    }

    if (!moduleSucceeded) {
      skipped++;
      continue;
    }

    if (!dryRun && Object.keys(payload).length > 0) {
      updates.push({ id: system.id, payload });
      await db.transact([(db as any).tx.trailSystems[system.id].update(payload)]);
      written++;
      console.log(`[${new Date().toTimeString().slice(0, 5)}] ${written}/${systems.length} done: ${label}`);
    }
  }

  clearInterval(_hb);

  if (!dryRun && headUpdates.length > 0) {
    console.log(`Writing ${headUpdates.length} trailHead update(s)...`);
    for (const update of headUpdates) {
      await db.transact([(db as any).tx.trailHeads[update.id].update(update.payload)]);
    }
  }

  console.log(`\nProcessed ${systems.length} system(s).`);
  console.log(`Skipped ${skipped} system(s).`);
  if (dryRun) {
    console.log("DRY RUN complete: no writes performed.");
  } else {
    console.log("Write run complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
