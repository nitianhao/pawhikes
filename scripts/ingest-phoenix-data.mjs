#!/usr/bin/env node
/**
 * Ingest Phoenix, AZ trail data into canonical InstantDB entities.
 * Writes into: trailSystems, trailSegments.
 *
 * Phase 1a — Phoenix WalkPHX (ArcGIS MapServer layer 11):
 *   66 urban park walking path segments; system name = PROPERTY_NAME (park name)
 *   extDataset: "phoenix_arcgis_trails"
 *
 * Phase 1b — Maricopa County Parks (ArcGIS MapServer, 3 layers):
 *   Layer 4 (~590 records), Layer 8 (44 records), Layer 12 (228 records)
 *   system name = ParkName || TrailName
 *   extDataset: "phoenix_arcgis_trails" (shared with Phase 1a)
 *
 * Phase 2 — Overpass OSM (fills gaps — skips slugs already from Phase 1):
 *   BBox: 33.20,-112.55,33.90,-111.60
 *   extDataset: "phoenix_osm"
 *
 * Uses @instantdb/admin (db.query / db.transact). Loads .env.local via shared loader.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init, id } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Phoenix WalkPHX — ArcGIS MapServer layer 11
const ARCGIS_PHOENIX_WALKPHX =
  "https://maps.phoenix.gov/pub/rest/services/Public/ParksOpenData/MapServer/11/query";

// Maricopa County Parks — ArcGIS MapServer layers 4, 8, 12
const ARCGIS_MARICOPA_L4 =
  "https://gis.maricopa.gov/arcgis/rest/services/PNR/ParkAndTrail/MapServer/4/query";
const ARCGIS_MARICOPA_L8 =
  "https://gis.maricopa.gov/arcgis/rest/services/PNR/ParkAndTrail/MapServer/8/query";
const ARCGIS_MARICOPA_L12 =
  "https://gis.maricopa.gov/arcgis/rest/services/PNR/ParkAndTrail/MapServer/12/query";

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];
const PHOENIX_BBOX = "33.20,-112.55,33.90,-111.60";

const EXT_DATASET_ARCGIS = "phoenix_arcgis_trails";
const EXT_DATASET_OSM = "phoenix_osm";
const LIMIT = 1000;
const DELAY_MS = 200;
const BATCH_SIZE = 200;
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
console.log("extDataset (arcgis):", EXT_DATASET_ARCGIS);
console.log("extDataset (osm):", EXT_DATASET_OSM);
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

// ── ArcGIS fetch ─────────────────────────────────────────────────────────────

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

// ── Geometry helpers ──────────────────────────────────────────────────────────

function haversineDistMiles(lon1, lat1, lon2, lat2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
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

function osmWayToLineString(way) {
  if (!way.geometry || way.geometry.length < 2) return null;
  const coords = way.geometry.map((pt) => [pt.lon, pt.lat]);
  return { type: "LineString", coordinates: coords };
}

// ── Field mapping — Phase 1a (Phoenix WalkPHX) ───────────────────────────────

function walkphxRecordToSegmentPayload(r, splitIdx) {
  const parkName = safeStr(r.PROPERTY_NAME);
  const systemName = parkName || "Phoenix Unknown Trail";
  const systemSlug = slugify(systemName) || "unknown";
  const extSystemRef = "sys:" + systemSlug;
  const extSegmentRef = `arcgis-phx:${r.OBJECTID}` + (splitIdx != null ? `-${splitIdx}` : "");

  const lengthMiles = r.the_geom?.coordinates
    ? lineStringLengthMiles(r.the_geom.coordinates)
    : safeNum(r.LENGTH_MI);

  return {
    extDataset: EXT_DATASET_ARCGIS,
    extSegmentRef,
    systemRef: extSystemRef,
    systemSlug,
    name: parkName || undefined,
    city: "Phoenix",
    state: "AZ",
    county: "Maricopa",
    feature: undefined,
    surface: undefined,
    lengthMiles,
    width: undefined,
    geometry: r.the_geom ?? undefined,
    raw: {
      objectid: r.OBJECTID,
      property_name: r.PROPERTY_NAME,
      length_mi: r.LENGTH_MI,
      path_id: r.PATH_ID,
      trail_number: r.TRAIL_NUMBER,
      source: "phoenix_walkphx",
      splitIndex: splitIdx,
    },
  };
}

// ── Field mapping — Phase 1b (Maricopa County, layers 4/8/12) ─────────────────

function maricopaRecordToSegmentPayload(r, layerNum, splitIdx) {
  const parkName = safeStr(r.ParkName);
  const trailName = safeStr(r.TrailName);

  // system name = ParkName if present, else TrailName
  const systemName = parkName || trailName || "Maricopa Unknown Trail";
  const systemSlug = slugify(systemName) || "unknown";
  const extSystemRef = "sys:" + systemSlug;

  // segment ref includes layer number to avoid collisions across layers
  const baseRef = `arcgis-mco:L${layerNum}-${r.OBJECTID}`;
  const extSegmentRef = splitIdx != null ? `${baseRef}-${splitIdx}` : baseRef;

  const lengthMiles = r.the_geom?.coordinates
    ? lineStringLengthMiles(r.the_geom.coordinates)
    : safeNum(r.Length_Mile);

  return {
    extDataset: EXT_DATASET_ARCGIS,
    extSegmentRef,
    systemRef: extSystemRef,
    systemSlug,
    name: trailName || parkName || undefined,
    city: "Phoenix",
    state: "AZ",
    county: "Maricopa",
    feature: safeStr(r.TrailType) || undefined,
    surface: undefined,
    lengthMiles,
    width: undefined,
    geometry: r.the_geom ?? undefined,
    raw: {
      objectid: r.OBJECTID,
      trail_name: r.TrailName,
      park_name: r.ParkName,
      length_mile: r.Length_Mile,
      trail_type: r.TrailType,
      trail_use: r.TrailUse,
      trail_rating: r.TrailRating,
      layer: layerNum,
      splitIndex: splitIdx,
    },
  };
}

// ── Name normalization — Phase 2 (OSM) ────────────────────────────────────────

const NORMALIZE_NAMES = new Map([
  ["south mountain trail", "South Mountain Park Trails"],
  ["south mountain park trail", "South Mountain Park Trails"],
  ["echo canyon trail", "Camelback Mountain - Echo Canyon Trail"],
  ["echo canyon recreation area trail", "Camelback Mountain - Echo Canyon Trail"],
  ["camelback mountain trail", "Camelback Mountain - Echo Canyon Trail"],
  ["cholla trail", "Camelback Mountain - Cholla Trail"],
  ["piestewa peak trail", "Piestewa Peak Trail"],
  ["piestewa peak summit trail", "Piestewa Peak Trail"],
  ["north mountain trail", "North Mountain Trail"],
  ["north mountain park trail", "North Mountain Trail"],
  ["dreamy draw trail", "Dreamy Draw Trail"],
  ["dreamy draw bikeway", "Dreamy Draw Trail"],
  ["papago park trail", "Papago Park Trail"],
  ["shaw butte trail", "Shaw Butte Trail"],
  ["indian bend wash trail", "Indian Bend Wash Greenbelt"],
  ["indian bend wash path", "Indian Bend Wash Greenbelt"],
  ["indian bend wash bikeway", "Indian Bend Wash Greenbelt"],
  ["indian bend greenway", "Indian Bend Wash Greenbelt"],
  ["canal trail", "Arizona Canal Trail"],
  ["arizona canal trail", "Arizona Canal Trail"],
  ["crosscut canal trail", "Crosscut Canal Trail"],
  ["white tank mountain trail", "White Tank Mountain Regional Park"],
  ["estrella mountain trail", "Estrella Mountain Regional Park"],
  ["san tan mountain trail", "San Tan Mountain Regional Park"],
  ["usery mountain trail", "Usery Mountain Regional Park"],
  ["lake pleasant trail", "Lake Pleasant Regional Park"],
  ["mcdowell sonoran trail", "McDowell Sonoran Preserve"],
  ["gateway trail", "McDowell Sonoran Preserve"],
]);

const TRAIL_INDICATORS =
  /\b(trail|trails|greenway|greenways|path|hike|bikeway|corridor|preserve|wash|mountain)\b/i;
const STREET_SUFFIX =
  /\b(avenue|ave|street|st|boulevard|blvd|drive|dr|road|rd|lane|ln|place|pl|court|ct|parkway|pkwy|freeway|highway|hwy|expressway|loop|circle|terrace|way)\s*$/i;

function normalizeName(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (STREET_SUFFIX.test(trimmed) && !TRAIL_INDICATORS.test(trimmed)) return null;
  const normalized = NORMALIZE_NAMES.get(lower) ?? trimmed;
  if (!TRAIL_INDICATORS.test(normalized)) return null;
  return normalized;
}

// ── Overpass fetch ────────────────────────────────────────────────────────────

async function fetchOSMTrails() {
  const trailNameRegex = "trail|trails|greenway|greenways|hike|bikeway|corridor|preserve|mountain|wash";
  const query = [
    `[out:json][timeout:120];`,
    `(`,
    `  way["highway"~"^(footway|path|cycleway|track|bridleway)$"]["name"~"(${trailNameRegex})",i](${PHOENIX_BBOX});`,
    `);`,
    `out geom;`,
  ].join("\n");

  for (const mirror of OVERPASS_MIRRORS) {
    console.log(`Querying Overpass via ${mirror} ...`);
    try {
      const res = await fetch(mirror, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        console.warn(`  Mirror returned HTTP ${res.status}, trying next...`);
        continue;
      }
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) {
        console.warn(`  Mirror returned non-JSON response, trying next...`);
        continue;
      }
      const json = JSON.parse(text);
      return json.elements ?? [];
    } catch (err) {
      console.warn(`  Mirror failed: ${err.message}, trying next...`);
    }
  }
  throw new Error("All Overpass mirrors failed");
}

// ── Field mapping — Phase 2 (OSM) ────────────────────────────────────────────

function wayToSegmentPayload(way, phase1Slugs) {
  const rawName = way.tags?.name ?? "";
  const normalizedName = normalizeName(rawName);
  if (!normalizedName) return null;

  const systemSlug = slugify(normalizedName);
  if (!systemSlug) return null;

  // Skip systems already covered by Phase 1 ArcGIS data
  if (phase1Slugs.has(systemSlug)) return null;

  const extSystemRef = "sys:" + systemSlug;
  const extSegmentRef = "osm:" + String(way.id);

  const geometry = osmWayToLineString(way);
  if (!geometry) return null;

  const lengthMiles = lineStringLengthMiles(geometry.coordinates);

  return {
    extDataset: EXT_DATASET_OSM,
    extSegmentRef,
    systemRef: extSystemRef,
    systemSlug,
    name: normalizedName,
    city: "Phoenix",
    state: "AZ",
    county: "Maricopa",
    surface: way.tags?.surface ?? undefined,
    lengthMiles,
    geometry,
    raw: {
      osmId: way.id,
      name: rawName,
      highway: way.tags?.highway,
      surface: way.tags?.surface,
      access: way.tags?.access,
      foot: way.tags?.foot,
      lit: way.tags?.lit,
      width: way.tags?.width,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

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

  // Load existing DB records ONCE — used by both phases for idempotent upserts
  const sysRes = await db.query({ trailSystems: { $: { limit: INDEX_LIMIT } } });
  const existingSysByRef = new Map();
  for (const s of entityList(sysRes, "trailSystems")) {
    const sid = s.id ?? s._id;
    if (s.extSystemRef && sid) existingSysByRef.set(String(s.extSystemRef), sid);
  }

  const segRes = await db.query({ trailSegments: { $: { limit: INDEX_LIMIT } } });
  const existingSegByRef = new Map();
  for (const s of entityList(segRes, "trailSegments")) {
    const sid = s.id ?? s._id;
    if (s.extSegmentRef && sid) existingSegByRef.set(String(s.extSegmentRef), sid);
  }

  // ── Phase 1a: Phoenix WalkPHX ─────────────────────────────────────────────
  console.log("--- Phase 1a: Phoenix WalkPHX (ArcGIS MapServer layer 11) ---");
  let walkphxRaw = [];
  try {
    walkphxRaw = await fetchAllFromLayer(ARCGIS_PHOENIX_WALKPHX, "WalkPHX");
    if (walkphxRaw.length === 0) {
      console.warn("  WARNING: WalkPHX returned 0 records — Overpass will fill this gap.");
    }
  } catch (err) {
    console.warn(`  WARNING: WalkPHX fetch failed (${err.message}) — skipping, Overpass will fill gap.`);
  }
  console.log(`WalkPHX raw records: ${walkphxRaw.length}`);

  const walkphxSplit = walkphxRaw.flatMap(splitMultiLineString);
  console.log(`WalkPHX after split: ${walkphxSplit.length} segments`);
  const walkphxPayloads = walkphxSplit.map((r) => walkphxRecordToSegmentPayload(r, r._splitIndex));

  // ── Phase 1b: Maricopa County Parks ──────────────────────────────────────
  console.log("\n--- Phase 1b: Maricopa County Parks (ArcGIS MapServer layers 4/8/12) ---");

  let maricopaL4Raw = [];
  try {
    maricopaL4Raw = await fetchAllFromLayer(ARCGIS_MARICOPA_L4, "Maricopa-L4");
    if (maricopaL4Raw.length === 0) {
      console.warn("  WARNING: Maricopa Layer 4 returned 0 records.");
    }
  } catch (err) {
    console.warn(`  WARNING: Maricopa Layer 4 fetch failed (${err.message}) — skipping.`);
  }

  let maricopaL8Raw = [];
  try {
    maricopaL8Raw = await fetchAllFromLayer(ARCGIS_MARICOPA_L8, "Maricopa-L8");
    if (maricopaL8Raw.length === 0) {
      console.warn("  WARNING: Maricopa Layer 8 returned 0 records.");
    }
  } catch (err) {
    console.warn(`  WARNING: Maricopa Layer 8 fetch failed (${err.message}) — skipping.`);
  }

  let maricopaL12Raw = [];
  try {
    maricopaL12Raw = await fetchAllFromLayer(ARCGIS_MARICOPA_L12, "Maricopa-L12");
    if (maricopaL12Raw.length === 0) {
      console.warn("  WARNING: Maricopa Layer 12 returned 0 records.");
    }
  } catch (err) {
    console.warn(`  WARNING: Maricopa Layer 12 fetch failed (${err.message}) — skipping.`);
  }

  const maricopaL4Split = maricopaL4Raw.flatMap(splitMultiLineString);
  const maricopaL8Split = maricopaL8Raw.flatMap(splitMultiLineString);
  const maricopaL12Split = maricopaL12Raw.flatMap(splitMultiLineString);

  const maricopaL4Payloads = maricopaL4Split.map((r) => maricopaRecordToSegmentPayload(r, 4, r._splitIndex));
  const maricopaL8Payloads = maricopaL8Split.map((r) => maricopaRecordToSegmentPayload(r, 8, r._splitIndex));
  const maricopaL12Payloads = maricopaL12Split.map((r) => maricopaRecordToSegmentPayload(r, 12, r._splitIndex));

  const phase1Payloads = [
    ...walkphxPayloads,
    ...maricopaL4Payloads,
    ...maricopaL8Payloads,
    ...maricopaL12Payloads,
  ];

  const arcgisTotalSegments = phase1Payloads.length;
  console.log(`\nPhase 1 ArcGIS total segments: ${arcgisTotalSegments}`);

  // Build the set of slugs already covered by Phase 1 (used to skip dupes in Phase 2)
  const phase1Slugs = new Set(phase1Payloads.map((p) => p.systemSlug).filter(Boolean));
  console.log(`Phase 1 unique system slugs: ${phase1Slugs.size}`);

  // ── Phase 2: Overpass OSM ─────────────────────────────────────────────────
  console.log("\n--- Phase 2: OpenStreetMap via Overpass ---");
  const osmWays = await fetchOSMTrails();
  console.log(`OSM ways fetched: ${osmWays.length}`);

  let osmSkippedDedup = 0;
  const osmPayloads = osmWays
    .map((way) => {
      const rawName = way.tags?.name ?? "";
      const normalizedName = normalizeName(rawName);
      if (!normalizedName) return null;
      const systemSlug = slugify(normalizedName);
      if (!systemSlug) return null;
      if (phase1Slugs.has(systemSlug)) {
        osmSkippedDedup++;
        return null;
      }
      return wayToSegmentPayload(way, phase1Slugs);
    })
    .filter(Boolean);

  const osmSkippedOther = osmWays.length - osmSkippedDedup - osmPayloads.length;
  console.log(`OSM segment payloads: ${osmPayloads.length}`);
  console.log(`OSM skipped (dedup with Phase 1): ${osmSkippedDedup}`);
  console.log(`OSM skipped (no name / filtered): ${osmSkippedOther}`);

  // Log OSM name distribution
  const osmNameCounts = {};
  for (const seg of osmPayloads) {
    osmNameCounts[seg.name] = (osmNameCounts[seg.name] || 0) + 1;
  }
  const sortedOsmNames = Object.entries(osmNameCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\nUnique OSM trail names (Phase 2): ${sortedOsmNames.length}`);
  console.log("Top 30:");
  for (const [name, cnt] of sortedOsmNames.slice(0, 30)) {
    console.log(`  ${String(cnt).padStart(3)}x  ${name}`);
  }

  // ── Combine all payloads ──────────────────────────────────────────────────
  const allSegmentPayloads = [...phase1Payloads, ...osmPayloads];
  console.log(`\nTotal segment payloads (all phases): ${allSegmentPayloads.length}`);

  if (allSegmentPayloads.length === 0) {
    console.log("No records to ingest.");
    return;
  }

  // ── Build system map ──────────────────────────────────────────────────────
  const systemsByRef = new Map();
  for (const seg of allSegmentPayloads) {
    const ref = seg.systemRef;
    if (!systemsByRef.has(ref)) {
      const displayName =
        seg.name ||
        seg.systemSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      systemsByRef.set(ref, {
        extDataset: seg.extDataset,
        extSystemRef: ref,
        name: displayName,
        slug: seg.systemSlug,
        city: "Phoenix",
        state: "AZ",
        county: "Maricopa",
        raw: { dataset: seg.extDataset },
      });
    }
  }
  console.log(`\nUnique systems (all phases): ${systemsByRef.size}`);

  // ── Upsert trailSystems ───────────────────────────────────────────────────
  console.log("\n--- Upserting trailSystems ---");
  let systemsUpserted = 0;
  for (const [ref, payload] of systemsByRef) {
    const existingId = existingSysByRef.get(ref);
    const internalId = existingId ?? id();
    await db.transact([db.tx.trailSystems[internalId].update(payload)]);
    systemsUpserted++;
  }
  console.log(`Systems upserted: ${systemsUpserted}`);

  await new Promise((r) => setTimeout(r, DELAY_MS));

  // ── Upsert trailSegments in batches ───────────────────────────────────────
  console.log("\n--- Upserting trailSegments ---");
  let segmentsUpserted = 0;
  let skipped = 0;
  const skipReasons = {};

  for (let i = 0; i < allSegmentPayloads.length; i += BATCH_SIZE) {
    const chunk = allSegmentPayloads.slice(i, i + BATCH_SIZE);
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
    const done = Math.min(i + BATCH_SIZE, allSegmentPayloads.length);
    console.log(`  Segments upserted ${done}/${allSegmentPayloads.length}...`);
    if (i + BATCH_SIZE < allSegmentPayloads.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log("\n=== INGEST SUMMARY ===");
  console.log(`phase1-phoenix-walkphx:    ${walkphxRaw.length} records (${walkphxSplit.length} segments after split)`);
  console.log(`phase1-maricopa-L4:        ${maricopaL4Raw.length} records`);
  console.log(`phase1-maricopa-L8:        ${maricopaL8Raw.length} records`);
  console.log(`phase1-maricopa-L12:       ${maricopaL12Raw.length} records`);
  console.log(`phase1-arcgis-total:       ${arcgisTotalSegments} segments`);
  console.log(`phase2-osm-ways-fetched:   ${osmWays.length}`);
  console.log(`phase2-osm-skipped-dedup:  ${osmSkippedDedup}`);
  console.log(`phase2-osm-segments:       ${osmPayloads.length}`);
  console.log(`systemsUpserted:           ${systemsUpserted}`);
  console.log(`segmentsUpserted:          ${segmentsUpserted}`);
  console.log(`skipped:                   ${skipped}`);
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
