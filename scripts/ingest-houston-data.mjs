#!/usr/bin/env node
/**
 * Ingest Houston Trails (HPB ArcGIS FeatureServer) into canonical InstantDB entities.
 * Writes into: trailSystems, trailSegments.
 *
 * Data source: Houston Parks Board — Trails & Greenways
 *   Layer 0: 9 Bayou Greenway Trails (Complete) — MultiLineString, must split
 *   Layer 2: 132 Other Trails — LineString/MultiLineString
 *
 * Uses @instantdb/admin (db.query / db.transact). Loads .env.local via shared loader.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init, id } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const ARCGIS_BASE_L0 =
  "https://services6.arcgis.com/Xv3JMHA0Kl8GN3tJ/arcgis/rest/services/HPB_Trails_Greenways/FeatureServer/0/query";
const ARCGIS_BASE_L2 =
  "https://services6.arcgis.com/Xv3JMHA0Kl8GN3tJ/arcgis/rest/services/HPB_Trails_Greenways/FeatureServer/2/query";
const LIMIT = 1000;
const DELAY_MS = 200;
const BATCH_SIZE = 200;
const EXT_DATASET = "houston_hpb_trails_greenways";
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

async function fetchArcGISPage(baseUrl, offset) {
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
  const url = `${baseUrl}?${params}`;
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

async function fetchAllFromLayer(baseUrl, label) {
  const allRecords = [];
  let offset = 0;
  for (;;) {
    const { features, exceeded } = await fetchArcGISPage(baseUrl, offset);
    if (features.length === 0) break;
    allRecords.push(...features);
    console.log(`  [${label}] Fetched ${features.length} records (offset=${offset}, total=${allRecords.length})`);
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

const SURFACE_MAP = {
  "paved trail": "Asphalt",
  "natural surface trail": "Natural Surface",
};

function l0RecordToSegmentPayload(r, splitIdx) {
  const trailName = safeStr(r.Trail_Name) || "Unknown";
  const rawType = safeStr(r.Type) || "";

  // Greens Bayou appears twice (paved + natural) — disambiguate with type suffix
  const isDuplicate = trailName === "Greens Bayou Greenway";
  const systemName = isDuplicate ? `${trailName} (${rawType})` : trailName;

  const systemSlug = slugify(systemName) || "unknown";
  const extSystemRef = "sys:" + systemSlug;
  const extSegmentRef = `L0-${r.OBJECTID}-${splitIdx ?? 0}`;

  const surface = SURFACE_MAP[rawType.toLowerCase()] || rawType || undefined;
  const lengthMiles = r.the_geom?.coordinates
    ? lineStringLengthMiles(r.the_geom.coordinates)
    : safeNum(r.Miles);

  return {
    extDataset: EXT_DATASET,
    extSegmentRef,
    systemRef: extSystemRef,
    systemSlug,
    name: trailName,
    city: "Houston",
    state: "TX",
    county: "Harris",
    feature: rawType || undefined,
    surface,
    lengthMiles,
    width: undefined,
    geometry: r.the_geom ?? undefined,
    raw: {
      objectid: r.OBJECTID,
      trail_name: r.Trail_Name,
      type: r.Type,
      bayou: r.Bayou,
      miles: r.Miles,
      long_name: r.Long_Name,
      layer: 0,
      splitIndex: splitIdx,
    },
  };
}

function l2RecordToSegmentPayload(r, splitIdx) {
  const rawName = safeStr(r.Name);
  const rawBayou = safeStr(r.Bayou);
  const systemName = rawName || (rawBayou ? rawBayou + " Trail" : "Houston Unknown Trail");
  const systemSlug = slugify(systemName) || "unknown";
  const extSystemRef = "sys:" + systemSlug;
  const extSegmentRef = splitIdx != null ? `L2-${r.OBJECTID}-${splitIdx}` : `L2-${r.OBJECTID}`;

  const lengthMiles = r.the_geom?.coordinates
    ? lineStringLengthMiles(r.the_geom.coordinates)
    : safeNum(r.Miles);

  return {
    extDataset: EXT_DATASET,
    extSegmentRef,
    systemRef: extSystemRef,
    systemSlug,
    name: rawName || undefined,
    city: "Houston",
    state: "TX",
    county: "Harris",
    feature: undefined,
    surface: undefined,
    lengthMiles,
    width: undefined,
    geometry: r.the_geom ?? undefined,
    raw: {
      objectid: r.OBJECTID,
      name: r.Name,
      bayou: r.Bayou,
      miles: r.Miles,
      notes_web: r.Notes_Web,
      layer: 2,
      splitIndex: splitIdx,
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

  // Fetch Layer 0 — Bayou Greenway Trails (Complete)
  console.log("--- Fetching Layer 0 (Bayou Greenway Trails) ---");
  const l0Raw = await fetchAllFromLayer(ARCGIS_BASE_L0, "L0");
  console.log(`Layer 0 raw records: ${l0Raw.length}`);

  // Split MultiLineStrings into individual segments
  const l0Split = l0Raw.flatMap(splitMultiLineString);
  console.log(`Layer 0 after split: ${l0Split.length} segments`);

  // Fetch Layer 2 — Other Trails
  console.log("\n--- Fetching Layer 2 (Other Trails) ---");
  const l2Raw = await fetchAllFromLayer(ARCGIS_BASE_L2, "L2");
  console.log(`Layer 2 raw records: ${l2Raw.length}`);

  // Split any MultiLineStrings in Layer 2 as well
  const l2Split = l2Raw.flatMap(splitMultiLineString);
  console.log(`Layer 2 after split: ${l2Split.length} segments`);

  // Map to segment payloads
  const l0Payloads = l0Split.map((r) => l0RecordToSegmentPayload(r, r._splitIndex));
  const l2Payloads = l2Split.map((r) => l2RecordToSegmentPayload(r, r._splitIndex));
  const segmentPayloads = [...l0Payloads, ...l2Payloads];

  const totalFetched = l0Raw.length + l2Raw.length;
  console.log(`\nTotal raw records fetched: ${totalFetched}`);
  console.log(`Total segment payloads (after split): ${segmentPayloads.length}`);

  if (segmentPayloads.length === 0) {
    console.log("No records to ingest.");
    return;
  }

  // Log unnamed segments for review
  const unnamed = l2Payloads.filter((p) => !p.name);
  if (unnamed.length > 0) {
    console.log(`\nWARNING: ${unnamed.length} unnamed L2 segments grouped by bayou:`);
    const bySystem = {};
    for (const u of unnamed) {
      bySystem[u.systemRef] = (bySystem[u.systemRef] || 0) + 1;
    }
    for (const [ref, count] of Object.entries(bySystem)) {
      console.log(`  ${ref}: ${count} segments`);
    }
  }

  // Build system map
  const systemsByRef = new Map();
  for (const seg of segmentPayloads) {
    const ref = seg.systemRef;
    if (!systemsByRef.has(ref)) {
      const displayName =
        seg.name || seg.systemSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      systemsByRef.set(ref, {
        extDataset: EXT_DATASET,
        extSystemRef: ref,
        name: displayName,
        slug: seg.systemSlug,
        city: "Houston",
        state: "TX",
        county: "Harris",
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
  console.log(`layer0RawRecords:  ${l0Raw.length}`);
  console.log(`layer2RawRecords:  ${l2Raw.length}`);
  console.log(`totalAfterSplit:   ${segmentPayloads.length}`);
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
