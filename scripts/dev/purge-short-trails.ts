#!/usr/bin/env npx tsx
/**
 * Purge trailSystems with lengthMilesTotal <= 1 (or null/0) and their associated trailSegments.
 *
 * DRY RUN by default — pass --commit to delete.
 *
 * Usage:
 *   npx tsx scripts/dev/purge-short-trails.ts          # dry run
 *   npx tsx scripts/dev/purge-short-trails.ts --commit  # delete
 */

import { readFileSync } from "fs";
import { join } from "path";
import { init } from "@instantdb/admin";

const ROOT = process.cwd();
function loadEnv(d: string) {
  try {
    for (const line of readFileSync(join(d, ".env.local"), "utf-8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[k] = v;
    }
  } catch {}
}
loadEnv(ROOT);

const isCommit = process.argv.includes("--commit");

const db = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN!,
});

const BATCH_SIZE = 50;

async function deleteBatch(entity: string, ids: string[]): Promise<void> {
  const txns = ids.map((id) => (db.tx as any)[entity][id].delete());
  await db.transact(txns);
}

async function main() {
  console.log("=== purge-short-trails ===");
  console.log("mode:", isCommit ? "COMMIT — will delete from DB" : "DRY RUN (pass --commit to delete)");
  console.log();

  // Fetch all systems
  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const allSystems = (sysRes.trailSystems ?? []) as Record<string, unknown>[];

  const toDeleteSystems = allSystems.filter(
    (s) => (s.lengthMilesTotal as number | null) == null || (s.lengthMilesTotal as number) <= 1
  );
  const deleteSystemIds = toDeleteSystems.map((s) => s.id as string);
  const deleteSystemRefs = new Set(toDeleteSystems.map((s) => s.extSystemRef as string).filter(Boolean));

  console.log(`Total systems in DB:   ${allSystems.length}`);
  console.log(`Systems to delete:     ${toDeleteSystems.length}  (lengthMilesTotal <= 1 or null)`);
  console.log(`Systems to keep:       ${allSystems.length - toDeleteSystems.length}`);

  // Fetch all segments
  const segRes = await db.query({ trailSegments: { $: { limit: 25000 } } });
  const allSegs = (segRes.trailSegments ?? []) as Record<string, unknown>[];

  const toDeleteSegs = allSegs.filter((s) => deleteSystemRefs.has(s.systemRef as string));
  const deleteSegIds = toDeleteSegs.map((s) => s.id as string);

  console.log(`Total segments in DB:  ${allSegs.length}`);
  console.log(`Segments to delete:    ${toDeleteSegs.length}`);
  console.log(`Segments to keep:      ${allSegs.length - toDeleteSegs.length}`);

  if (!isCommit) {
    console.log("\nDRY RUN complete. Pass --commit to execute deletions.");
    return;
  }

  // Delete segments first (FK-like dependency)
  console.log(`\nDeleting ${deleteSegIds.length} segments in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < deleteSegIds.length; i += BATCH_SIZE) {
    const batch = deleteSegIds.slice(i, i + BATCH_SIZE);
    await deleteBatch("trailSegments", batch);
    console.log(`  Deleted segments ${i + batch.length}/${deleteSegIds.length}`);
  }

  // Delete systems
  console.log(`\nDeleting ${deleteSystemIds.length} systems in batches of ${BATCH_SIZE}...`);
  for (let i = 0; i < deleteSystemIds.length; i += BATCH_SIZE) {
    const batch = deleteSystemIds.slice(i, i + BATCH_SIZE);
    await deleteBatch("trailSystems", batch);
    console.log(`  Deleted systems ${i + batch.length}/${deleteSystemIds.length}`);
  }

  console.log("\nDone.");
}

main().catch(console.error).finally(() => process.exit(0));
