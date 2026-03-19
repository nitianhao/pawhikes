#!/usr/bin/env node
/**
 * Ingest Oklahoma City trail segments from OpenStreetMap via Overpass API.
 * Writes into: trailSystems, trailSegments.
 *
 * Data source: OpenStreetMap via Overpass API
 *   Query: named footway/path/cycleway/track/bridleway ways in OKC metro bbox
 *
 * Uses @instantdb/admin (db.query / db.transact). Loads .env.local via shared loader.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init, id } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];
// OKC metro bounding box: S,W,N,E — covers Lake Hefner, Lake Overholser, Lake Draper,
// Oklahoma River, Will Rogers Trail, and Edmond (Mitch Park area)
const OKC_BBOX = "35.30,-97.80,35.75,-97.20";
const EXT_DATASET = "okc_osm";
const INDEX_LIMIT = 5000;
const BATCH_SIZE = 200;
const DELAY_MS = 300;

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

// ── Name normalization ────────────────────────────────────────────────────────

// OSM has inconsistent naming for the same trail system. Normalize to canonical names.
const NORMALIZE_NAMES = new Map([
  // Lake Hefner
  ["lake hefner hike and bike trail", "Lake Hefner Trail"],
  ["lake hefner hike & bike trail", "Lake Hefner Trail"],
  ["hefner trail", "Lake Hefner Trail"],
  // Lake Overholser
  ["lake overholser trail", "Lake Overholser East Trail"],
  ["overholser east trail", "Lake Overholser East Trail"],
  // Oklahoma River Trail — merge north/south branches into one system
  ["okc river trail", "Oklahoma River Trail"],
  ["oklahoma river trail north", "Oklahoma River Trail"],
  ["oklahoma river trail south", "Oklahoma River Trail"],
  ["oklahoma river trail - north", "Oklahoma River Trail"],
  ["oklahoma river trail - south", "Oklahoma River Trail"],
  ["west river trail", "Oklahoma River Trail"],
  // Bert Cooper Trail — merge variant names
  ["bert cooper trail", "Bert Cooper Trail"],
  ["bert cooper trails", "Bert Cooper Trail"],
  ["bert cooper trails (lake hefner trails)", "Bert Cooper Trail"],
  ["lake hefner - bert cooper trail", "Bert Cooper Trail"],
  // Lake Draper
  ["lake draper trail", "Lake Draper Trail"],
  ["stanley draper trail", "Lake Draper Trail"],
  ["lake stanley draper trail", "Lake Draper Trail"],
  // KATY Trail
  ["katy trail oklahoma city", "KATY Trail"],
  // South Grand Trail
  ["south grand trail", "South Grand Trail"],
  ["south grand boulevard trail", "South Grand Trail"],
  // Lake Hefner-Grand Boulevard Trail — merge punctuation variants
  ["lake hefner/grand boulevard trail", "Lake Hefner-Grand Boulevard Trail"],
  // Tinker/Draper
  ["tinker-draper trail", "Tinker-Draper Trail"],
  ["tinker draper trail", "Tinker-Draper Trail"],
]);

// Only include ways whose names look like trail systems, not streets.
// OSM tags named bicycle/pedestrian infrastructure alongside roads with the street name —
// this filter drops those (e.g. "South Broadway", "Northwest 23rd Street").
const TRAIL_INDICATORS = /\b(trail|trails|greenway|greenways|path|hike|bikeway|corridor)\b/i;

// Common street suffixes: if name ends with one of these, it's a road — skip it.
const STREET_SUFFIX = /\b(avenue|ave|street|st|boulevard|blvd|drive|dr|road|rd|lane|ln|place|pl|court|ct|parkway|pkwy|freeway|highway|hwy|expressway|loop|circle|terrace|way)\s*$/i;

function normalizeName(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  // Drop pure street names
  if (STREET_SUFFIX.test(trimmed) && !TRAIL_INDICATORS.test(trimmed)) return null;
  // Must contain a trail indicator word (or be in the explicit normalize map)
  const normalized = NORMALIZE_NAMES.get(lower) ?? trimmed;
  if (!TRAIL_INDICATORS.test(normalized)) return null;
  return normalized;
}

// ── Overpass fetch ────────────────────────────────────────────────────────────

async function fetchOSMTrails() {
  // Name regex filters to only trail-like ways at the Overpass layer,
  // reducing result size from ~6000 to ~100 and preventing server timeouts.
  const trailNameRegex = "trail|trails|greenway|greenways|hike|bikeway|corridor";
  const query = [
    `[out:json][timeout:120];`,
    `(`,
    `  way["highway"~"^(footway|path|cycleway|track|bridleway)$"]["name"~"(${trailNameRegex})",i](${OKC_BBOX});`,
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

// ── Geometry helpers ──────────────────────────────────────────────────────────

function osmWayToLineString(way) {
  if (!way.geometry || way.geometry.length < 2) return null;
  const coords = way.geometry.map((pt) => [pt.lon, pt.lat]);
  return { type: "LineString", coordinates: coords };
}

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

// ── Field mapping ─────────────────────────────────────────────────────────────

function wayToSegmentPayload(way) {
  const rawName = way.tags?.name ?? "";
  const normalizedName = normalizeName(rawName);
  if (!normalizedName) return null;

  const systemSlug = slugify(normalizedName);
  if (!systemSlug) return null;

  const extSystemRef = "sys:" + systemSlug;
  const extSegmentRef = "osm:" + String(way.id);

  const geometry = osmWayToLineString(way);
  if (!geometry) return null;

  const lengthMiles = lineStringLengthMiles(geometry.coordinates);

  return {
    extDataset: EXT_DATASET,
    extSegmentRef,
    systemRef: extSystemRef,
    systemSlug,
    name: normalizedName,
    city: "Oklahoma City",
    state: "OK",
    county: "Oklahoma",
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

  // Fetch OSM ways from Overpass
  console.log("--- Fetching Oklahoma City trails from OpenStreetMap (Overpass) ---");
  const osmWays = await fetchOSMTrails();
  console.log(`OSM ways fetched: ${osmWays.length}`);

  // Map to segment payloads
  const segmentPayloads = osmWays.map(wayToSegmentPayload).filter(Boolean);
  const skippedNames = osmWays.length - segmentPayloads.length;
  console.log(`Segment payloads: ${segmentPayloads.length} (${skippedNames} skipped — no name/filtered)`);

  // Log name distribution
  const nameCounts = {};
  for (const seg of segmentPayloads) {
    nameCounts[seg.name] = (nameCounts[seg.name] || 0) + 1;
  }
  const sortedNames = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\nUnique trail names: ${sortedNames.length}`);
  console.log("Top 30:");
  for (const [name, cnt] of sortedNames.slice(0, 30)) {
    console.log(`  ${String(cnt).padStart(3)}x  ${name}`);
  }

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
        city: "Oklahoma City",
        state: "OK",
        county: "Oklahoma",
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

  // Upsert trailSegments in batches
  console.log("\n--- Upserting trailSegments ---");
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
    if (i + BATCH_SIZE < segmentPayloads.length) {
      await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  }

  console.log("\n=== INGEST SUMMARY ===");
  console.log(`extDataset:        ${EXT_DATASET}`);
  console.log(`osmWaysFetched:    ${osmWays.length}`);
  console.log(`segmentPayloads:   ${segmentPayloads.length}`);
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
