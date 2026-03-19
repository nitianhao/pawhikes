/**
 * Local OSM feature loader — reads pre-processed Geofabrik extracts from
 * .cache/osm/{city}/{category}.geojsonseq and returns Overpass-compatible
 * element arrays so enrichment scripts can use them with minimal changes.
 *
 * Produced by: scripts/osm/prepare-city-osm.ts
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, "../../.cache/osm");

// ── types ─────────────────────────────────────────────────────────────────────

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: string;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  members?: { geometry: { lat: number; lon: number }[] }[];
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
};

export interface OsmLocalIndex {
  elements: OsmElement[];
  /** [minLon, minLat, maxLon, maxLat] for each element (same index as elements) */
  bboxes: ([number, number, number, number] | null)[];
}

// ── geo math ─────────────────────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180;
const EARTH_R = 6_371_000; // metres

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── geometry helpers ──────────────────────────────────────────────────────────

function centroid(
  coords: [number, number][],
): { lat: number; lon: number } | undefined {
  if (coords.length === 0) return undefined;
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of coords) { sumLon += lon; sumLat += lat; }
  return { lon: sumLon / coords.length, lat: sumLat / coords.length };
}

function bboxOfCoords(
  coords: [number, number][],
): [number, number, number, number] | null {
  if (coords.length === 0) return null;
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

// ── GeoJSON → Overpass-compatible element ─────────────────────────────────────

function geojsonToOsmElement(feature: any): OsmElement | null {
  const props: Record<string, any> = feature.properties ?? {};

  // osmium export -u type_id puts id at feature.id as "n123", "w456", "a789"
  const rawId = String(feature.id ?? props["@id"] ?? "0");
  const typePrefix = rawId.charAt(0);
  const TYPE_MAP: Record<string, "node" | "way" | "relation"> = {
    n: "node", w: "way", a: "relation", r: "relation",
  };
  const osmType = TYPE_MAP[typePrefix] ?? (props["@type"] as "node" | "way" | "relation" | undefined) ?? "way";
  const osmIdFull = rawId;

  const tags: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) {
    if (!k.startsWith("@") && v != null) tags[k] = String(v);
  }

  const geom = feature.geometry;
  if (!geom) return null;

  switch (geom.type as string) {
    case "Point": {
      const [lon, lat] = geom.coordinates as [number, number];
      return { type: "node", id: osmIdFull, lat, lon, tags };
    }

    case "LineString": {
      const coords = geom.coordinates as [number, number][];
      const geometry = coords.map(([lon, lat]) => ({ lat, lon }));
      const c = centroid(coords);
      return { type: osmType, id: osmIdFull, geometry, center: c, tags };
    }

    case "Polygon": {
      const outerRing = geom.coordinates[0] as [number, number][];
      const geometry = outerRing.map(([lon, lat]) => ({ lat, lon }));
      const c = centroid(outerRing);
      return { type: osmType, id: osmIdFull, geometry, center: c, tags };
    }

    case "MultiPolygon": {
      // Convert to relation-like structure for ringsFromRelation() compatibility
      const members: { geometry: { lat: number; lon: number }[] }[] = [];
      for (const polygon of geom.coordinates as [number, number][][][]) {
        for (const ring of polygon) {
          members.push({ geometry: ring.map(([lon, lat]) => ({ lat, lon })) });
        }
      }
      const allCoords = (geom.coordinates as [number, number][][][]).flatMap(
        (p) => p[0],
      ) as [number, number][];
      const c = centroid(allCoords);
      return { type: "relation", id: osmIdFull, members, center: c, tags };
    }

    case "MultiLineString": {
      const allCoords = (geom.coordinates as [number, number][][]).flat() as [
        number,
        number,
      ][];
      const geometry = allCoords.map(([lon, lat]) => ({ lat, lon }));
      const c = centroid(allCoords);
      return { type: osmType, id: osmIdFull, geometry, center: c, tags };
    }

    default:
      return null;
  }
}

