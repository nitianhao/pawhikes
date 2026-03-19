#!/usr/bin/env node
/**
 * One-time cleanup: delete all trailSystems and trailSegments with extDataset="okc_osm".
 * Run this before re-ingesting OKC with the corrected name filter.
 *
 * Usage: node scripts/cleanup-okc-ingest.mjs [--write]
 *   Default: dry run (lists what would be deleted)
 *   --write:  actually deletes
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnvLocal(root);

const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
const appId = process.env.INSTANT_APP_ID;

if (!appId || !adminToken) {
  console.error("Error: INSTANT_APP_ID and INSTANT_ADMIN_TOKEN must be set in .env.local");
  process.exit(1);
}

const write = process.argv.includes("--write");
const EXT_DATASET = "okc_osm";
const INDEX_LIMIT = 10000;
const BATCH_SIZE = 200;

function entityList(res, name) {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

async function main() {
  const db = init({ appId, adminToken });
  console.log(`Mode: ${write ? "WRITE (will delete)" : "DRY RUN"}`);
  console.log(`Cleaning up extDataset="${EXT_DATASET}" ...\n`);

  // Paginated delete: keep querying + deleting until nothing remains
  async function deleteAll(entity, label) {
    let totalDeleted = 0;
    let round = 0;
    const MAX_ROUNDS = 200;
    while (true) {
      round++;
      if (round > MAX_ROUNDS) {
        console.error(`  [Round ${round}] Safety limit reached — aborting to prevent infinite loop`);
        process.exit(1);
      }
      const res = await db.query({ [entity]: { $: { limit: INDEX_LIMIT } } });
      const records = entityList(res, entity).filter((s) => s.extDataset === EXT_DATASET);
      if (records.length === 0) break;
      console.log(`  [Round ${round}] Found ${records.length} ${label} to delete...`);
      if (!write) {
        totalDeleted += records.length;
        break; // dry run: just count one round
      }
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const chunk = records.slice(i, i + BATCH_SIZE);
        const steps = chunk.map((s) => db.tx[entity][s.id].delete());
        await db.transact(steps);
        await new Promise((r) => setTimeout(r, 150));
      }
      totalDeleted += records.length;
    }
    return totalDeleted;
  }

  console.log("\n--- Deleting trailSystems ---");
  const sysDeleted = await deleteAll("trailSystems", "systems");
  console.log(`Systems deleted: ${sysDeleted}`);

  console.log("\n--- Deleting trailSegments ---");
  const segDeleted = await deleteAll("trailSegments", "segments");
  console.log(`Segments deleted: ${segDeleted}`);

  if (!write) {
    console.log("\nDry run — pass --write to actually delete.");
  }

  console.log("\n=== CLEANUP COMPLETE ===");
  console.log(`Systems deleted:  ${sysDeleted}`);
  console.log(`Segments deleted: ${segDeleted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
