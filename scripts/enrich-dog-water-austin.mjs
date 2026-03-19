#!/usr/bin/env node
/**
 * DRY RUN: Merged dog drinking water candidates (OSM + Austin PARD discovered + dog parks inference).
 * No DB writes. Prints JSON to stdout.
 *
 * Example commands:
 *   npm run enrich:dogwater:austin -- --slug mueller-trail
 *   npm run enrich:dogwater:austin -- --systemId <uuid>
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
const AUSTIN_PARD_QUERY_URL =
  "https://services7.arcgis.com/X8BO7jvq5nMMymtB/ArcGIS/rest/services/TTC_Amenity_CompSignView/FeatureServer/0/query";
const EXPAND_BBOX_METERS = 150;
const DEDUPE_RADIUS_METERS = 25;
const DOG_PARK_NEAR_METERS = 300;
const DOG_PARK_VERY_NEAR_METERS = 75;
const AUSTIN_PARD_HUB_BASE =
  "https://austin-parks-and-recreation-austin.hub.arcgis.com/api/v3/datasets";
const ARCGIS_SHARING_REST = "https://www.arcgis.com/sharing/rest";
const OFF_LEASH_NEAR_METERS = 250;

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

// ── ArcGIS Online sharing search ───────────────────────────────────────────────

async function arcgisOnlineSearch(query, num = 10) {
  const params = new URLSearchParams({
    f: "json",
    q: query,
    num: String(num),
    start: "1",
  });
  const url = `${ARCGIS_SHARING_REST}/search?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return [];
  const data = await res.json();
  const results = data.results ?? data.items ?? [];
  return results.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type,
    url: r.url,
    owner: r.owner,
    modified: r.modified,
  }));
}

// ── Utilities (as specified) ─────────────────────────────────────────────────

async function getSystemBySlugOrId(db, { systemId, slug }) {
  if (systemId) {
    const res = await db.query({
      trailSystems: { $: { where: { id: systemId }, limit: 1 } },
    });
    const list = entityList(res, "trailSystems");
    return list[0] || null;
  }
  if (slug) {
    const res = await db.query({ trailSystems: { $: { limit: 5000 } } });
    const list = entityList(res, "trailSystems");
    return (
      list.find((s) => (s.slug || "").toLowerCase() === String(slug).toLowerCase()) || null
    );
  }
  return null;
}

/**
 * Extract flat array of [lon, lat] from GeoJSON LineString or MultiLineString.
 */
function extractCoordsFromGeoJSON(geom) {
  if (!geom?.coordinates) return [];
  const out = [];
  if (geom.type === "LineString") {
    for (const pt of geom.coordinates) out.push(Array.isArray(pt) ? pt : [pt?.lon ?? pt?.[0], pt?.lat ?? pt?.[1]]);
    return out;
  }
  if (geom.type === "MultiLineString") {
    for (const line of geom.coordinates) {
      for (const pt of line) out.push(Array.isArray(pt) ? pt : [pt?.lon ?? pt?.[0], pt?.lat ?? pt?.[1]]);
    }
    return out;
  }
  return [];
}

function bboxFromCoords(coords) {
  if (!coords.length) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const pt of coords) {
    const [lon, lat] = pt;
    if (typeof lon !== "number" || typeof lat !== "number") continue;
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return minLon === Infinity ? null : { minLat, minLon, maxLat, maxLon };
}

function expandBboxMeters(bbox, meters) {
  const latRad = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180);
  const latDeg = meters / 111000;
  const lonDeg = meters / (111000 * Math.cos(latRad));
  return {
    minLat: bbox.minLat - latDeg,
    minLon: bbox.minLon - lonDeg,
    maxLat: bbox.maxLat + latDeg,
    maxLon: bbox.maxLon + lonDeg,
    expandedByMeters: meters,
  };
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Cluster items with location by proximity (Haversine); merge into single items per cluster.
 * Each merged item: centroid location, sources, bestName, kind preference, dogSignal merge.
 */
