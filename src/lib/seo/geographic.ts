import { normalizeState } from "@/lib/trailSlug";
import { slugifyCity } from "@/lib/slug";

export type GeoTrailRecord = {
  id?: string;
  centroid?: [number, number] | unknown; // [lon, lat]
};

export type GeoClusterKey = "north" | "south" | "east" | "west";

export type GeoCluster = {
  key: GeoClusterKey;
  label: string;
  slug: string;
  trailIds: string[];
  matchingCount: number;
  renderable: boolean;
  indexable: boolean;
  reason: string;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Geographic cluster safeguards read lazily so runtime env vars (not just
 * build-time vars) are respected without requiring a rebuild.
 */
function getGeoClusterThresholds() {
  return {
    minTrailsRender: envNumber("SEO_GEO_MIN_TRAILS_RENDER", 2),
    minTrailsIndex: envNumber("SEO_GEO_MIN_TRAILS_INDEX", 3),
    minCityCoordinateTrails: envNumber("SEO_GEO_MIN_CITY_COORD_TRAILS", 6),
    maxClustersPerCity: envNumber("SEO_GEO_MAX_CLUSTERS_PER_CITY", 3),
    maxOverlapRatio: envNumber("SEO_GEO_MAX_OVERLAP_RATIO", 0.82),
    minClusterCoverageShare: envNumber("SEO_GEO_MIN_COVERAGE_SHARE", 0.28),
    maxClusterRadiusKm: envNumber("SEO_GEO_MAX_RADIUS_KM", 18),
  };
}

type Point = { id: string; lat: number; lon: number };

function toPoint(trail: GeoTrailRecord): Point | null {
  const id = String(trail.id ?? "").trim();
  const c = trail.centroid;
  if (!id || !Array.isArray(c) || c.length < 2) return null;
  const lon = typeof c[0] === "number" && Number.isFinite(c[0]) ? c[0] : null;
  const lat = typeof c[1] === "number" && Number.isFinite(c[1]) ? c[1] : null;
  if (lat == null || lon == null) return null;
  return { id, lat, lon };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[index];
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const x = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function clusterRadiusKm(points: Point[]): number {
  if (points.length < 2) return 0;
  const center = {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lon: points.reduce((sum, p) => sum + p.lon, 0) / points.length,
  };
  let max = 0;
  for (const p of points) {
    max = Math.max(max, haversineKm(center, p));
  }
  return max;
}

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aSet = new Set(a);
  let shared = 0;
  for (const id of b) if (aSet.has(id)) shared += 1;
  return shared / Math.min(a.length, b.length);
}

export function buildGeoClusterPath(input: {
  state: string;
  city: string;
  clusterSlug: string;
}): string {
  return `/${encodeURIComponent(normalizeState(input.state))}/${encodeURIComponent(slugifyCity(input.city))}/near/${encodeURIComponent(input.clusterSlug)}`;
}

export function getGeoClustersForCity(input: {
  cityName: string;
  trails: GeoTrailRecord[];
}): GeoCluster[] {
  const thresholds = getGeoClusterThresholds();
  const points = input.trails.map(toPoint).filter((item): item is Point => item !== null);
  if (points.length < thresholds.minCityCoordinateTrails) return [];

  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const lat60 = percentile(lats, 0.6);
  const lat40 = percentile(lats, 0.4);
  const lon60 = percentile(lons, 0.6);
  const lon40 = percentile(lons, 0.4);
  const citySlug = slugifyCity(input.cityName);

  const rawCandidates: Array<{ key: GeoClusterKey; label: string; slug: string; ids: string[] }> = [
    {
      key: "north",
      label: `North ${input.cityName}`,
      slug: `north-${citySlug}-dog-trails`,
      ids: points.filter((p) => p.lat >= lat60).map((p) => p.id),
    },
    {
      key: "south",
      label: `South ${input.cityName}`,
      slug: `south-${citySlug}-dog-trails`,
      ids: points.filter((p) => p.lat <= lat40).map((p) => p.id),
    },
    {
      key: "east",
      label: `East ${input.cityName}`,
      slug: `east-${citySlug}-dog-trails`,
      ids: points.filter((p) => p.lon >= lon60).map((p) => p.id),
    },
    {
      key: "west",
      label: `West ${input.cityName}`,
      slug: `west-${citySlug}-dog-trails`,
      ids: points.filter((p) => p.lon <= lon40).map((p) => p.id),
    },
  ];

  const trailCount = points.length;
  const candidates: GeoCluster[] = rawCandidates
    .map((candidate) => {
      const uniqueIds = Array.from(new Set(candidate.ids));
      const matchingPoints = points.filter((p) => uniqueIds.includes(p.id));
      const radiusKm = clusterRadiusKm(matchingPoints);
      const coverageShare = uniqueIds.length / trailCount;
      const renderable = uniqueIds.length >= thresholds.minTrailsRender;
      const indexable =
        renderable &&
        uniqueIds.length >= thresholds.minTrailsIndex &&
        coverageShare >= thresholds.minClusterCoverageShare &&
        radiusKm <= thresholds.maxClusterRadiusKm;
      return {
        key: candidate.key,
        label: candidate.label,
        slug: candidate.slug,
        trailIds: uniqueIds,
        matchingCount: uniqueIds.length,
        renderable,
        indexable,
        reason: indexable ? "meets_cluster_quality_thresholds" : "below_cluster_quality_thresholds",
      };
    })
    .filter((cluster) => cluster.renderable)
    .sort((a, b) => b.matchingCount - a.matchingCount);

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const left = candidates[i];
      const right = candidates[j];
      if (!left.indexable || !right.indexable) continue;
      const overlap = overlapRatio(left.trailIds, right.trailIds);
      if (overlap <= thresholds.maxOverlapRatio) continue;
      if (left.matchingCount >= right.matchingCount) {
        right.indexable = false;
        right.reason = "near_duplicate_of_stronger_geo_cluster";
      } else {
        left.indexable = false;
        left.reason = "near_duplicate_of_stronger_geo_cluster";
      }
    }
  }

  return candidates.slice(0, thresholds.maxClustersPerCity);
}
