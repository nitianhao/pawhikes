#!/usr/bin/env node
/**
 * Ingest Austin Urban Trails (Socrata jdwm-wfps) into canonical InstantDB entities.
 * Writes into: trailSystems, trailSegments (trails/trailHeads remain empty for now).
 * Existing-only + city_municipal starts with "Austin".
 * Uses @instantdb/admin (db.query / db.transact). Loads .env.local via shared loader.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init, id } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const SOCRATA_BASE = "https://data.austintexas.gov/resource/jdwm-wfps.json";
const LIMIT = 1000;
const DELAY_MS = 200;
const BATCH_SIZE = 200;
const EXT_DATASET = "austin_socrata_jdwm-wfps";
const INDEX_LIMIT = 5000;

const preExistingAppId = process.env.INSTANT_APP_ID;
const preExistingToken = process.env.INSTANT_APP_ADMIN_TOKEN ?? process.env.INSTANT_ADMIN_TOKEN;
loadEnvLocal(root);

const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
const appId = process.env.INSTANT_APP_ID;

if (!appId) {
  console.error("Error: INSTANT_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!adminToken) {
  console.error("Error: INSTANT_APP_ADMIN_TOKEN or INSTANT_ADMIN_TOKEN must be set in .env.local");
  process.exit(1);
}

function maskToken(t) {
  if (t == null || typeof t !== "string" || t.length < 10) return t ? "***" : "(none)";
  return t.slice(0, 6) + "..." + t.slice(-4);
}

console.log("=== INSTANT CONFIG ===");
console.log("appId:", appId);
console.log("adminToken:", maskToken(adminToken));
console.log("extDataset:", EXT_DATASET);
console.log("======================");
console.log("preExistingAppId:", preExistingAppId ?? "(none)");
console.log("preExistingToken:", maskToken(preExistingToken));

function entityList(res, entityName) {
  return res?.[entityName] ?? res?.data?.[entityName] ?? [];
}

function slugify(s) {
  if (s == null || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function safeNum(v) {
  if (v == null || v === "") return undefined;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? undefined : n;
}

function safeStr(v) {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

async function fetchSocrataPage(offset) {
  const where =
    "phase_simple='Existing' AND build_status='Existing' AND starts_with(city_municipal,'Austin')";
  const url = `${SOCRATA_BASE}?$where=${encodeURIComponent(where)}&$limit=${LIMIT}&$offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`Socrata ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
  return res.json();
}

function recordToSegmentPayload(r) {
  const systemName = safeStr(r.urban_trail_system_name) || "Unknown";
  const systemSlug = slugify(systemName) || "unknown";
  const extSystemRef = "sys:" + systemSlug;
  // objectid is the most stable unique field in this Socrata GIS dataset
  const extSegmentRef = String(r.objectid ?? "");

  return {
    extDataset: EXT_DATASET,
    extSegmentRef,
    systemRef: extSystemRef,
    systemSlug,
    name: safeStr(r.urban_trail_name) || undefined,
    city: safeStr(r.city_municipal),
    county: safeStr(r.county),
    // prefer urban_trail_feature; fall back to urban_trail_type
    feature: safeStr(r.urban_trail_feature) || safeStr(r.urban_trail_type),
    surface: safeStr(r.trail_surface_type),
    lengthMiles: safeNum(r.length_miles),
    width: safeNum(r.width),
    geometry: r.the_geom ?? undefined,
    createdBy: safeStr(r.created_by),
    createdDate: safeStr(r.created_date),
    modifiedBy: safeStr(r.modified_by),
    modifiedDate: safeStr(r.modified_date),
    raw: {
      objectid: r.objectid,
      urban_trail_type: r.urban_trail_type,
      urban_trail_feature: r.urban_trail_feature,
      shape_length: r.shape_length,
      location: r.location,
      phase_simple: r.phase_simple,
      build_status: r.build_status,
    },
  };
}

async function main() {
  const db = init({ appId, adminToken });
  console.log("Admin SDK initialized OK");

  // Schema presence check: ensure all 4 canonical entities exist
  const REQUIRED_ENTITIES = ["trails", "trailHeads", "trailSystems", "trailSegments"];
  console.log("\n--- Schema presence check ---");
  for (const entity of REQUIRED_ENTITIES) {
    try {
      await db.query({ [entity]: { $: { limit: 1 } } });
      console.log(`  OK ${entity}`);
    } catch (err) {
      console.error(`  MISSING ${entity} -- ${err?.message ?? err}`);
      console.error(`Schema entity "${entity}" not found. Run: npm run instant:pushverify`);
      process.exit(1);
    }
  }
  console.log("Schema check passed.\n");

  // Fetch all records from Socrata
  const allRecords = [];
  let offset = 0;
  for (;;) {
    const page = await fetchSocrataPage(offset);
    if (!Array.isArray(page) || page.length === 0) break;
    allRecords.push(...page);
    console.log(`Fetched ${page.length} records (offset=${offset}, total=${allRecords.length})`);
    if (page.length < LIMIT) break;
    offset += LIMIT;
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  const totalFetched = allRecords.length;
  if (totalFetched === 0) {
    console.log("No records to ingest.");
    return;
  }
  console.log(`\nTotal records fetched: ${totalFetched}`);

  const segmentPayloads = allRecords.map(recordToSegmentPayload);

  // Build system map: extSystemRef -> trailSystems payload (one entry per distinct system)
  const systemsByRef = new Map();
  for (const seg of segmentPayloads) {
    const ref = seg.systemRef;
    if (!systemsByRef.has(ref)) {
      // Find a representative raw record to get the proper-cased system name
      const repRec = allRecords.find(
        (r) => ("sys:" + slugify(safeStr(r.urban_trail_system_name) || "Unknown")) === ref
      );
      const name = safeStr(repRec?.urban_trail_system_name) || seg.systemSlug;
      systemsByRef.set(ref, {
        extDataset: EXT_DATASET,
        extSystemRef: ref,
        name,
        slug: seg.systemSlug,
        city: seg.city,
        county: seg.county,
        raw: { dataset: EXT_DATASET },
      });
    }
  }

  // Load existing trailSystems indexed by extSystemRef (for upsert)
  // Note: do NOT select id: {} explicitly — InstantDB returns id automatically
  const sysRes = await db.query({
    trailSystems: { $: { limit: INDEX_LIMIT } },
  });
  const existingSysByRef = new Map();
  for (const s of entityList(sysRes, "trailSystems")) {
    const sid = s.id ?? s._id;
    if (s.extSystemRef && sid) existingSysByRef.set(String(s.extSystemRef), sid);
  }

  // Load existing trailSegments indexed by extSegmentRef (for upsert)
  const segRes = await db.query({
    trailSegments: { $: { limit: INDEX_LIMIT } },
  });
  const existingSegByRef = new Map();
  for (const s of entityList(segRes, "trailSegments")) {
    const sid = s.id ?? s._id;
    if (s.extSegmentRef && sid) existingSegByRef.set(String(s.extSegmentRef), sid);
  }

  // Upsert trailSystems (one transaction per system to keep payloads small)
  let systemsUpserted = 0;
  for (const [ref, payload] of systemsByRef) {
    const existingId = existingSysByRef.get(ref);
    const internalId = existingId ?? id();
    await db.transact([db.tx.trailSystems[internalId].update(payload)]);
    systemsUpserted++;
  }
  console.log(`Systems upserted: ${systemsUpserted}`);

  // Upsert trailSegments in batches
  let segmentsUpserted = 0;
  let skipped = 0;
  const skipReasons = {};

  for (let i = 0; i < segmentPayloads.length; i += BATCH_SIZE) {
    const chunk = segmentPayloads.slice(i, i + BATCH_SIZE);
    const steps = [];

    for (const seg of chunk) {
      if (!seg.extSegmentRef) {
        skipped++;
        skipReasons["missing_extSegmentRef"] =
          (skipReasons["missing_extSegmentRef"] || 0) + 1;
        continue;
      }
      const existingId = existingSegByRef.get(seg.extSegmentRef);
      const internalId = existingId ?? id();
      steps.push(db.tx.trailSegments[internalId].update(seg));
      segmentsUpserted++;
    }

    if (steps.length) await db.transact(steps);
    const done = Math.min(i + BATCH_SIZE, segmentPayloads.length);
    console.log(`  Segments upserted ${done}/${segmentPayloads.length}...`);
  }

  console.log("\n=== INGEST SUMMARY ===");
  console.log(`extDataset:        ${EXT_DATASET}`);
  console.log(`totalFetched:      ${totalFetched}`);
  console.log(`systemsUpserted:   ${systemsUpserted}`);
  console.log(`segmentsUpserted:  ${segmentsUpserted}`);
  console.log(`skipped:           ${skipped}`);
  if (skipped > 0) {
    console.log("skipReasons:", JSON.stringify(skipReasons, null, 2));
  }
  console.log("======================");
}

main().catch((err) => {
  console.error(err);
  if (err?.body) console.error("API body:", JSON.stringify(err.body, null, 2));
  process.exit(1);
});