function dedupeByProximity(itemsWithLocation, radiusMeters) {
  const merged = [];
  const used = new Set();

  for (let i = 0; i < itemsWithLocation.length; i++) {
    if (used.has(i)) continue;
    const a = itemsWithLocation[i];
    const cluster = [a];
    used.add(i);

    for (let j = i + 1; j < itemsWithLocation.length; j++) {
      if (used.has(j)) continue;
      const b = itemsWithLocation[j];
      const d = haversineMeters(
        a.location.lat,
        a.location.lon,
        b.location.lat,
        b.location.lon
      );
      if (d <= radiusMeters) {
        cluster.push(b);
        used.add(j);
      }
    }

    const n = cluster.length;
    const lat = cluster.reduce((s, x) => s + x.location.lat, 0) / n;
    const lon = cluster.reduce((s, x) => s + x.location.lon, 0) / n;
    const sources = [...new Set(cluster.map((x) => x.source))];
    const sourceIds = cluster.map((x) => ({ source: x.source, id: x.externalId }));
    const pardName =
      cluster.find(
        (x) =>
          (x.source === "austin_pard_arcgis" ||
            x.source === "austin_pard_discovered_arcgis" ||
            x.source === "austin_public_fountains_arcgis") &&
          x.name
      )?.name;
    const otherNames = cluster
      .filter(
        (x) =>
          x.source !== "austin_pard_arcgis" &&
          x.source !== "austin_pard_discovered_arcgis" &&
          x.source !== "austin_public_fountains_arcgis"
      )
      .map((x) => x.name)
      .filter(Boolean);
    const bestName = pardName ?? (otherNames.length > 0 ? otherNames[0] : null);
    const kindOrder = [
      "drinking_water",
      "water_point",
      "hydration_station",
      "drinking_fountain",
      "watering_place",
      "fountain",
      "water_well",
      "unknown",
    ];
    let kind = "unknown";
    for (const k of kindOrder) {
      if (cluster.some((x) => x.kind === k)) {
        kind = k;
        break;
      }
    }
    const anyExplicit = cluster.some((x) => x.dogSignal?.isExplicitDogWater);
    const allNotes = cluster.flatMap((x) => x.dogSignal?.notes ?? []);
    const suggestsSplash = cluster.some((x) => suggestsSplashOrDecorative(x));

    merged.push({
      location: { lat, lon },
      bestName,
      kind,
      sources,
      sourceIds,
      dogSignal: { isExplicitDogWater: anyExplicit, notes: [...new Set(allNotes)] },
      suggestsSplashOrDecorative: suggestsSplash,
    });
  }

  return merged;
}

// ── Overpass ──────────────────────────────────────────────────────────────────

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
  node["amenity"="fountain"](${b});
  way["amenity"="fountain"](${b});
  relation["amenity"="fountain"](${b});
  node["amenity"="water_point"](${b});
  way["amenity"="water_point"](${b});
  relation["amenity"="water_point"](${b});
  node["man_made"="water_well"](${b});
  way["man_made"="water_well"](${b});
  relation["man_made"="water_well"](${b});
);
out geom tags;`;
}

function buildDogParksOverpassQuery(bbox) {
  const b = bboxToOverpass(bbox);
  return `[out:json][timeout:60];