function elementBbox(
  el: OsmElement,
): [number, number, number, number] | null {
  if (el.type === "node") {
    if (el.lat == null || el.lon == null) return null;
    return [el.lon, el.lat, el.lon, el.lat];
  }
  if (el.geometry && el.geometry.length > 0) {
    return bboxOfCoords(el.geometry.map((n) => [n.lon, n.lat]));
  }
  if (el.members && el.members.length > 0) {
    return bboxOfCoords(
      el.members.flatMap((m) => m.geometry.map((n) => [n.lon, n.lat] as [number, number])),
    );
  }
  return null;
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Load and index all features for a city + category.
 * Reads .cache/osm/{city}/{category}.geojsonseq
 * Returns an in-memory index for fast bbox queries.
 *
 * Returns null (without throwing) if the cache file does not exist —
 * callers should fall back to Overpass in that case.
 *
 * @param tagFilter — optional function to pre-filter elements at load time,
 *   reducing index size for categories with many irrelevant elements.
 *   Example: `(el) => /^(path|footway|track)$/.test(el.tags.highway ?? "")`
 */
export function loadOsmCategory(
  city: string,
  category: string,
  tagFilter?: (el: OsmElement) => boolean,
): OsmLocalIndex | null {
  const normalizedCity = city.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filePath = join(CACHE_DIR, normalizedCity, `${category}.geojsonseq`);

  if (!existsSync(filePath)) return null;

  const lines = readFileSync(filePath, "utf-8").split("\n");
  const elements: OsmElement[] = [];
  const bboxes: ([number, number, number, number] | null)[] = [];

  for (const line of lines) {
    const trimmed = line.replace(/^\x1e/, "").trim();
    if (!trimmed) continue;
    try {
      const feature = JSON.parse(trimmed);
      const el = geojsonToOsmElement(feature);
      if (!el) continue;
      if (tagFilter && !tagFilter(el)) continue;
      elements.push(el);
      bboxes.push(elementBbox(el));
    } catch {
      // skip malformed lines
    }
  }

  // Dedup: osmium exports closed ways as BOTH w{id} (LineString) and a{id}
  // (MultiPolygon area). Keep the area version, drop the way duplicate.
  const areaIds = new Set<string>();
  for (const el of elements) {
    if (el.id.startsWith("a")) areaIds.add(el.id.slice(1));
  }
  const dedupElements: OsmElement[] = [];
  const dedupBboxes: ([number, number, number, number] | null)[] = [];
  let dropped = 0;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.id.startsWith("w") && areaIds.has(el.id.slice(1))) {
      dropped++;
      continue;
    }
    dedupElements.push(el);
    dedupBboxes.push(bboxes[i]);
  }

  if (dropped > 0) {
    console.log(
      `  [osmLocal] ${normalizedCity}/${category}: ${elements.length} features, ${dropped} way/area dupes removed → ${dedupElements.length}`,
    );
  } else {
    console.log(
      `  [osmLocal] ${normalizedCity}/${category}: ${elements.length} features`,
    );
  }
  return { elements: dedupElements, bboxes: dedupBboxes };
}

/**
 * Filter an OsmLocalIndex to elements whose bbox intersects the given trail bbox.
 * bbox format: [minLon, minLat, maxLon, maxLat]
 */
export function filterByBbox(
  index: OsmLocalIndex,
  bbox: [number, number, number, number],
): OsmElement[] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const result: OsmElement[] = [];
  for (let i = 0; i < index.elements.length; i++) {
    const fb = index.bboxes[i];
    if (!fb) continue;
    // Skip if bboxes are disjoint
    if (fb[2] < minLon || fb[0] > maxLon || fb[3] < minLat || fb[1] > maxLat) continue;
    result.push(index.elements[i]);
  }
  return result;
}

/**
 * Filter an OsmLocalIndex to elements within `radiusM` metres of a point.
 * Replaces Overpass `(around:radius,lat,lon)` queries.
 * Pre-filters with a bbox approximation for speed, then haversine check.
 */
export function filterByRadius(
  index: OsmLocalIndex,
  lat: number,
  lon: number,
  radiusM: number,
): OsmElement[] {
  // Convert radius to approximate degrees for fast bbox pre-filter
  const dLat = radiusM / EARTH_R / DEG_TO_RAD;
  const dLon = dLat / Math.cos(lat * DEG_TO_RAD);
  const bboxCandidates = filterByBbox(index, [lon - dLon, lat - dLat, lon + dLon, lat + dLat]);

  const result: OsmElement[] = [];
  for (const el of bboxCandidates) {
    const pt = elementCenter(el);
    if (!pt) continue;
    if (haversineM(lat, lon, pt.lat, pt.lon) <= radiusM) {
      result.push(el);
    }
  }
  return result;
}

function elementCenter(el: OsmElement): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  if (el.geometry && el.geometry.length > 0) {
    let sLat = 0, sLon = 0;
    for (const p of el.geometry) { sLat += p.lat; sLon += p.lon; }
    return { lat: sLat / el.geometry.length, lon: sLon / el.geometry.length };
  }
  if (el.members && el.members.length > 0) {
    const pts = el.members.flatMap((m) => m.geometry);
    if (pts.length === 0) return null;
    let sLat = 0, sLon = 0;
    for (const p of pts) { sLat += p.lat; sLon += p.lon; }
    return { lat: sLat / pts.length, lon: sLon / pts.length };
  }
  return null;
}
