#!/usr/bin/env node
/**
 * Ingest Sierra Vista, AZ trail segments from OpenStreetMap via Overpass API.
 * Writes into: trailSystems, trailSegments.
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
// Sierra Vista, AZ bbox: S,W,N,E — covers San Pedro River trail, Huachuca Mountains
const CITY_BBOX = "31.45,-110.40,31.65,-110.20";
const CITY_NAME = "Sierra Vista";
const CITY_STATE = "AZ";
const CITY_COUNTY = "Cochise";
const EXT_DATASET = "sierra_vista_osm";
const INDEX_LIMIT = 5000;
const BATCH_SIZE = 200;
const DELAY_MS = 300;

loadEnvLocal(root);

const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;
const appId = process.env.INSTANT_APP_ID;

if (!appId) { console.error("Error: INSTANT_APP_ID must be set in .env.local"); process.exit(1); }
if (!adminToken) { console.error("Error: INSTANT_ADMIN_TOKEN must be set in .env.local"); process.exit(1); }

function maskToken(t) {
  if (t == null || typeof t !== "string" || t.length < 10) return t ? "***" : "(none)";
  return t.slice(0, 6) + "..." + t.slice(-4);
}

console.log("=== INSTANT CONFIG ===");
console.log("appId:", appId);
console.log("adminToken:", maskToken(adminToken));
console.log("extDataset:", EXT_DATASET);
console.log("======================");

function entityList(res, entityName) {
  return res?.[entityName] ?? res?.data?.[entityName] ?? [];
}

function slugify(s) {
  if (s == null || typeof s !== "string") return "";
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const TRAIL_INDICATORS = /\b(trail|trails|greenway|greenways|path|hike|bikeway|corridor|lake|creek|river|mountain|park|loop|canyon|ridge|pedro|huachuca)\b/i;
const STREET_SUFFIX = /\b(avenue|ave|street|st|boulevard|blvd|drive|dr|road|rd|lane|ln|place|pl|court|ct|parkway|pkwy|freeway|highway|hwy|expressway|loop|circle|terrace|way)\s*$/i;

const NORMALIZE_NAMES = new Map([
  ["san pedro river trail", "San Pedro River Trail"],
  ["huachuca mountains trail", "Huachuca Mountains Trail"],
]);

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

async function fetchOSMTrails() {
  const trailNameRegex = "trail|trails|greenway|greenways|hike|bikeway|corridor|lake|creek|river|mountain|park|loop|canyon|ridge|pedro|huachuca";
  const query = [
    `[out:json][timeout:120];`,
    `(`,
    `  way["highway"~"^(footway|path|cycleway|track|bridleway)$"]["name"~"(${trailNameRegex})",i](${CITY_BBOX});`,
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
      if (!res.ok) { console.warn(`  Mirror returned HTTP ${res.status}, trying next...`); continue; }
      const text = await res.text();
      if (!text.trimStart().startsWith("{")) { console.warn(`  Mirror returned non-JSON, trying next...`); continue; }
      const json = JSON.parse(text);
      return json.elements ?? [];
    } catch (err) {
      console.warn(`  Mirror failed: ${err.message}, trying next...`);
    }
  }
  throw new Error("All Overpass mirrors failed");
}

function osmWayToLineString(way) {
  if (!way.geometry || way.geometry.length < 2) return null;
  return { type: "LineString", coordinates: way.geometry.map((pt) => [pt.lon, pt.lat]) };
}

function haversineDistMiles(lon1, lat1, lon2, lat2) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lineStringLengthMiles(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineDistMiles(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
  return total;
}

function wayToSegmentPayload(way) {
  const rawName = way.tags?.name ?? "";
  const normalizedName = normalizeName(rawName);
  if (!normalizedName) return null;
  const systemSlug = slugify(normalizedName);
  if (!systemSlug) return null;
  const geometry = osmWayToLineString(way);
  if (!geometry) return null;
  return {
    extDataset: EXT_DATASET,
    extSegmentRef: "osm:" + String(way.id),
    systemRef: "sys:" + systemSlug,
    systemSlug,
    name: normalizedName,
    city: CITY_NAME,
    state: CITY_STATE,
    county: CITY_COUNTY,
    surface: way.tags?.surface ?? undefined,
    lengthMiles: lineStringLengthMiles(geometry.coordinates),
    geometry,
    raw: { osmId: way.id, name: rawName, highway: way.tags?.highway, surface: way.tags?.surface, access: way.tags?.access, foot: way.tags?.foot, lit: way.tags?.lit },
  };
}

async function main() {
  const db = init({ appId, adminToken });
  console.log("Admin SDK initialized OK");

  console.log(`\n--- Fetching ${CITY_NAME} trails from OpenStreetMap (Overpass) ---`);
  const osmWays = await fetchOSMTrails();
  console.log(`OSM ways fetched: ${osmWays.length}`);

  const segmentPayloads = osmWays.map(wayToSegmentPayload).filter(Boolean);
  console.log(`Segment payloads: ${segmentPayloads.length} (${osmWays.length - segmentPayloads.length} skipped)`);

  const nameCounts = {};
  for (const seg of segmentPayloads) nameCounts[seg.name] = (nameCounts[seg.name] || 0) + 1;
  const sortedNames = Object.entries(nameCounts).sort((a, b) => b[1] - a[1]);
  console.log(`\nUnique trail names: ${sortedNames.length}`);
  for (const [name, cnt] of sortedNames.slice(0, 20)) console.log(`  ${String(cnt).padStart(3)}x  ${name}`);

  if (segmentPayloads.length === 0) { console.log("No records to ingest."); return; }

  const systemsByRef = new Map();
  for (const seg of segmentPayloads) {
    if (!systemsByRef.has(seg.systemRef)) {
      systemsByRef.set(seg.systemRef, {
        extDataset: EXT_DATASET, extSystemRef: seg.systemRef,
        name: seg.name, slug: seg.systemSlug,
        city: CITY_NAME, state: CITY_STATE, county: CITY_COUNTY,
        raw: { dataset: EXT_DATASET },
      });
    }
  }
  console.log(`\nUnique systems: ${systemsByRef.size}`);

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

  console.log("\n--- Upserting trailSystems ---");
  let systemsUpserted = 0;
  for (const [ref, payload] of systemsByRef) {
    const internalId = existingSysByRef.get(ref) ?? id();
    await db.transact([db.tx.trailSystems[internalId].update(payload)]);
    systemsUpserted++;
  }
  console.log(`Systems upserted: ${systemsUpserted}`);
  await new Promise((r) => setTimeout(r, DELAY_MS));

  console.log("\n--- Upserting trailSegments ---");
  let segmentsUpserted = 0, skipped = 0;
  for (let i = 0; i < segmentPayloads.length; i += BATCH_SIZE) {
    const chunk = segmentPayloads.slice(i, i + BATCH_SIZE);
    const steps = [];
    for (const seg of chunk) {
      if (!seg.extSegmentRef) { skipped++; continue; }
      const internalId = existingSegByRef.get(seg.extSegmentRef) ?? id();
      steps.push(db.tx.trailSegments[internalId].update(seg));
      segmentsUpserted++;
    }
    if (steps.length) await db.transact(steps);
    console.log(`  Segments upserted ${Math.min(i + BATCH_SIZE, segmentPayloads.length)}/${segmentPayloads.length}...`);
    if (i + BATCH_SIZE < segmentPayloads.length) await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  console.log("\n=== INGEST SUMMARY ===");
  console.log(`extDataset:        ${EXT_DATASET}`);
  console.log(`osmWaysFetched:    ${osmWays.length}`);
  console.log(`systemsUpserted:   ${systemsUpserted}`);
  console.log(`segmentsUpserted:  ${segmentsUpserted}`);
  console.log(`skipped:           ${skipped}`);
  console.log("======================");
}

main().catch((err) => { console.error(err); process.exit(1); });
