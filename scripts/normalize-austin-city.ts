#!/usr/bin/env npx tsx
/**
 * Merge Austin variants into one city: set city = "Austin" for all trail systems
 * that currently have city "Austin 2 Mile ETJ" or "Austin LTD".
 *
 * Usage:
 *   npx tsx scripts/normalize-austin-city.ts
 *   npx tsx scripts/normalize-austin-city.ts --write
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function loadEnvLocal(rootDir: string): void {
  const envPath = join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvLocal(ROOT);

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const write = !!args.write;

const appId = process.env.INSTANT_APP_ID || process.env.INSTANTDB_APP_ID;
const adminToken =
  process.env.INSTANT_APP_ADMIN_TOKEN ||
  process.env.INSTANT_ADMIN_TOKEN ||
  process.env.INSTANTDB_ADMIN_TOKEN;

if (!appId || !adminToken) {
  console.error("Missing INSTANT_APP_ID or INSTANT_ADMIN_TOKEN in .env.local");
  process.exit(1);
}

const CITIES_TO_NORMALIZE = ["Austin 2 Mile ETJ", "Austin LTD"];
const TARGET_CITY = "Austin";

function entityList(res: unknown, name: string): unknown[] {
  const r = res as Record<string, unknown>;
  const raw = r?.[name];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && "data" in raw)
    return (raw as { data: unknown[] }).data ?? [];
  return [];
}

async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });
  console.log("Normalize Austin city names\n");
  console.log("Target: set city = '%s' for systems with city in %o\n", TARGET_CITY, CITIES_TO_NORMALIZE);
  console.log("Mode: %s\n", write ? "WRITE" : "DRY RUN");

  const res = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const systems = entityList(res, "trailSystems") as Array<{
    id: string;
    city?: string;
    name?: string;
    slug?: string;
  }>;

  const toUpdate = systems.filter((s) => {
    const city = String(s.city ?? "").trim();
    return CITIES_TO_NORMALIZE.some((c) => city === c);
  });

  if (toUpdate.length === 0) {
    console.log("No trail systems found with city in %o. Nothing to do.", CITIES_TO_NORMALIZE);
    return;
  }

  console.log("Found %s system(s) to update:\n", toUpdate.length);
  for (const s of toUpdate) {
    console.log("  %s  city: %s -> %s  (%s)", s.id.slice(0, 8), s.city, TARGET_CITY, s.name ?? s.slug ?? "—");
  }

  if (!write) {
    console.log("\nDone (dry run). Run with --write to persist.");
    return;
  }

  const BATCH = 25;
  let written = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const chunk = toUpdate.slice(i, i + BATCH);
    const steps = chunk.map((s) => db.tx.trailSystems[s.id].update({ city: TARGET_CITY }));
    await db.transact(steps);
    written += chunk.length;
    console.log("\nUpdated %s/%s...", written, toUpdate.length);
  }

  console.log("\nDone. %s trail system(s) set to city '%s'.", written, TARGET_CITY);
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body) console.error("API body:", (err as any).body);
  process.exit(1);
});
