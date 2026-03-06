#!/usr/bin/env node
/**
 * Wire InstantDB links: trailSegments.system <-> trailSystems.segments
 *
 * Reads the existing string FK (segment.systemRef == system.extSystemRef)
 * and creates the corresponding link-type associations in InstantDB.
 *
 * Safe to re-run: linking the same pair twice is idempotent.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnvLocal(root);

const appId = process.env.INSTANT_APP_ID;
const adminToken =
  process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

if (!appId) { console.error("INSTANT_APP_ID missing"); process.exit(1); }
if (!adminToken) { console.error("INSTANT_ADMIN_TOKEN missing"); process.exit(1); }

const BATCH = 200;
const LIMIT = 5000;

function entityList(res, name) {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

async function main() {
  const db = init({ appId, adminToken });
  console.log("Admin SDK initialized OK");

  // Fetch all systems → Map(extSystemRef → instantId)
  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: LIMIT } } });
  const systems = entityList(sysRes, "trailSystems");
  const sysIdByRef = new Map();
  for (const s of systems) {
    if (s.extSystemRef && s.id) sysIdByRef.set(String(s.extSystemRef), s.id);
  }
  console.log(`  ${systems.length} systems indexed`);

  // Fetch all segments
  console.log("Fetching trailSegments...");
  const segRes = await db.query({ trailSegments: { $: { limit: LIMIT } } });
  const segments = entityList(segRes, "trailSegments");
  console.log(`  ${segments.length} segments fetched`);

  // Build link pairs, report skips
  let linked = 0;
  let skipped = 0;
  const skipReasons = {};

  for (let i = 0; i < segments.length; i += BATCH) {
    const chunk = segments.slice(i, i + BATCH);
    const steps = [];

    for (const seg of chunk) {
      if (!seg.systemRef) {
        skipped++;
        skipReasons["missing_systemRef"] =
          (skipReasons["missing_systemRef"] || 0) + 1;
        continue;
      }
      const sysId = sysIdByRef.get(seg.systemRef);
      if (!sysId) {
        skipped++;
        skipReasons[`no_system_for_ref:${seg.systemRef}`] =
          (skipReasons[`no_system_for_ref:${seg.systemRef}`] || 0) + 1;
        continue;
      }
      steps.push(db.tx.trailSegments[seg.id].link({ system: sysId }));
      linked++;
    }

    if (steps.length) await db.transact(steps);
    const done = Math.min(i + BATCH, segments.length);
    console.log(`  Linked ${done}/${segments.length}...`);
  }

  console.log("\n=== LINK SUMMARY ===");
  console.log(`linked:  ${linked}`);
  console.log(`skipped: ${skipped}`);
  if (skipped > 0) console.log("skipReasons:", skipReasons);
  console.log("====================");
}

main().catch((err) => {
  console.error(err);
  if (err?.body) console.error("API body:", JSON.stringify(err.body, null, 2));
  process.exit(1);
});