(
  node["leisure"="dog_park"](${b});
  way["leisure"="dog_park"](${b});
  relation["leisure"="dog_park"](${b});
);
out geom tags;`;
}

function kindFromTags(tags) {
  if (!tags) return "unknown";
  if (tags.amenity === "drinking_water") return "drinking_water";
  if (tags.amenity === "water_point") return "water_point";
  if (tags.amenity === "watering_place") return "watering_place";
  if (tags.amenity === "fountain") return "fountain";
  if (tags.man_made === "water_well") return "water_well";
  return "unknown";
}

function hasDogOrPetInText(text) {
  if (!text || typeof text !== "string") return false;
  return /dog|pet/.test(text.toLowerCase());
}

function dogSignalFromOsmItem(tags, name) {
  const t = tags || {};
  const notes = [];
  const dogVal = t.dog != null ? String(t.dog).trim() : "";
  const dogValLower = dogVal.toLowerCase();
  const explicitByTag =
    dogValLower === "yes" ||
    dogValLower === "designated" ||
    dogValLower === "permissive" ||
    (dogVal.length > 0 && /designated/.test(dogValLower));
  const explicitByName = hasDogOrPetInText(name);
  const explicitByDesc = hasDogOrPetInText(t.description);
  const isExplicit = explicitByTag || explicitByName || explicitByDesc;

  if (explicitByTag) notes.push(`tag dog=${t.dog} (explicit dog water)`);
  else notes.push("no explicit dog tag");
  if (explicitByName) notes.push("name contains 'dog' or 'pet'");
  if (explicitByDesc) notes.push("description contains 'dog' or 'pet'");

  return { isExplicitDogWater: isExplicit, notes };
}

function centroidFromGeometry(el) {
  if (el.type === "node" && el.lat != null && el.lon != null) {
    return { lat: el.lat, lon: el.lon };
  }
  const nodes =
    el.geometry ||
    (el.members && el.members.flatMap((m) => m.geometry || [])) ||
    [];
  if (!nodes.length) return null;
  let sumLat = 0, sumLon = 0;
  for (const n of nodes) {
    const lat = n.lat ?? n[1];
    const lon = n.lon ?? n[0];
    if (typeof lat === "number" && typeof lon === "number") {
      sumLat += lat;
      sumLon += lon;
    }
  }
  return { lat: sumLat / nodes.length, lon: sumLon / nodes.length };
}

function parseOsmElements(elements) {
  const items = [];
  const unlocated = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const kind = kindFromTags(tags);
    const name = tags.name ?? null;
    const location = centroidFromGeometry(el);
    const dogSignal = dogSignalFromOsmItem(tags, name);
    const item = {
      source: "osm",
      externalId: `${el.type}/${el.id}`,
      kind,
      name,
      location,
      tags: { ...tags },
      dogSignal,
    };
    if (location) items.push(item);
    else unlocated.push({ ...item, locationMissing: true });
  }
  return { items, unlocated };
}

async function overpassFetchJson(res) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("json")) {
    const text = await res.text();
    const preview = text.slice(0, 80).replace(/\s+/g, " ");
    throw new Error(`Response is not JSON (content-type: ${ct || "unknown"}). Preview: ${preview}`);
  }
  const data = await res.json();
  if (data.elements == null && data.error != null) {
    throw new Error(data.error ?? "Overpass API error");
  }
  return data;
}

async function fetchOsmCandidates(bbox) {
  const body = `data=${encodeURIComponent(buildOverpassQuery(bbox))}`;
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
      const data = await overpassFetchJson(res);
      const elements = data.elements ?? [];
      return parseOsmElements(elements);
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  throw new Error(`Overpass request failed: ${lastErr?.message ?? lastErr}`);
}

async function overpassPostQuery(endpoint, query) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await overpassFetchJson(res);
  return data.elements ?? [];
}

async function fetchDogParks(bbox) {
  const query = buildDogParksOverpassQuery(bbox);
  let lastErr;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const elements = await overpassPostQuery(endpoint, query);
      const centroids = [];
      for (const el of elements) {
        const c = centroidFromGeometry(el);
        if (c) centroids.push(c);
      }
      return centroids;
    } catch (e) {
      lastErr = e;
      continue;
    }
  }
  return []; // non-fatal: continue without dog parks
}

function nearestDistanceToPoints(lat, lon, points) {
  if (!points.length) return null;
  let min = Infinity;
  for (const p of points) {
    const d = haversineMeters(lat, lon, p.lat, p.lon);
    if (d < min) min = d;
  }
  return min === Infinity ? null : min;
}

// ── Point-in-polygon and distance (Esri rings: [ [x,y], ... ], x=lon, y=lat in 4326) ─

function pointInPolygonRings(lat, lon, rings) {
  if (!rings?.length) return false;
  const ring = rings[0];
  if (!ring || ring.length < 3) return false;
  const n = ring.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polygonCentroid(rings) {
  if (!rings?.length) return null;
  const ring = rings[0];
  let sumX = 0, sumY = 0, n = 0;
  for (const p of ring) {
    sumX += p[0];
    sumY += p[1];
    n++;
  }
  return n ? { lon: sumX / n, lat: sumY / n } : null;
}

function suggestsSplashOrDecorative(item) {
  const name = (item.name || "").toLowerCase();
  const tagStr = JSON.stringify(item.tags || item.raw || {}).toLowerCase();
  return /splash|sprayground|decorative/.test(name) || /splash|sprayground|decorative/.test(tagStr);
}

// ── Austin PARD ArcGIS Hub discovery ────────────────────────────────────────────

async function fetchHubDatasets(searchTerm) {
  const url = `${AUSTIN_PARD_HUB_BASE}?filter[search]=${encodeURIComponent(searchTerm)}&page[size]=50`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return [];
  const data = await res.json();
  const list = data.data ?? data ?? [];
  return Array.isArray(list) ? list : [];
}

function extractFeatureServerUrls(datasets) {
  const urls = new Set();
  for (const d of datasets) {
    const u = d.url ?? d.attributes?.url ?? d.links?.arcgis ?? "";
    if (typeof u !== "string") continue;
    if (u.includes("FeatureServer")) urls.add(u.replace(/\/(query|rest).*$/i, "").replace(/\/\d+$/, ""));
    const more = d.links ?? d.attributes?.links ?? {};
    for (const v of Object.values(more)) {
      if (typeof v === "string" && v.includes("FeatureServer"))
        urls.add(v.replace(/\/(query|rest).*$/i, "").replace(/\/\d+$/, ""));
    }
  }
  return [...urls];
}

function featureMatchesWater(attrs, feature) {
  const a = attrs || feature?.attributes || {};
  const typeFields = ["ASSET_TYPE", "TYPE", "AMENITY", "AssetType", "Type"];
  const keywords = ["drink", "fountain", "hydration"];
  const str = JSON.stringify(a).toLowerCase();
  if (keywords.some((k) => str.includes(k))) return true;
  for (const f of typeFields) {
    const v = a[f];
    if (typeof v === "string" && keywords.some((k) => v.toLowerCase().includes(k))) return true;
  }
  return false;
}

async function queryLayerWithBbox(baseUrl, layerId, bbox) {
  const { minLon, minLat, maxLon, maxLat } = bbox;
  const geometry = `${minLon},${minLat},${maxLon},${maxLat}`;
  const queryUrl = `${baseUrl}/${layerId}/query`;
  const params = new URLSearchParams({
    f: "json",
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    geometryType: "esriGeometryEnvelope",
    geometry,
    spatialRel: "esriSpatialRelIntersects",
  });
  const res = await fetch(`${queryUrl}?${params}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) return null;
  const data = await res.json();
  if (data.error || !Array.isArray(data.features)) return null;
  return data.features;
}

