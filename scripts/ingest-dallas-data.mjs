#!/usr/bin/env node
/**
 * Ingest Dallas City Trails (ArcGIS FeatureServer) into canonical InstantDB entities.
 * Writes into: trailSystems, trailSegments.
 *
 * Data source: City of Dallas GIS — ParkTrailsCombined
 *   Layer 2: CityTrails — 227 polyline features
 *   URL: https://services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services/ParkTrailsCombined/FeatureServer/2/query
 *
 * Uses @instantdb/admin (db.query / db.transact). Loads .env.local via shared loader.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init, id } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const ARCGIS_BASE =
  "https://services2.arcgis.com/rwnOSbfKSwyTBcwN/arcgis/rest/services/ParkTrailsCombined/FeatureServer/2/query";
const LIMIT = 1000;
const DELAY_MS = 200;
const BATCH_SIZE = 200;
const EXT_DATASET = "dallas_citytrails_arcgis";
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

// ── ArcGIS fetch ────────────────────────────────────────────────────────────

async function fetchArcGISPage(offset) {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    geometryType: "esriGeometryPolyline",
    outSR: "4326",
    f: "geojson",
    resultOffset: String(offset),
    resultRecordCount: String(LIMIT),
  });
  const url = `${ARCGIS_BASE}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ArcGIS ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
  const json = await res.json();
  const exceeded = json.exceededTransferLimit === true;
  const features =
    json.features?.map((f) => ({
      ...f.properties,
      the_geom: f.geometry,
    })) ?? [];
  return { features, exceeded };
}

async function fetchAllFeatures() {
  const allRecords = [];
  let offset = 0;
  for (;;) {
    const { features, exceeded } = await fetchArcGISPage(offset);
    if (features.length === 0) break;
    allRecords.push(...features);
    console.log(`  Fetched ${features.length} records (offset=${offset}, total=${allRecords.length})`);
    if (!exceeded && features.length < LIMIT) break;
    offset += features.length;
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  return allRecords;
}

// ── Geometry helpers ────────────────────────────────────────────────────────

function haversineDistMiles(lon1, lat1, lon2, lat2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineStringLengthMiles(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineDistMiles(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return total;
}

function splitMultiLineString(record) {
  const geom = record.the_geom;
  if (!geom) return [record];
  if (geom.type === "LineString") return [record];
  if (geom.type !== "MultiLineString") return [record];
  if (geom.coordinates.length <= 1) {
    return [
      {
        ...record,
        the_geom: { type: "LineString", coordinates: geom.coordinates[0] },
      },
    ];
  }
  return geom.coordinates.map((coords, idx) => ({
    ...record,
    the_geom: { type: "LineString", coordinates: coords },
    _splitIndex: idx,
    _splitTotal: geom.coordinates.length,
  }));
}

// ── Field mapping ───────────────────────────────────────────────────────────

// Dallas WIDTH values are strings like "6'", "8-12'", "10 ft", etc.
// trailSegments.width is typed as number in InstantDB — extract first numeric value (feet).
function parseWidthFt(v) {
  if (v == null || v === "") return undefined;
  const match = String(v).match(/(\d+(\.\d+)?)/);
  if (!match) return undefined;
  const n = parseFloat(match[1]);
  return Number.isNaN(n) ? undefined : n;
}

function recordToSegmentPayload(r, splitIdx) {
  const trailName = safeStr(r.NAME) || "Dallas Unknown Trail";
  const systemSlug = slugify(trailName) || "unknown";
  const extSystemRef = "sys:" + systemSlug;
  const extSegmentRef = splitIdx != null ? `${r.OBJECTID}-${splitIdx}` : String(r.OBJECTID);

  const lengthMiles = r.the_geom?.coordinates
    ? lineStringLengthMiles(r.the_geom.coordinates)
    : safeNum(r.LENGTH_mi_);

  return {
    extDataset: EXT_DATASET,
    extSegmentRef,
    systemRef: extSystemRef,
    systemSlug,
    name: trailName,
    city: "Dallas",
    state: "TX",
    county: "Dallas",
    feature: safeStr(r.TRAILS) || undefined,
    surface: safeStr(r.SURFACE) || undefined,
    lengthMiles,
    width: parseWidthFt(r.WIDTH),
    geometry: r.the_geom ?? undefined,
    raw: {
      objectid: r.OBJECTID,
      name: r.NAME,
      trails: r.TRAILS,
      surface: r.SURFACE,
      width: r.WIDTH,
      status: r.STATUS,
      length: r.LENGTH,
      length_mi: r.LENGTH_mi_,
      council_di: r.COUNCIL_DI,
      park_distr: r.PARK_DISTR,
      splitIndex: splitIdx ?? null,
    },
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const db = init({ appId, adminToken });
  console.log("Admin SDK initialized OK");

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

  // Fetch all CityTrails features
  console.log("--- Fetching Dallas CityTrails (Layer 2) ---");
  const rawFeatures = await fetchAllFeatures();
  console.log(`Raw records fetched: ${rawFeatures.length}`);

  // Log STATUS distribution for review
  const statusCounts = {};
  for (const r of rawFeatures) {
    const s = safeStr(r.STATUS) ?? "(blank)";
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  console.log("\nSTATUS field distribution:");
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`  "${status}": ${count}`);
  }

  // Filter to active/existing records only (non-planned, non-built)
  const INACTIVE_STATUS = new Set(["Planned", "Removed", "Proposed", "Future", "Programmed"]);
  const activeFeatures = rawFeatures.filter((r) => {
    const s = safeStr(r.STATUS);
    if (!s) return true; // include if blank
    return !INACTIVE_STATUS.has(s);
  });
  const filteredOut = rawFeatures.length - activeFeatures.length;
  if (filteredOut > 0) {
    console.log(`\nFiltered out ${filteredOut} inactive/planned records`);
  }
  console.log(`Active records: ${activeFeatures.length}`);

  // Split MultiLineStrings
  const splitFeatures = activeFeatures.flatMap(splitMultiLineString);
  console.log(`After MultiLineString split: ${splitFeatures.length} segments`);

  // Map to segment payloads
  const segmentPayloads = splitFeatures.map((r) => recordToSegmentPayload(r, r._splitIndex ?? null));

  if (segmentPayloads.length === 0) {
    console.log("No records to ingest.");
    return;
  }

  // Build system map
  const systemsByRef = new Map();
  for (const seg of segmentPayloads) {
    const ref = seg.systemRef;
    if (!systemsByRef.has(ref)) {
      systemsByRef.set(ref, {
        extDataset: EXT_DATASET,
        extSystemRef: ref,
        name: seg.name,
        slug: seg.systemSlug,
        city: "Dallas",
        state: "TX",
        county: "Dallas",
        raw: { dataset: EXT_DATASET },
      });
    }
  }

  console.log(`\nUnique systems: ${systemsByRef.size}`);

  // Load existing trailSystems for upsert
  const sysRes = await db.query({
    trailSystems: { $: { limit: INDEX_LIMIT } },
  });
  const existingSysByRef = new Map();
  for (const s of entityList(sysRes, "trailSystems")) {
    const sid = s.id ?? s._id;
    if (s.extSystemRef && sid) existingSysByRef.set(String(s.extSystemRef), sid);
  }

  // Load existing trailSegments for upsert
  const segRes = await db.query({
    trailSegments: { $: { limit: INDEX_LIMIT } },
  });
  const existingSegByRef = new Map();
  for (const s of entityList(segRes, "trailSegments")) {
    const sid = s.id ?? s._id;
    if (s.extSegmentRef && sid) existingSegByRef.set(String(s.extSegmentRef), sid);
  }

  // Upsert trailSystems
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
        skipReasons["missing_extSegmentRef"] = (skipReasons["missing_extSegmentRef"] || 0) + 1;
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
  console.log(`rawRecords:        ${rawFeatures.length}`);
  console.log(`activeRecords:     ${activeFeatures.length}`);
  console.log(`afterSplit:        ${segmentPayloads.length}`);
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
