#!/usr/bin/env npx tsx
/**
 * Personalization + Safety enrichment for trailSystems.
 *
 * DRY RUN by default. Pass --dry false to persist to InstantDB.
 *
 * Usage:
 *   npx tsx scripts/enrich-systems-personalization.ts --city "Austin" [--state "TX"] [--slug "mueller-trail"] [--limit 5] [--dry true|false] [--batchSize 50] [--modules personalization,safety] [--radiusMeters 10000]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";
import { computePersonalization } from "../src/lib/enrich/modules/personalization";
import { computeSafety } from "../src/lib/enrich/modules/safety";

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

function entityList<T = any>(result: any, key: string): T[] {
  const v = result?.[key];
  if (Array.isArray(v)) return v as T[];
  if (v && Array.isArray(v.data)) return v.data as T[];
  return [];
}

function parseBool(input: unknown, fallback: boolean): boolean {
  if (typeof input !== "string") return fallback;
  const normalized = input.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function parseModules(input: unknown): string[] {
  if (typeof input !== "string" || input.trim() === "") return ["personalization"];
  const modules = input
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(Boolean);
  return modules.length > 0 ? modules : ["personalization"];
}

function toScore(value: number): string {
  return value.toFixed(2);
}

function firstReason(value: string[]): string {
  return value[0] ?? "n/a";
}

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
          await sleep(attempt * 8_000);
          continue;
        }
        if (!resp.ok) continue;
        const json: any = await resp.json();
        return json.elements ?? [];
      } catch {
        if (attempt < RETRIES) await sleep(3_000 * attempt);
      }
    }
  }
  return [];
}

async function main(): Promise<void> {
  loadEnvLocal(ROOT);

  const args = parseArgs(process.argv.slice(2));
  const cityFilter = typeof args.city === "string" ? args.city : undefined;
  const stateFilter = typeof args.state === "string" ? args.state : undefined;
  const slugFilter = typeof args.slug === "string" ? args.slug : undefined;
  const limitArg = typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
  const isDryRun = parseBool(args.dry, true);
  const batchSizeRaw = typeof args.batchSize === "string" ? parseInt(args.batchSize, 10) : 50;
  const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : 50;
  const radiusRaw = typeof args.radiusMeters === "string" ? parseInt(args.radiusMeters, 10) : 10_000;
  const radiusMeters = Number.isFinite(radiusRaw) && radiusRaw > 0 ? radiusRaw : 10_000;
  const modules = parseModules(args.modules);
  const minLength = typeof args["min-length"] === "string" ? parseFloat(args["min-length"]) : undefined;

  if (!cityFilter) {
    console.error("Error: --city is required");
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

  const db = init({ appId, adminToken });
  const runPersonalization = modules.includes("personalization");
  const runSafety = modules.includes("safety");

  console.log("=== CONFIG ===");
  console.log("city:     ", cityFilter);
  console.log("state:    ", stateFilter ?? "(not set)");
  console.log("slug:     ", slugFilter ?? "(all)");
  console.log("limit:    ", limitArg ?? "(all)");
  console.log("batchSize:", batchSize);
  console.log("radius:   ", `${radiusMeters}m`);
  console.log("modules:  ", modules.join(", "));
  console.log("mode:     ", isDryRun ? "DRY RUN (no writes)" : "WRITE");
  console.log("==============\n");

  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = entityList<any>(sysRes, "trailSystems");
  console.log(`  Total systems in DB: ${systems.length}`);

  if (cityFilter) {
    const n = cityFilter.toLowerCase();
    systems = systems.filter((s) => String(s.city ?? "").toLowerCase().includes(n));
    console.log(`  After city=\"${cityFilter}\": ${systems.length}`);
  }
  if (stateFilter) {
    const n = stateFilter.toLowerCase();
    systems = systems.filter((s) => !s.state || String(s.state).toLowerCase().includes(n));
    console.log(`  After state=\"${stateFilter}\": ${systems.length}`);
  }
  if (minLength != null && minLength > 0) {
    systems = systems.filter((s: any) => (s.lengthMilesTotal ?? 0) > minLength);
    console.log(`  After min-length=${minLength}: ${systems.length}`);
  }
  if (slugFilter) {
    const n = slugFilter.toLowerCase();
    systems = systems.filter((s) => String(s.slug ?? "").toLowerCase() === n);
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

  let processed = 0;
  const updates: { systemId: string; payload: Record<string, any> }[] = [];
  for (const system of systems) {
    const slug = String(system.slug ?? system.extSystemRef ?? system.id ?? "unknown");

    if (runPersonalization) {
      const output = computePersonalization(system);
      const modeLabel = isDryRun ? "DRY" : "WRITE";
      console.log(
        `[personalization][${modeLabel}] ${slug} ` +
        `senior=${toScore(output.seniorSafeScore)} ` +
        `small=${toScore(output.smallDogScore)} ` +
        `heat=${output.heatSensitiveLevel} ` +
        `energy=${toScore(output.highEnergyScore)} ` +
        `reasons=${firstReason(output.seniorSafeReasons)} | ${firstReason(output.smallDogReasons)} | ${firstReason(output.heatSensitiveReasons)} | ${firstReason(output.highEnergyReasons)}`
      );

      if (!isDryRun) {
        updates.push({
          systemId: String(system.id),
          payload: {
            personalization: output,
            personalizationLastComputedAt: Date.now(),
          },
        });
      }
    }

    if (runSafety) {
      const safety = await computeSafety(system, { overpass: overpassPost, radiusMeters });
      const nearest = safety.nearbyVets[0];
      const nearestLabel = nearest ? (nearest.name ?? nearest.osmId) : "none";
      const modeLabel = isDryRun ? "DRY" : "WRITE";
      console.log(
        `[safety][${modeLabel}] ${slug} ` +
        `access=${safety.emergencyAccessClass}(${toScore(safety.emergencyAccessScore)}) ` +
        `vets=${safety.vetCountWithin5km} ` +
        `nearest=${nearestLabel} ` +
        `cell=${safety.cellCoverageProxy}`
      );

      if (!isDryRun) {
        updates.push({
          systemId: String(system.id),
          payload: {
            safety,
            safetyLastComputedAt: Date.now(),
          },
        });
      }
    }
    processed++;
  }

  if (!isDryRun) {
    let written = 0;
    for (let i = 0; i < updates.length; i += batchSize) {
      const chunk = updates.slice(i, i + batchSize);
      const txSteps = chunk.map(({ systemId, payload }) =>
        (db as any).tx.trailSystems[systemId].update(payload)
      );
      await db.transact(txSteps);
      written += chunk.length;
      console.log(`  Written ${written}/${updates.length}...`);
    }
  }

  console.log(`\nProcessed ${processed} system(s).`);
  if (isDryRun) {
    console.log("DRY RUN complete: no writes performed.");
  } else {
    console.log("Write run complete.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