async function discoverAndFetchPardLayers(bbox) {
  const terms = ["drinking", "fountain", "hydration", "water"];
  const allDatasets = [];
  for (const term of terms) {
    try {
      const list = await fetchHubDatasets(term);
      allDatasets.push(...list);
    } catch (_) {}
  }
  const baseUrls = extractFeatureServerUrls(allDatasets);
  const items = [];
  const seenKeys = new Set();

  for (const baseUrl of baseUrls) {
    for (let layerId = 0; layerId <= 5; layerId++) {
      try {
        const features = await queryLayerWithBbox(baseUrl, layerId, bbox);
        if (!features || !features.length) continue;
        for (const f of features) {
          if (!featureMatchesWater(f.attributes, f)) continue;
          const attrs = f.attributes || {};
          const geom = f.geometry;
          let lat = null, lon = null;
          if (geom && typeof geom.x === "number" && typeof geom.y === "number") {
            lon = geom.x;
            lat = geom.y;
          } else if (geom && typeof geom.latitude === "number" && typeof geom.longitude === "number") {
            lat = geom.latitude;
            lon = geom.longitude;
          }
          if (lat == null || lon == null) continue;
          const name = attrs.PARK_NAME ?? attrs.ASSET_TYPE ?? attrs.NAME ?? attrs.name ?? null;
          const externalId = String(attrs.GlobalID_2 ?? attrs.OBJECTID ?? attrs.globalId ?? `${baseUrl}_${layerId}_${items.length}`);
          const key = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          items.push({
            source: "austin_pard_discovered_arcgis",
            externalId,
            kind: "drinking_fountain",
            name,
            location: { lat, lon },
            raw: attrs,
          });
        }
      } catch (_) {}
    }
  }
  return items;
}

