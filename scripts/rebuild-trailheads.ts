#!/usr/bin/env npx tsx
/**
 * Hybrid trailhead rebuild: OSM + Google Places with strict route-proximity validation.
 *
 * For each trailSystem:
 *   1. Reconstruct geometry from trailSegments
 *   2. Query OSM (Overpass) for access POIs near the bbox
 *   3. Query Google Places for "{systemName} trailhead/park" near the trail centroid
 *   4. Merge candidates from both sources (dedupe by proximity)
 *   5. Score using distance-to-route (hard reject >150m), type, reviews
 *   6. Pick top N, write trailHeads with Google metadata already attached
 *
 * Usage:
 *   npx tsx scripts/rebuild-trailheads.ts \
 *     --city "Austin" --state "TX" \
 *     [--system "slug-filter"] [--limit 50] [--maxPerCluster 3] \
 *     [--dryRun] [--verbose]
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { id as instantId, init } from "@instantdb/admin";

// ── env ─────────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function loadEnvLocal(rootDir: string): void {
  const envPath = join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
    process.env[key] = val;
  }
}
loadEnvLocal(ROOT);

// ── argv ────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
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

const args = parseArgs(process.argv.slice(2));
const cityFilter = typeof args.city === "string" ? args.city : undefined;
const stateFilter = typeof args.state === "string" ? args.state : undefined;
const systemFilter = typeof args.system === "string" ? args.system : undefined;
const limitArg =
  typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
const maxPerCluster =
  typeof args.maxPerCluster === "string"
    ? parseInt(args.maxPerCluster, 10)
    : 3;
const isDryRun = !!args.dryRun;
const isVerbose = !!args.verbose;

// ── credentials ─────────────────────────────────────────────────────────────

const appId = process.env.INSTANT_APP_ID;
const adminToken =
  process.env.INSTANT_APP_ADMIN_TOKEN ||
  process.env.INSTANT_ADMIN_TOKEN ||
  process.env.INSTANTDB_ADMIN_TOKEN;
const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!appId) {
  console.error("Error: INSTANT_APP_ID missing");
  process.exit(1);
}
if (!adminToken) {
  console.error("Error: INSTANT_ADMIN_TOKEN missing");
  process.exit(1);
}
const hasGoogleKey =
  !!googleApiKey &&
  googleApiKey.trim() !== "" &&
  googleApiKey !== "__PASTE_YOUR_KEY_HERE__";
if (!hasGoogleKey) {
  console.warn(
    "WARNING: GOOGLE_MAPS_API_KEY not set — Google Places candidates will be skipped."
  );
}

console.log("=== CONFIG ===");
console.log("appId:          ", appId);
console.log("city:           ", cityFilter ?? "(not set)");
console.log("state:          ", stateFilter ?? "(not set)");
console.log("system:         ", systemFilter ?? "(not set)");
console.log("limit:          ", limitArg ?? "(all)");
console.log("maxPerCluster:  ", maxPerCluster);
console.log("google places:  ", hasGoogleKey ? "enabled" : "DISABLED");
console.log("mode:           ", isDryRun ? "DRY RUN" : "WRITE");
console.log("verbose:        ", isVerbose);
console.log("==============\n");

// ── types ───────────────────────────────────────────────────────────────────

type Coord = [number, number]; // [lon, lat]
type MultiLineCoords = Coord[][];

interface UnifiedCandidate {
  lat: number;
  lon: number;
  name: string | null;
  distToRouteM: number;
  score: number;
  source: "osm" | "google" | "merged";
  osmSource: string | null;
  osmId: string | null;
  osmTags: Record<string, string> | null;
  googlePlaceId: string | null;
  googleName: string | null;
  googleAddress: string | null;
  googleMapsUrl: string | null;
  googleRating: number | null;
  googleReviewCount: number | null;
  googleTypes: string[];
  parkingMeta: Record<string, unknown> | null;
}

interface TrailHeadRecord {
  upsertKey: string;
  name: string;
  lat: number;
  lon: number;
  systemRef: string;
  systemInstantId: string;
  parking: Record<string, unknown> | null;
  raw: Record<string, unknown>;
  googlePlaceId?: string;
  googleCanonicalName?: string;
  googleAddress?: string;
  googleMapsUrl?: string;
  googleRating?: number;
  googleReviewCount?: number;
  googleMatchConfidence?: number;
  googleMatchReason?: string;
}

type PlaceLite = {
  id?: string;
  displayName?: { text?: string };
  types?: string[];
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  googleMapsUri?: string;
};

// ── geo helpers ─────────────────────────────────────────────────────────────

const ROUTE_MAX_DIST_M = 150;

function haversineM(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const p1 = (a[1] * Math.PI) / 180,
    p2 = (b[1] * Math.PI) / 180;
  const dp = ((b[1] - a[1]) * Math.PI) / 180;
  const dl = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function extractLines(geom: any): MultiLineCoords {
  if (!geom?.coordinates) return [];
  if (geom.type === "LineString") return [geom.coordinates as Coord[]];
  if (geom.type === "MultiLineString")
    return geom.coordinates as MultiLineCoords;
  return [];
}

function samplePoints(lines: MultiLineCoords, n = 60): Coord[] {
  const all: Coord[] = [];
  for (const line of lines) for (const pt of line) all.push(pt);
  if (all.length === 0) return [];
  if (all.length <= n) return all;
  const step = Math.floor(all.length / n);
  const out: Coord[] = [];
  for (let i = 0; i < all.length; i += step) out.push(all[i]);
  return out;
}

function minDistToSamples(pt: Coord, samples: Coord[]): number {
  let best = Infinity;
  for (const s of samples) {
    const d = haversineM(pt, s);
    if (d < best) best = d;
  }
  return best;
}

function bboxOfLines(
  lines: MultiLineCoords,
  bufDeg = 0.003
): [number, number, number, number] | null {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const line of lines)
    for (const [lon, lat] of line) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  if (minLon === Infinity) return null;
  return [minLon - bufDeg, minLat - bufDeg, maxLon + bufDeg, maxLat + bufDeg];
}

function centroidOfLines(lines: MultiLineCoords): Coord | null {
  let sumLon = 0,
    sumLat = 0,
    count = 0;
  for (const line of lines)
    for (const [lon, lat] of line) {
      sumLon += lon;
      sumLat += lat;
      count++;
    }
  if (count === 0) return null;
  return [sumLon / count, sumLat / count];
}

function collectEndpoints(lines: MultiLineCoords): Coord[] {
  const pts: Coord[] = [];
  for (const line of lines) {
    if (line.length === 0) continue;
    pts.push(line[0]);
    if (line.length > 1) pts.push(line[line.length - 1]);
  }
  return pts;
}

function clusterByProximity(pts: Coord[], thresholdM = 50): Coord[][] {
  const clusters: Coord[][] = [];
  for (const pt of pts) {
    let placed = false;
    for (const cluster of clusters) {
      const c = clusterCentroid(cluster);
      if (haversineM(pt, c) <= thresholdM) {
        cluster.push(pt);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([pt]);
  }
  clusters.sort((a, b) => b.length - a.length);
  return clusters;
}

function clusterCentroid(pts: Coord[]): Coord {
  let sumLon = 0,
    sumLat = 0;
  for (const [lon, lat] of pts) {
    sumLon += lon;
    sumLat += lat;
  }
  return [sumLon / pts.length, sumLat / pts.length];
}

// ── Overpass ────────────────────────────────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function overpassPost(query: string): Promise<any[]> {
  const RETRIES = 3;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    for (const ep of OVERPASS_ENDPOINTS) {
      try {
        const resp = await fetch(ep, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(90_000),
        });
        if (resp.status === 429 || resp.status === 504) {
          await sleep(attempt * 12_000);
          continue;
        }
        if (!resp.ok) continue;
        const json: any = await resp.json();
        return json.elements ?? [];
      } catch (err: any) {
        if (attempt < RETRIES) await sleep(6_000 * attempt);
      }
    }
  }
  return [];
}

function accessPOIQuery([minLon, minLat, maxLon, maxLat]: [
  number,
  number,
  number,
  number,
]): string {
  const b = `${minLat},${minLon},${maxLat},${maxLon}`;
  return `[out:json][timeout:60];
(
  node["highway"="trailhead"](${b});
  way["highway"="trailhead"](${b});
  node["amenity"="parking"](${b});
  way["amenity"="parking"](${b});
  node["entrance"](${b});
  node["barrier"="gate"](${b});
  node["information"~"guidepost|map|board"](${b});
  node["tourism"="information"](${b});
);
out center tags;`;
}

function elementLocation(el: any): Coord | null {
  if (el.type === "node" && el.lat != null) return [el.lon, el.lat];
  if (el.center?.lat != null) return [el.center.lon, el.center.lat];
  return null;
}

function classifyOsmSource(tags: Record<string, string>): string | null {
  if (tags.highway === "trailhead") return "osm:trailhead";
  if (tags.amenity === "parking") return "osm:parking";
  if (tags.entrance !== undefined) return "osm:entrance";
  if (tags.barrier === "gate") return "osm:gate";
  if (
    tags.information === "guidepost" ||
    tags.information === "map" ||
    tags.information === "board" ||
    tags.tourism === "information"
  )
    return "osm:information";
  return null;
}

function osmTypeScore(tags: Record<string, string>): number {
  let s = 0;
  if (tags.highway === "trailhead") s += 4;
  if (tags.amenity === "parking") s += 4;
  if (tags.entrance !== undefined || tags.barrier === "gate") s += 2;
  if (
    tags.information === "guidepost" ||
    tags.information === "map" ||
    tags.information === "board" ||
    tags.tourism === "information"
  )
    s += 1;
  if (tags.name) s += 1;
  if (tags.capacity) s += 1;
  return s;
}

const KEPT_TAGS = new Set([
  "name",
  "highway",
  "amenity",
  "entrance",
  "barrier",
  "information",
  "tourism",
  "capacity",
  "fee",
  "access",
  "opening_hours",
  "operator",
]);

function trimTags(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of KEPT_TAGS) if (raw[k] != null) out[k] = raw[k];
  return out;
}

// ── Google Places ───────────────────────────────────────────────────────────

const GOOGLE_BASE = "https://places.googleapis.com/v1";
const API_MIN_DELAY_MS = 300;
const API_MAX_RETRIES = 3;
const GOOGLE_SEARCH_RADIUS_M = 600;
const CANONICAL_TYPES = new Set([
  "park",
  "tourist_attraction",
  "natural_feature",
  "campground",
  "hiking_area",
]);

let lastApiCallAt = 0;

async function throttleApiCall(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastApiCallAt;
  if (elapsed < API_MIN_DELAY_MS) await sleep(API_MIN_DELAY_MS - elapsed);
  lastApiCallAt = Date.now();
}

async function googleRequest<T>(
  path: string,
  init: RequestInit,
  fieldMask: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= API_MAX_RETRIES; attempt++) {
    try {
      await throttleApiCall();
      const headers: Record<string, string> = {
        "X-Goog-Api-Key": googleApiKey!,
        "X-Goog-FieldMask": fieldMask,
      };
      if (init.body !== undefined) headers["Content-Type"] = "application/json";

      const resp = await fetch(`${GOOGLE_BASE}${path}`, {
        ...init,
        headers: {
          ...headers,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (resp.ok) return (await resp.json()) as T;

      const retryable =
        resp.status === 429 || (resp.status >= 500 && resp.status <= 599);
      if (retryable && attempt < API_MAX_RETRIES) {
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      const bodyText = await resp.text();
      throw new Error(
        `Google Places request failed (${resp.status}) ${bodyText}`
      );
    } catch (err) {
      lastError = err;
      if (attempt < API_MAX_RETRIES) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Google Places request failed");
}

async function searchGooglePlaces(
  textQuery: string,
  lat: number,
  lon: number,
  radiusM: number
): Promise<PlaceLite[]> {
  const body = {
    textQuery,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: radiusM,
      },
    },
    maxResultCount: 10,
  };
  const res = await googleRequest<{ places?: PlaceLite[] }>(
    "/places:searchText",
    { method: "POST", body: JSON.stringify(body) },
    "places.id,places.displayName,places.types,places.primaryType,places.rating,places.userRatingCount,places.location,places.formattedAddress,places.googleMapsUri"
  );
  return res.places ?? [];
}

// ── unified candidate building ──────────────────────────────────────────────

function buildOsmCandidates(
  elements: any[],
  routeSamples: Coord[]
): UnifiedCandidate[] {
  const candidates: UnifiedCandidate[] = [];
  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {};
    const osmSource = classifyOsmSource(tags);
    if (!osmSource) continue;
    const loc = elementLocation(el);
    if (!loc) continue;
    const distToRouteM = minDistToSamples(loc, routeSamples);
    if (distToRouteM > ROUTE_MAX_DIST_M) continue;

    const parkingMeta: Record<string, unknown> | null =
      osmSource === "osm:parking"
        ? {
            osmId: `${el.type}/${el.id}`,
            capacity: tags.capacity ? parseInt(tags.capacity, 10) || null : null,
            fee: tags.fee ?? null,
            access: tags.access ?? null,
          }
        : null;

    candidates.push({
      lat: loc[1],
      lon: loc[0],
      name: tags.name ?? null,
      distToRouteM: parseFloat(distToRouteM.toFixed(1)),
      score: osmTypeScore(tags),
      source: "osm",
      osmSource,
      osmId: `${el.type}/${el.id}`,
      osmTags: trimTags(tags),
      googlePlaceId: null,
      googleName: null,
      googleAddress: null,
      googleMapsUrl: null,
      googleRating: null,
      googleReviewCount: null,
      googleTypes: [],
      parkingMeta,
    });
  }
  return candidates;
}

function buildGoogleCandidates(
  places: PlaceLite[],
  routeSamples: Coord[]
): UnifiedCandidate[] {
  const candidates: UnifiedCandidate[] = [];
  for (const place of places) {
    const lat = place.location?.latitude;
    const lon = place.location?.longitude;
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const loc: Coord = [lon, lat];
    const distToRouteM = minDistToSamples(loc, routeSamples);
    if (distToRouteM > ROUTE_MAX_DIST_M) continue;

    const types = [
      place.primaryType,
      ...(place.types ?? []),
    ].filter(Boolean) as string[];

    candidates.push({
      lat,
      lon,
      name: place.displayName?.text ?? null,
      distToRouteM: parseFloat(distToRouteM.toFixed(1)),
      score: 0,
      source: "google",
      osmSource: null,
      osmId: null,
      osmTags: null,
      googlePlaceId: place.id ?? null,
      googleName: place.displayName?.text ?? null,
      googleAddress: place.formattedAddress ?? null,
      googleMapsUrl: place.googleMapsUri ?? null,
      googleRating: typeof place.rating === "number" ? place.rating : null,
      googleReviewCount:
        typeof place.userRatingCount === "number"
          ? place.userRatingCount
          : null,
      googleTypes: types,
      parkingMeta: null,
    });
  }
  return candidates;
}

const MERGE_RADIUS_M = 60;

function mergeCandidates(
  osmCandidates: UnifiedCandidate[],
  googleCandidates: UnifiedCandidate[]
): UnifiedCandidate[] {
  const merged: UnifiedCandidate[] = [];
  const usedGoogle = new Set<number>();

  for (const osm of osmCandidates) {
    let bestGIdx = -1;
    let bestDist = MERGE_RADIUS_M;
    for (let i = 0; i < googleCandidates.length; i++) {
      if (usedGoogle.has(i)) continue;
      const g = googleCandidates[i];
      const d = haversineM([osm.lon, osm.lat], [g.lon, g.lat]);
      if (d < bestDist) {
        bestDist = d;
        bestGIdx = i;
      }
    }

    if (bestGIdx >= 0) {
      const g = googleCandidates[bestGIdx];
      usedGoogle.add(bestGIdx);
      merged.push({
        ...osm,
        lat: g.lat,
        lon: g.lon,
        distToRouteM: Math.min(osm.distToRouteM, g.distToRouteM),
        source: "merged",
        name: g.googleName ?? osm.name,
        googlePlaceId: g.googlePlaceId,
        googleName: g.googleName,
        googleAddress: g.googleAddress,
        googleMapsUrl: g.googleMapsUrl,
        googleRating: g.googleRating,
        googleReviewCount: g.googleReviewCount,
        googleTypes: g.googleTypes,
      });
    } else {
      merged.push(osm);
    }
  }

  for (let i = 0; i < googleCandidates.length; i++) {
    if (!usedGoogle.has(i)) merged.push(googleCandidates[i]);
  }

  return merged;
}

function scoreUnified(c: UnifiedCandidate): number {
  let s = 0;

  if (c.distToRouteM <= 30) s += 10;
  else if (c.distToRouteM <= 60) s += 8;
  else if (c.distToRouteM <= 100) s += 5;
  else s += 2;

  if (c.osmSource === "osm:trailhead") s += 4;
  else if (c.osmSource === "osm:parking") s += 3;
  else if (c.osmSource === "osm:entrance" || c.osmSource === "osm:gate") s += 2;
  else if (c.osmSource === "osm:information") s += 1;

  const typesSet = new Set(c.googleTypes);
  if ([...typesSet].some((t) => CANONICAL_TYPES.has(t))) s += 2;

  if (c.googleReviewCount && c.googleReviewCount > 0) s += 1;
  if (c.googleReviewCount && c.googleReviewCount > 50) s += 1;
  if (c.googleRating && c.googleRating >= 4.0) s += 1;

  const nameStr = (c.googleName ?? c.name ?? "").toLowerCase();
  if (nameStr.includes("trail") || nameStr.includes("trailhead")) s += 2;

  if (c.source === "merged") s += 2;

  return s;
}

function dedupeByProximity(
  candidates: UnifiedCandidate[],
  thresholdM = 80
): UnifiedCandidate[] {
  const kept: UnifiedCandidate[] = [];
  for (const c of candidates) {
    const tooClose = kept.some(
      (k) => haversineM([c.lon, c.lat], [k.lon, k.lat]) < thresholdM
    );
    if (!tooClose) kept.push(c);
  }
  return kept;
}

// ── record builder ──────────────────────────────────────────────────────────

function buildRecords(
  candidates: UnifiedCandidate[],
  system: any,
  maxN: number,
  computedAt: number
): TrailHeadRecord[] {
  return candidates.slice(0, maxN).map((c, i) => {
    const rank = i + 1;
    const sourceLabel = c.osmSource ?? `google:${c.googlePlaceId ?? "place"}`;
    const upsertKey = `${system.extSystemRef}::${sourceLabel}::${rank}`;

    return {
      upsertKey,
      name: c.name ?? `Trailhead #${rank}`,
      lat: c.lat,
      lon: c.lon,
      systemRef: system.extSystemRef,
      systemInstantId: system.id,
      parking: c.parkingMeta,
      raw: {
        source: c.source,
        osmSource: c.osmSource,
        osmId: c.osmId,
        osmTags: c.osmTags,
        rank,
        distToRouteM: c.distToRouteM,
        score: c.score,
        systemRef: system.extSystemRef,
        systemSlug: system.slug ?? null,
        systemName: system.name ?? null,
        computedAt,
      },
      ...(c.googlePlaceId && { googlePlaceId: c.googlePlaceId }),
      ...(c.googleName && { googleCanonicalName: c.googleName }),
      ...(c.googleAddress && { googleAddress: c.googleAddress }),
      ...(c.googleMapsUrl && { googleMapsUrl: c.googleMapsUrl }),
      ...(c.googleRating != null && { googleRating: c.googleRating }),
      ...(c.googleReviewCount != null && {
        googleReviewCount: c.googleReviewCount,
      }),
      ...(c.googlePlaceId && {
        googleMatchConfidence: c.source === "merged" ? 0.8 : 0.5,
        googleMatchReason: `hybrid;distToRouteM=${c.distToRouteM};source=${c.source}`,
      }),
    };
  });
}

function buildFallbackRecords(
  lines: MultiLineCoords,
  system: any,
  maxN: number,
  computedAt: number
): TrailHeadRecord[] {
  const endpoints = collectEndpoints(lines);
  const clusters = clusterByProximity(endpoints, 50);
  return clusters.slice(0, maxN).map((cl, i) => {
    const [lon, lat] = clusterCentroid(cl);
    const rank = i + 1;
    const upsertKey = `${system.extSystemRef}::derived:endpoints::${rank}`;
    return {
      upsertKey,
      name: `${system.name ?? "Trail"} Endpoint #${rank}`,
      lat,
      lon,
      systemRef: system.extSystemRef,
      systemInstantId: system.id,
      parking: null,
      raw: {
        source: "derived:endpoints",
        rank,
        clusterSize: cl.length,
        systemRef: system.extSystemRef,
        systemSlug: system.slug ?? null,
        systemName: system.name ?? null,
        computedAt,
      },
    };
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────

function entityList(res: any, name: string): any[] {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });
  console.log("Admin SDK initialized OK\n");

  console.log("Fetching trailSystems...");
  const sysRes = await db.query({ trailSystems: { $: { limit: 5000 } } });
  let systems = entityList(sysRes, "trailSystems");
  console.log(`  Total systems in DB: ${systems.length}`);

  if (cityFilter) {
    const n = cityFilter.toLowerCase();
    systems = systems.filter((s: any) =>
      (s.city ?? "").toLowerCase().includes(n)
    );
    console.log(`  After city="${cityFilter}": ${systems.length}`);
  }
  if (stateFilter) {
    const n = stateFilter.toLowerCase();
    systems = systems.filter(
      (s: any) => !s.state || s.state.toLowerCase().includes(n)
    );
    console.log(`  After state="${stateFilter}": ${systems.length}`);
  }
  if (systemFilter) {
    const n = systemFilter.toLowerCase();
    systems = systems.filter(
      (s: any) =>
        (s.slug ?? "").toLowerCase().includes(n) ||
        (s.name ?? "").toLowerCase().includes(n) ||
        (s.extSystemRef ?? "").toLowerCase().includes(n)
    );
    console.log(`  After system="${systemFilter}": ${systems.length}`);
  }
  if (limitArg && !Number.isNaN(limitArg) && limitArg > 0) {
    systems = systems.slice(0, limitArg);
    console.log(`  After --limit ${limitArg}: ${systems.length}`);
  }
  if (systems.length === 0) {
    console.log("\nNothing to do.");
    return;
  }

  console.log("\nFetching trailSegments...");
  const segRes = await db.query({ trailSegments: { $: { limit: 50000 } } });
  const allSegs = entityList(segRes, "trailSegments");
  console.log(`  Total segments in DB: ${allSegs.length}`);

  const segsByRef = new Map<string, any[]>();
  for (const seg of allSegs) {
    if (!seg.systemRef) continue;
    if (!segsByRef.has(seg.systemRef)) segsByRef.set(seg.systemRef, []);
    segsByRef.get(seg.systemRef)!.push(seg);
  }

  console.log("\nFetching existing trailHeads...");
  const thRes = await db.query({ trailHeads: { $: { limit: 50000 } } });
  const existingTHs = entityList(thRes, "trailHeads");
  const existingMap = new Map<string, string>();
  for (const th of existingTHs) {
    if (th.trailSlug) existingMap.set(th.trailSlug, th.id);
  }
  console.log(`  Existing trailHeads: ${existingTHs.length}`);

  const COL = 110;
  console.log(`\n${"─".repeat(COL)}`);
  console.log(
    "STATUS".padEnd(16) +
      "SYSTEM".padEnd(42) +
      "OSM".padStart(5) +
      "GOOG".padStart(6) +
      "MRGD".padStart(6) +
      "KEPT".padStart(6) +
      "  SOURCE".padStart(24)
  );
  console.log("─".repeat(COL));

  let processed = 0;
  let skippedNoGeom = 0;
  let hybridCount = 0;
  let osmOnlyCount = 0;
  let googleOnlyCount = 0;
  let fallbackCount = 0;
  let totalHeads = 0;
  const pendingWrites: TrailHeadRecord[] = [];
  const computedAt = Date.now();

  for (const system of systems) {
    const label = (system.slug ?? system.name ?? system.id).slice(0, 40);

    const segs = segsByRef.get(system.extSystemRef) ?? [];
    const systemLines: MultiLineCoords = [];
    for (const seg of segs) {
      if (!seg.geometry) continue;
      try {
        systemLines.push(...extractLines(seg.geometry));
      } catch {
        /* skip */
      }
    }

    if (systemLines.length === 0) {
      console.log(`${"SKIP (no geom)".padEnd(16)}${label}`);
      skippedNoGeom++;
      continue;
    }

    const bbox = bboxOfLines(systemLines, 0.003);
    if (!bbox) {
      console.log(`${"SKIP (no bbox)".padEnd(16)}${label}`);
      skippedNoGeom++;
      continue;
    }

    const routeSamples = samplePoints(systemLines, 60);
    const centroid = centroidOfLines(systemLines);

    // ── OSM candidates ──
    let osmCandidates: UnifiedCandidate[] = [];
    try {
      const elements = await overpassPost(accessPOIQuery(bbox));
      osmCandidates = buildOsmCandidates(elements, routeSamples);
      await sleep(800);
    } catch {
      /* continue without OSM */
    }

    // ── Google candidates ──
    let googleCandidates: UnifiedCandidate[] = [];
    if (hasGoogleKey && centroid) {
      try {
        const systemName = system.name ?? system.slug ?? "trail";
        const q1 = `${systemName} trailhead`;
        const places1 = await searchGooglePlaces(
          q1,
          centroid[1],
          centroid[0],
          GOOGLE_SEARCH_RADIUS_M
        );
        let allPlaces = [...places1];

        const q2 = `${systemName} park`;
        const places2 = await searchGooglePlaces(
          q2,
          centroid[1],
          centroid[0],
          GOOGLE_SEARCH_RADIUS_M
        );
        const seenIds = new Set(allPlaces.map((p) => p.id));
        for (const p of places2) {
          if (!seenIds.has(p.id)) allPlaces.push(p);
        }

        googleCandidates = buildGoogleCandidates(allPlaces, routeSamples);
      } catch (err: any) {
        if (isVerbose)
          console.warn(`    Google Places error for "${label}": ${err.message}`);
      }
    }

    // ── Merge ──
    const merged = mergeCandidates(osmCandidates, googleCandidates);

    // ── Score ──
    for (const c of merged) {
      c.score = scoreUnified(c);
    }
    merged.sort((a, b) => b.score - a.score || a.distToRouteM - b.distToRouteM);

    // ── Deduplicate nearby candidates ──
    const deduped = dedupeByProximity(merged, 80);

    let records: TrailHeadRecord[];
    let sourceLabel: string;

    if (deduped.length > 0) {
      records = buildRecords(deduped, system, maxPerCluster, computedAt);
      const sources = records.map(
        (r) => (r.raw as { source?: string }).source ?? "?"
      );
      sourceLabel = [...new Set(sources)].join("+");

      const hasMerged = deduped.some((c) => c.source === "merged");
      const hasOsm = deduped.some((c) => c.source === "osm");
      const hasGoogle = deduped.some((c) => c.source === "google");
      if (hasMerged) hybridCount++;
      else if (hasOsm && !hasGoogle) osmOnlyCount++;
      else if (hasGoogle && !hasOsm) googleOnlyCount++;
      else if (hasOsm && hasGoogle) hybridCount++;
      else osmOnlyCount++;
    } else {
      records = buildFallbackRecords(
        systemLines,
        system,
        maxPerCluster,
        computedAt
      );
      if (records.length === 0) {
        console.log(`${"SKIP (no heads)".padEnd(16)}${label}`);
        skippedNoGeom++;
        continue;
      }
      sourceLabel = "fallback";
      fallbackCount++;
    }

    processed++;
    totalHeads += records.length;
    pendingWrites.push(...records);

    const status = isDryRun ? "WOULD WRITE" : "WRITE";
    console.log(
      `${status.padEnd(16)}${label.padEnd(42)}` +
        `${String(osmCandidates.length).padStart(5)}` +
        `${String(googleCandidates.length).padStart(6)}` +
        `${String(merged.length).padStart(6)}` +
        `${String(records.length).padStart(6)}` +
        `  ${sourceLabel.slice(0, 22)}`
    );

    if (isVerbose) {
      for (const r of records) {
        console.log(
          `    [rank${(r.raw as any).rank}] ${r.name.slice(0, 40)} ` +
            `@(${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}) ` +
            `dist=${(r.raw as any).distToRouteM}m ` +
            `score=${(r.raw as any).score} ` +
            `src=${(r.raw as any).source}` +
            (r.googlePlaceId ? ` gp=${r.googlePlaceId}` : "")
        );
      }
    }
  }

  console.log("─".repeat(COL));

  console.log("\n=== REBUILD TRAILHEADS SUMMARY ===");
  console.log(`Systems processed:          ${processed}`);
  console.log(`Systems skipped (no geom):  ${skippedNoGeom}`);
  console.log(`Systems hybrid (OSM+Goog):  ${hybridCount}`);
  console.log(`Systems OSM only:           ${osmOnlyCount}`);
  console.log(`Systems Google only:        ${googleOnlyCount}`);
  console.log(`Systems fallback:           ${fallbackCount}`);
  console.log(`Total trailHeads to write:  ${totalHeads}`);
  console.log(`Existing trailHeads in DB:  ${existingTHs.length}`);
  const toUpdate = pendingWrites.filter((r) =>
    existingMap.has(r.upsertKey)
  ).length;
  const toCreate = pendingWrites.filter(
    (r) => !existingMap.has(r.upsertKey)
  ).length;
  console.log(`  → UPDATE (existing):      ${toUpdate}`);
  console.log(`  → CREATE (new):           ${toCreate}`);

  if (isDryRun) {
    console.log("\nDRY RUN: no writes performed.");
    console.log("Omit --dryRun to persist changes to InstantDB.");
    return;
  }

  if (pendingWrites.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  console.log(`\nUpserting ${pendingWrites.length} trailHead(s)...`);
  const BATCH = 50;
  let written = 0;

  for (let i = 0; i < pendingWrites.length; i += BATCH) {
    const chunk = pendingWrites.slice(i, i + BATCH);
    const txSteps = chunk.flatMap((r) => {
      const existingInstantId = existingMap.get(r.upsertKey);
      const recordId = existingInstantId ?? instantId();

      const data: Record<string, any> = {
        trailSlug: r.upsertKey,
        name: r.name,
        lat: r.lat,
        lon: r.lon,
        systemRef: r.systemRef,
        raw: r.raw,
      };
      if (r.parking !== null) data.parking = r.parking;
      if (r.googlePlaceId) data.googlePlaceId = r.googlePlaceId;
      if (r.googleCanonicalName)
        data.googleCanonicalName = r.googleCanonicalName;
      if (r.googleAddress) data.googleAddress = r.googleAddress;
      if (r.googleMapsUrl) data.googleMapsUrl = r.googleMapsUrl;
      if (r.googleRating != null) data.googleRating = r.googleRating;
      if (r.googleReviewCount != null)
        data.googleReviewCount = r.googleReviewCount;
      if (r.googleMatchConfidence != null)
        data.googleMatchConfidence = r.googleMatchConfidence;
      if (r.googleMatchReason) data.googleMatchReason = r.googleMatchReason;

      return [
        (db as any).tx.trailHeads[recordId].update(data),
        (db as any).tx.trailHeads[recordId].link({
          system: r.systemInstantId,
        }),
      ];
    });

    await db.transact(txSteps);
    written += chunk.length;
    console.log(`  Written ${written}/${pendingWrites.length}...`);
  }

  console.log(`\nDone. ${written} trailHead(s) upserted.`);
  console.log("===================================");
}

main().catch((err) => {
  console.error(err);
  if ((err as any)?.body)
    console.error("API body:", JSON.stringify((err as any).body, null, 2));
  process.exit(1);
});
