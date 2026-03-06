#!/usr/bin/env node
/**
 * DRY RUN: Fetch dog drinking water candidates from OSM near one trail system.
 * No DB writes. Prints JSON summary to stdout.
 *
 * Example commands:
 *   npm run enrich:dogwater:osm -- --slug mueller-trail
 *   npm run enrich:dogwater:osm -- --systemId <uuid>
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";
import { init } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnvLocal(root);

const OVERPASS_ENDPOINTS = process.env.OVERPASS_ENDPOINT
  ? [process.env.OVERPASS_ENDPOINT]
  : [
      "https://overpass.kumi.systems/api/interpreter",
      "https://overpass-api.de/api/interpreter",
    ];
const BBOX_BUFFER_DEG = 150 / 111000; // ~150 m in degrees (approx)

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}

function entityList(res, name) {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

function extractLines(geom) {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString") return [geom.coordinates];
  if (geom.type === "MultiLineString") return geom.coordinates;
  return [];
}

function bboxFromLines(lines, bufferDeg = BBOX_BUFFER_DEG) {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const line of lines) {
    for (const pt of line) {
      const [lon, lat] = Array.isArray(pt) ? pt : [pt?.lon ?? pt?.[0], pt?.lat ?? pt?.[1]];
      if (typeof lon !== "number" || typeof lat !== "number") continue;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (minLon === Infinity) return null;
  return {
    minLat: minLat - bufferDeg,
    minLon: minLon - bufferDeg,
    maxLat: maxLat + bufferDeg,
    maxLon: maxLon + bufferDeg,
  };
}

function bboxToOverpass(bbox) {
  return `${bbox.minLat},${bbox.minLon},${bbox.maxLat},${bbox.maxLon}`;
}

function buildOverpassQuery(bbox) {
  const b = bboxToOverpass(bbox);
  return `[out:json][timeout:60];
(
  node["amenity"="drinking_water"](${b});
  way["amenity"="drinking_water"](${b});
  relation["amenity"="drinking_water"](${b});
  node["amenity"="watering_place"](${b});
  way["amenity"="watering_place"](${b});
  relation["amenity"="watering_place"](${b});
  node["man_made"="water_well"](${b});
  way["man_made"="water_well"](${b});
  relation["man_made"="water_well"](${b});
  node["amenity"="fountain"](${b});
  way["amenity"="fountain"](${b});
  relation["amenity"="fountain"](${b});
);
out geom tags;`;
}

async function overpassPost(query) {
  const body = `data=${encodeURIComponent(query)}`;
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(90_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("json")) {
        const text = await res.text();
        const preview = text.slice(0, 80).replace(/\s+/g, " ");
        throw new Error(`Response not JSON. Preview: ${preview}`);
      }
      const data = await res.json();
      if (data.elements == null) throw new Error("Overpass response missing elements");
      return data.elements;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw new Error(`Overpass request failed: ${lastErr?.message ?? lastErr}`);
}

function kindFromTags(tags) {
  if (!tags) return "unknown";
  if (tags.amenity === "drinking_water") return "drinking_water";
  if (tags.amenity === "watering_place") return "watering_place";
  if (tags.amenity === "fountain") return "fountain";
  if (tags.man_made === "water_well") return "water_well";
  return "unknown";
}

function dogSignalFromTags(tags) {
  const t = tags || {};
  const notes = [];
  const dogVal = t.dog;
  const isExplicit =
    dogVal === "yes" ||
    dogVal === "designated" ||
    dogVal === "permissive" ||
    (typeof dogVal === "string" && dogVal.length > 0);
  if (isExplicit) notes.push(`tag dog=${dogVal}`);
  else notes.push("no explicit dog tag");
  return { isExplicitDogWater: isExplicit, notes };
}

function centroidFromGeometry(el) {
  if (el.type === "node" && el.lat != null && el.lon != null) {
    return { lat: el.lat, lon: el.lon };
  }
  const nodes = el.geometry || (el.members && el.members.flatMap((m) => m.geometry || [])) || [];
  if (!nodes.length) return null;
  let sumLat = 0,
    sumLon = 0;
  for (const n of nodes) {
    const lat = n.lat ?? n[1];
    const lon = n.lon ?? n[0];
    if (typeof lat === "number" && typeof lon === "number") {
      sumLat += lat;
      sumLon += lon;
    }
  }
  if (sumLat === 0 && sumLon === 0) return null;
  return { lat: sumLat / nodes.length, lon: sumLon / nodes.length };
}

function buildItem(el) {
  const tags = el.tags || {};
  const kind = kindFromTags(tags);
  const location = centroidFromGeometry(el);
  const dogSignal = dogSignalFromTags(tags);
  const item = {
    osmType: el.type,
    osmId: `${el.type}/${el.id}`,
    kind,
    name: tags.name ?? null,
    tags: { ...tags },
    location: location || undefined,
    dogSignal,
  };
  if (!location && (el.type === "way" || el.type === "relation")) {
    dogSignal.notes.push("no geometry for centroid");
  }
  return item;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const systemId = args.systemId;
  const slug = args.slug;

  if (!systemId && !slug) {
    console.error("Error: provide either --systemId <id> or --slug <slug>");
    process.exit(1);
  }
  if (systemId && slug) {
    console.error("Error: provide only one of --systemId or --slug");
    process.exit(1);
  }

  const appId = process.env.INSTANT_APP_ID || process.env.INSTANTDB_APP_ID;
  const adminToken =
    process.env.INSTANT_ADMIN_TOKEN ||
    process.env.INSTANT_APP_ADMIN_TOKEN ||
    process.env.INSTANTDB_ADMIN_TOKEN;
  if (!appId) {
    console.error("Error: set INSTANT_APP_ID or INSTANTDB_APP_ID in .env.local");
    process.exit(1);
  }
  if (!adminToken) {
    console.error("Error: set INSTANT_ADMIN_TOKEN or INSTANTDB_ADMIN_TOKEN in .env.local");
    process.exit(1);
  }

  const db = init({ appId, adminToken });

  let system;
  if (systemId) {
    const res = await db.query({
      trailSystems: { $: { where: { id: systemId }, limit: 1 } },
    });
    const list = entityList(res, "trailSystems");
    system = list[0];
    if (!system) {
      console.error(`Error: no trail system found with id "${systemId}"`);
      process.exit(1);
    }
  } else {
    const res = await db.query({
      trailSystems: { $: { limit: 5000 } },
    });
    const list = entityList(res, "trailSystems");
    system = list.find((s) => (s.slug || "").toLowerCase() === String(slug).toLowerCase());
    if (!system) {
      console.error(`Error: no trail system found with slug "${slug}"`);
      process.exit(1);
    }
  }

  const segRes = await db.query({
    trailSegments: { $: { limit: 10000 } },
  });
  const allSegs = entityList(segRes, "trailSegments");
  const segments = allSegs.filter(
    (s) =>
      (s.systemRef && s.systemRef === system.extSystemRef) ||
      (s.systemSlug && s.systemSlug === system.slug)
  );

  if (segments.length === 0) {
    console.error(
      "Error: no trail segments found for this system (systemRef/systemSlug match)."
    );
    process.exit(1);
  }

  const lines = [];
  for (const seg of segments) {
    if (!seg.geometry) continue;
    try {
      lines.push(...extractLines(seg.geometry));
    } catch (_) {}
  }

  if (lines.length === 0) {
    console.error("Error: no valid geometry (LineString/MultiLineString) in trail segments.");
    process.exit(1);
  }

  const bbox = bboxFromLines(lines);
  if (!bbox) {
    console.error("Error: could not compute bbox from segment coordinates.");
    process.exit(1);
  }

  let elements;
  try {
    elements = await overpassPost(buildOverpassQuery(bbox));
  } catch (err) {
    console.error("Error: Overpass request failed:", err.message);
    process.exit(1);
  }

  const seen = new Set();
  const items = [];
  for (const el of elements) {
    const key = `${el.type}/${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(buildItem(el));
  }

  const counts = {
    elements: items.length,
    drinking_water: items.filter((i) => i.kind === "drinking_water").length,
    watering_place: items.filter((i) => i.kind === "watering_place").length,
    other: items.filter(
      (i) =>
        i.kind !== "drinking_water" &&
        i.kind !== "watering_place"
    ).length,
  };

  const output = {
    system: {
      id: system.id,
      slug: system.slug ?? null,
      name: system.name ?? null,
    },
    bbox: {
      minLat: bbox.minLat,
      minLon: bbox.minLon,
      maxLat: bbox.maxLat,
      maxLon: bbox.maxLon,
    },
    counts,
    items,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