// ── ArcGIS Online: off-leash areas and public fountains ────────────────────────

async function arcgisLayerBboxQuery(layerUrl, bbox) {
  const base = layerUrl.replace(/\/query.*$/i, "").replace(/\/$/, "");
  const { minLon, minLat, maxLon, maxLat } = bbox;
  const geometry = `${minLon},${minLat},${maxLon},${maxLat}`;
  const params = new URLSearchParams({
    f: "json",
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    geometryType: "esriGeometryEnvelope",
    geometry,
    spatialRel: "esriSpatialRelIntersects",
  });
  const url = `${base}/query?${params}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("json")) return null;
  const data = await res.json();
  if (data.error || !Array.isArray(data.features)) return null;
  return data.features;
}

async function fetchWebMapOperationalLayers(itemId) {
  const url = `${ARCGIS_SHARING_REST}/content/items/${itemId}/data?f=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  const data = await res.json();
  const layers = data.operationalLayers ?? [];
  const urls = [];
  for (const ly of layers) {
    const u = ly.url ?? ly.layer?.url;
    if (typeof u === "string" && u.includes("FeatureServer")) {
      const base = u.replace(/\/(query|rest).*$/i, "").replace(/\/\d+$/, "");
      for (let i = 0; i <= 8; i++) urls.push(`${base}/${i}`);
    }
  }
  return urls;
}

function bestNameFromAttrs(attrs, nameFields = ["NAME", "name", "PARK_NAME", "LOCATION", "Title"]) {
  for (const f of nameFields) {
    const v = attrs[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

async function discoverOffLeashAreas(bbox) {
  const allowedTypes = ["Feature Service", "Feature Layer", "Web Map"];
  let items = await arcgisOnlineSearch(
    '(title:"Off Leash" OR title:"Off-Leash") AND (orgid:a2W7U0v2O7Gf9l5J OR owner:austintexas OR owner:CityofAustin OR owner:austinparks)',
    20
  );
  if (!items.length) {
    items = await arcgisOnlineSearch('title:"Off Leash" AND (Austin OR "City of Austin" OR PARD)', 20);
  }
  items = items.filter((r) => r.type && allowedTypes.includes(r.type));
  if (!items.length) {
    console.error("[ArcGIS] No off-leash items found; try different search.");
    return [];
  }
  console.error("[ArcGIS] Off-leash items selected:", items.map((i) => ({ title: i.title, id: i.id, url: i.url })));

  const layerUrlSet = new Set();
  for (const item of items) {
    if (item.type === "Web Map") {
      const urls = await fetchWebMapOperationalLayers(item.id);
      urls.forEach((u) => layerUrlSet.add(u));
    } else if ((item.type === "Feature Service" || item.type === "Feature Layer") && item.url) {
      const base = item.url.replace(/\/(query|rest).*$/i, "").replace(/\/\d+$/, "");
      for (let i = 0; i <= 8; i++) layerUrlSet.add(`${base}/${i}`);
    }
  }
  const layerUrls = [...layerUrlSet];

  const polygons = [];
  const seenRings = new Set();
  for (const layerUrl of layerUrls) {
    try {
      const features = await arcgisLayerBboxQuery(layerUrl, bbox);
      if (!features?.length) continue;
      const first = features[0];
      const geom = first.geometry;
      const hasRings = geom?.rings?.length;
      if (!hasRings) continue;
      console.error("[ArcGIS] Queried off-leash layer (polygon):", layerUrl, "features:", features.length);
      for (const f of features) {
        const rings = f.geometry?.rings;
        if (!rings?.length) continue;
        const key = JSON.stringify(rings[0].slice(0, 3));
        if (seenRings.has(key)) continue;
        seenRings.add(key);
        const attrs = f.attributes || {};
        const name = bestNameFromAttrs(attrs);
        const centroid = polygonCentroid(rings);
        const externalId = String(attrs.OBJECTID ?? attrs.GlobalID ?? attrs.OBJECTID_2 ?? polygons.length);
        polygons.push({
          source: "austin_offleash_arcgis",
          externalId,
          name,
          geometry: { type: "Polygon", coordinates: [rings[0].map((p) => [p[0], p[1]])] },
          raw: attrs,
          rings,
          centroid: centroid ? { lat: centroid.lat, lon: centroid.lon } : null,
        });
      }
    } catch (_) {}
  }
  return polygons;
}

async function discoverPublicFountains(bbox) {
  const query =
    '("Austin Public Water Fountains" OR (Austin AND (water fountain OR drinking fountain OR hydration station))) AND (Feature Service OR Feature Layer)';
  let items = await arcgisOnlineSearch(query, 20);
  const allowedTypes = ["Feature Service", "Feature Layer", "Web Map"];
  items = items.filter((r) => r.type && allowedTypes.includes(r.type));
  if (!items.length) {
    console.error("[ArcGIS] No public fountains items found.");
    return [];
  }
  console.error("[ArcGIS] Public fountains items selected:", items.map((i) => ({ title: i.title, id: i.id, url: i.url })));

  const layerUrlSet = new Set();
  for (const item of items) {
    if (item.type === "Web Map") {
      const urls = await fetchWebMapOperationalLayers(item.id);
      urls.forEach((u) => layerUrlSet.add(u));
    } else if ((item.type === "Feature Service" || item.type === "Feature Layer") && item.url) {
      const base = item.url.replace(/\/(query|rest).*$/i, "").replace(/\/\d+$/, "");
      for (let i = 0; i <= 8; i++) layerUrlSet.add(`${base}/${i}`);
    }
  }
  const layerUrls = [...layerUrlSet];

  const points = [];
  const seenKeys = new Set();
  for (const layerUrl of layerUrls) {
    try {
      const features = await arcgisLayerBboxQuery(layerUrl, bbox);
      if (!features?.length) continue;
      const first = features[0];
      const geom = first.geometry;
      const isPoint = geom && (typeof geom.x === "number" || typeof geom.latitude === "number");
      if (!isPoint) continue;
      console.error("[ArcGIS] Queried public fountains layer (point):", layerUrl, "features:", features.length);
      for (const f of features) {
        const g = f.geometry;
        let lat = null, lon = null;
        if (g && typeof g.x === "number" && typeof g.y === "number") {
          lon = g.x;
          lat = g.y;
        } else if (g && typeof g.latitude === "number" && typeof g.longitude === "number") {
          lat = g.latitude;
          lon = g.longitude;
        }
        if (lat == null || lon == null) continue;
        const attrs = f.attributes || {};
        const name = bestNameFromAttrs(attrs);
        const externalId = String(attrs.OBJECTID ?? attrs.GlobalID ?? attrs.OBJECTID_2 ?? points.length);
        const key = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        let kind = "drinking_water";
        const typeStr = JSON.stringify(attrs).toLowerCase();
        if (/hydration|hydration station/i.test(typeStr)) kind = "hydration_station";
        else if (/fountain/i.test(typeStr) && !/drinking/.test(typeStr)) kind = "fountain";
        points.push({
          source: "austin_public_fountains_arcgis",
          externalId,
          kind,
          name,
          location: { lat, lon },
          raw: attrs,
        });
      }
    } catch (_) {}
  }
  return points;
}

// ── Austin PARD ArcGIS (hardcoded layer) ───────────────────────────────────────

async function fetchAustinPardCandidates(bbox) {
  const { minLon, minLat, maxLon, maxLat } = bbox;
  const geometry = `${minLon},${minLat},${maxLon},${maxLat}`;
  const params = new URLSearchParams({
    f: "json",
    where: "ASSET_TYPE='Drinking Fountain'",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    geometryType: "esriGeometryEnvelope",
    geometry,
    spatialRel: "esriSpatialRelIntersects",
  });
  const url = `${AUSTIN_PARD_QUERY_URL}?${params.toString()}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ArcGIS API error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "ArcGIS error");
  const features = data.features || [];
  const items = [];
  for (const f of features) {
    const attrs = f.attributes || {};
    const geom = f.geometry;
    let lat = null, lon = null;
    if (geom && typeof geom.x === "number" && typeof geom.y === "number") {
      lon = geom.x;
      lat = geom.y;
    } else if (geom && typeof geom.latitude === "number" && typeof geom.longitude === "number") {
      lat = geom.latitude;
      lon = geom.longitude;
    }
    const name = attrs.PARK_NAME ?? attrs.ASSET_TYPE ?? null;
    const externalId = String(attrs.GlobalID_2 ?? attrs.OBJECTID ?? f.attributes?.OBJECTID ?? "");
    items.push({
      source: "austin_pard_arcgis",
      externalId: externalId || `feature_${items.length}`,
      kind: "drinking_fountain",
      name,
      location: lat != null && lon != null ? { lat, lon } : null,
      raw: attrs,
    });
  }
  const withLocation = items.filter((i) => i.location);
  const unlocatedPard = items.filter((i) => !i.location);
  return { items: withLocation, unlocated: unlocatedPard };
}

// ── Normalize PARD items to same shape as OSM for merge (add dogSignal) ─────────

function normalizePardForMerge(item) {
  return {
    ...item,
    dogSignal: { isExplicitDogWater: false, notes: ["PARD asset; no OSM dog tags"] },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

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

  const system = await getSystemBySlugOrId(db, { systemId, slug });
  if (!system) {
    console.error(`Error: no trail system found for ${systemId ? `id ${systemId}` : `slug ${slug}`}`);
    process.exit(1);
  }

  let segments;
  const res = await db.query({
    trailSegments: { $: { limit: 50000 } },
  });
  const allSegs = entityList(res, "trailSegments");
  segments = allSegs.filter(
    (s) =>
      (s.systemId && s.systemId === system.id) ||
      (s.systemRef && s.systemRef === system.extSystemRef) ||
      (s.systemSlug && s.systemSlug === system.slug)
  );

  if (!segments.length) {
    console.error("Error: no trail segments found for this system (systemId / systemRef / systemSlug).");
    process.exit(1);
  }

  const allCoords = [];
  for (const seg of segments) {
    if (!seg.geometry) {
      console.error("Error: at least one segment has no geometry. All segments must have GeoJSON LineString or MultiLineString.");
      process.exit(1);
    }
    const coords = extractCoordsFromGeoJSON(seg.geometry);
    allCoords.push(...coords);
  }

  const rawBbox = bboxFromCoords(allCoords);
  if (!rawBbox) {
    console.error("Error: could not compute bbox from segment coordinates (no valid coordinates).");
    process.exit(1);
  }

  const bbox = expandBboxMeters(rawBbox, EXPAND_BBOX_METERS);

  let osmResult, pardResult, dogParkCentroids, discoveredItems;
  try {
    osmResult = await fetchOsmCandidates(bbox);
  } catch (err) {
    console.error("Error: Overpass request failed:", err.message);
    process.exit(1);
  }
  try {
    pardResult = await fetchAustinPardCandidates(bbox);
  } catch (err) {
    console.error("Error: Austin PARD ArcGIS request failed:", err.message);
    process.exit(1);
  }
  dogParkCentroids = await fetchDogParks(bbox);
  try {
    discoveredItems = await discoverAndFetchPardLayers(bbox);
  } catch (_) {
    discoveredItems = [];
  }

  let offLeashAreas = [];
  let publicFountainsItems = [];
  try {
    offLeashAreas = await discoverOffLeashAreas(bbox);
  } catch (e) {
    console.error("[ArcGIS] Off-leash discovery failed:", e.message);
  }
  try {
    publicFountainsItems = await discoverPublicFountains(bbox);
  } catch (e) {
    console.error("[ArcGIS] Public fountains discovery failed:", e.message);
  }

  const osmItems = osmResult.items;
  const pardItems = pardResult.items.map(normalizePardForMerge);
  const discoveredNormalized = discoveredItems.map((it) => ({
    ...it,
    dogSignal: { isExplicitDogWater: false, notes: ["PARD discovered layer; no OSM dog tags"] },
  }));
  const publicFountainsNormalized = publicFountainsItems.map((it) => ({
    ...it,
    dogSignal: { isExplicitDogWater: false, notes: ["Austin public fountains layer; no OSM dog tags"] },
  }));
  const combinedWithLocation = [
    ...osmItems,
    ...pardItems,
    ...discoveredNormalized,
    ...publicFountainsNormalized,
  ];
  const unlocatedOsm = osmResult.unlocated || [];
  const unlocatedPard = pardResult.unlocated || [];

  const merged = dedupeByProximity(combinedWithLocation, DEDUPE_RADIUS_METERS);

  for (const m of merged) {
    const dist = nearestDistanceToPoints(m.location.lat, m.location.lon, dogParkCentroids);
    m.nearestDogParkDistanceMeters = dist != null ? Math.round(dist * 10) / 10 : null;
    m.isNearDogPark = dist != null && dist <= DOG_PARK_NEAR_METERS;
    m.veryLikelyDogUsable = dist != null && dist <= DOG_PARK_VERY_NEAR_METERS;

    let isInOffLeashArea = false;
    let distanceToNearestOffLeashMeters = null;
    for (const poly of offLeashAreas) {
      const inside = pointInPolygonRings(m.location.lat, m.location.lon, poly.rings);
      if (inside) {
        isInOffLeashArea = true;
        distanceToNearestOffLeashMeters = 0;
        break;
      }
      if (poly.centroid) {
        const d = haversineMeters(
          m.location.lat,
          m.location.lon,
          poly.centroid.lat,
          poly.centroid.lon
        );
        const dRounded = Math.round(d * 10) / 10;
        if (distanceToNearestOffLeashMeters == null || dRounded < distanceToNearestOffLeashMeters) {
          distanceToNearestOffLeashMeters = dRounded;
        }
      }
    }
    m.isInOffLeashArea = isInOffLeashArea;
    m.distanceToNearestOffLeashMeters = distanceToNearestOffLeashMeters;

    let dogRelevance = "unknown";
    if (m.dogSignal?.isExplicitDogWater || m.veryLikelyDogUsable || m.isInOffLeashArea) {
      dogRelevance = "confirmed";
    } else if (
      m.isNearDogPark ||
      (m.distanceToNearestOffLeashMeters != null && m.distanceToNearestOffLeashMeters <= OFF_LEASH_NEAR_METERS)
    ) {
      dogRelevance = "likely";
    }

    let dogScore = 0;
    if (m.kind === "drinking_water" || m.kind === "water_point") dogScore += 30;
    if (m.dogSignal?.isExplicitDogWater) dogScore += 50;
    if (m.veryLikelyDogUsable) dogScore += 25;
    else if (m.isNearDogPark) dogScore += 10;
    if (m.isInOffLeashArea) dogScore += 40;
    else if (m.distanceToNearestOffLeashMeters != null && m.distanceToNearestOffLeashMeters <= OFF_LEASH_NEAR_METERS) {
      dogScore += 20;
    }
    if (m.suggestsSplashOrDecorative) dogScore -= 20;
    m.dogRelevance = dogRelevance;
    m.dogScore = Math.max(0, Math.min(100, dogScore));
  }

  const unlocated = [...unlocatedOsm, ...unlocatedPard];

  const output = {
    system: { id: system.id, slug: system.slug ?? null, name: system.name ?? null },
    bbox: {
      minLat: bbox.minLat,
      minLon: bbox.minLon,
      maxLat: bbox.maxLat,
      maxLon: bbox.maxLon,
      expandedByMeters: EXPAND_BBOX_METERS,
    },
    counts: {
      osm: osmItems.length,
      austin_pard_arcgis: pardItems.length,
      austin_pard_discovered_arcgis: discoveredNormalized.length,
      austinPublicFountains: publicFountainsNormalized.length,
      offLeashAreas: offLeashAreas.length,
      dogParks: dogParkCentroids.length,
      merged: merged.length,
      unlocated: unlocated.length,
    },
    merged,
    unlocated,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
