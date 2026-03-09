import "server-only";
import { cache } from "react";
import { adminDb } from "@/lib/instant/admin";
import { explodeSegmentsToParts, haversineMeters, type LatLngTuple } from "@/lib/geo/stitchSegments";
import { timed, roughSizeKB, logPayloadIfEnabled } from "@/lib/perf";

const PERF_ENABLED = process.env.PERF_LOG === "1";
const TRAIL_PAYLOAD_WARN_KB = 512;

/** Full trail payload used by trail detail page model + metadata. */
export type TrailSystemForPage = {
  id: string;
  name: string;
  slug: string;
  city?: string;
  state?: string;
  county?: string;
  extSystemRef?: string;
  raw?: unknown;
  [key: string]: unknown;
};

/** Minimal shape for a trailhead row used by TrailheadsSection. */
export type TrailHeadRow = {
  id: string;
  name?: string;
  lat?: number;
  lon?: number;
  googleMapsUrl?: string;
  googleAddress?: string;
  googleCanonicalName?: string;
  googlePhotoUri?: string;
  googlePhotoName?: string;
  googleRating?: number;
  googleReviewCount?: number;
  googleOpenNow?: boolean;
  googleWeekdayText?: string[] | unknown;
  googleMatchConfidence?: number;
  googleMatchReason?: string;
  googleBusinessStatus?: string;
  googleLastSyncAt?: string | number;
  googlePlaceId?: string;
  googlePhone?: string;
  googleWebsite?: string;
  parking?: { fee?: string; capacity?: number; access?: string; osmId?: string } | unknown;
  headFeeLikely?: boolean;
  headFeeReason?: string;
  headAccessClass?: string;
  headHoursText?: string[] | unknown;
  headOpenNow?: boolean;
  isPrimary?: boolean;
  raw?: { rank?: number; systemSlug?: string; distanceMeters?: number; source?: string; osmId?: string; osmType?: string; computedAt?: string | number; osmTags?: Record<string, unknown>; [key: string]: unknown };
  systemRef?: string;
  trailSlug?: string;
  [key: string]: unknown;
};

export type TrailSegmentRow = {
  id: string;
  name?: string;
  surface?: string;
  width?: number;
  lengthMiles?: number;
  systemSlug?: string;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  } | null;
  [key: string]: unknown;
};

const PAGE_FIELDS = [
  "id",
  "amenitiesCounts",
  "amenitiesIndexScore",
  "amenityPoints",
  "asphaltPercent",
  "bbox",
  "centroid",
  "city",
  "county",
  "crowdClass",
  "crowdProxyScore",
  "crowdReasons",
  "crowdSignals",
  "dogsAllowed",
  "elevationGainFt",
  "elevationLossFt",
  "elevationMaxFt",
  "elevationMinFt",
  "elevationProfile",
  "extSystemRef",
  "faqs",
  "gradeP50",
  "gradeP90",
  "hazardPoints",
  "hazards",
  "hazardsClass",
  "hazardsReasons",
  "hazardsScore",
  "heatRisk",
  "highlights",
  "highlightPoints",
  "highlightsByType",
  "highlightsCount",
  "leashDetails",
  "leashPolicy",
  "lengthMilesTotal",
  "litKnownSamples",
  "litPercentKnown",
  "litYesSamples",
  "mudRisk",
  "mudRiskReason",
  "mudRiskScore",
  "name",
  "naturalSurfacePercent",
  "nightClass",
  "nightFriendly",
  "nightReasons",
  "nightScore",
  "nightWinterSignals",
  "parkingCapacityEstimate",
  "parkingCount",
  "parkingFeeKnown",
  "pavedPercentProxy",
  "policyConfidence",
  "policyMethod",
  "policyNotes",
  "policySourceTitle",
  "policySourceUrl",
  "policyVerifiedAt",
  "reactiveDogFriendly",
  "roughnessRisk",
  "segmentCount",
  "shadeClass",
  "shadeProxyPercent",
  "shadeProxyScore",
  "shadeSources",
  "shadeProfile",
  "safety",
  "accessPoints",
  "accessRules",
  "accessRulesClass",
  "accessRulesReasons",
  "accessRulesScore",
  "bailoutClass",
  "bailoutPoints",
  "bailoutReasons",
  "bailoutScore",
  "loopStats",
  "routeType",
  "slug",
  "state",
  "streetLampCountNearTrail",
  "surfaceBreakdown",
  "surfaceSummary",
  "surfaceProfile",
  "swimAccessPoints",
  "swimAccessPointsByType",
  "swimAccessPointsCount",
  "swimLikely",
  "trailheadPOIs",
  "waterNearPercent",
  "waterNearScore",
  "waterProfile",
  "waterTypesNearby",
  "widthSummary",
  "winterClass",
  "winterLikelyMaintained",
  "winterReasons",
  "winterScore",
  "winterTagFound",
  "seoContent",
] as const;

function normalizeResult(res: unknown): TrailSystemForPage[] {
  const r = res as { trailSystems?: unknown[] | { data?: unknown[] } };
  const raw = Array.isArray(r?.trailSystems)
    ? r.trailSystems
    : (r?.trailSystems as { data?: unknown[] })?.data ?? [];
  return (Array.isArray(raw) ? raw : []) as TrailSystemForPage[];
}

function normalizeTrailHeads(res: unknown): TrailHeadRow[] {
  const r = res as { trailHeads?: unknown[] | { data?: unknown[] } };
  const raw = Array.isArray(r?.trailHeads)
    ? r.trailHeads
    : (r?.trailHeads as { data?: unknown[] })?.data ?? [];
  return (Array.isArray(raw) ? raw : []) as TrailHeadRow[];
}

function normalizeTrailSegments(res: unknown): TrailSegmentRow[] {
  const r = res as { trailSegments?: unknown[] | { data?: unknown[] } };
  const raw = Array.isArray(r?.trailSegments)
    ? r.trailSegments
    : (r?.trailSegments as { data?: unknown[] })?.data ?? [];
  return (Array.isArray(raw) ? raw : []) as TrailSegmentRow[];
}

function warnIfLargePayload(trail: TrailSystemForPage | null): void {
  if (!PERF_ENABLED || !trail) return;
  const kb = roughSizeKB(trail);
  if (kb > TRAIL_PAYLOAD_WARN_KB) {
    console.log(`[perf][warn] trail payload large ~${kb.toFixed(1)}kb`);
  }
}

async function queryTrailById(id: string): Promise<TrailSystemForPage | null> {
  const label = `db:trailSystems page by id (${id.slice(0, 8)}...)`;
  const res = await timed(label, () =>
    adminDb.query({
      trailSystems: {
        $: {
          where: { id },
          limit: 1,
          fields: [...PAGE_FIELDS],
        },
      },
    } as Parameters<typeof adminDb.query>[0])
  );
  logPayloadIfEnabled(label, res);
  const list = normalizeResult(res);
  const trail = list.find((s) => String(s?.id ?? "") === id) ?? list[0] ?? null;
  warnIfLargePayload(trail);
  return trail;
}

async function queryTrailByIdTail(tail: string): Promise<TrailSystemForPage | null> {
  const label = "db:trailSystems page by idTail (trail)";
  const res = await timed(label, () =>
    adminDb.query({
      trailSystems: {
        $: {
          limit: 5000,
          fields: [...PAGE_FIELDS],
        },
      },
    } as Parameters<typeof adminDb.query>[0])
  );
  logPayloadIfEnabled(label, res);
  const list = normalizeResult(res);
  const trail = list.find((s) => String(s?.id ?? "").toLowerCase().endsWith(tail)) ?? null;
  warnIfLargePayload(trail);
  return trail;
}

const TRAIL_HEADS_LIMIT = 2000;
const TRAIL_SEGMENTS_LIMIT = 5000;
const TRAIL_SEGMENT_FIELDS = [
  "id",
  "name",
  "surface",
  "width",
  "lengthMiles",
  "systemSlug",
  "geometry",
] as const;
const TRAIL_HEAD_FIELDS = [
  "id",
  "name",
  "lat",
  "lon",
  "googleMapsUrl",
  "googleAddress",
  "googleCanonicalName",
  "googlePhotoUri",
  "googlePhotoName",
  "googlePlaceId",
  "googlePhone",
  "googleRating",
  "googleReviewCount",
  "googleWebsite",
  "headHoursText",
  "parking",
  "systemRef",
  "trailSlug",
  "raw",
  "isPrimary",
] as const;
const TRAILHEAD_ROUTE_BUFFER_METERS = 250;

export type TrailHeadMapSelection =
  | "systemRef"
  | "trailSlug"
  | "raw.systemSlug"
  | "raw.systemName"
  | "withinRouteBuffer"
  | "none";

function dedupeTrailHeads(heads: TrailHeadRow[]): TrailHeadRow[] {
  const seen = new Set<string>();
  const out: TrailHeadRow[] = [];
  for (const head of heads) {
    const id = String(head?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(head);
  }
  return out;
}

async function queryTrailHeadsByField(
  where: Record<string, string>
): Promise<TrailHeadRow[]> {
  const res = await adminDb.query({
    trailHeads: {
      $: {
        where,
        limit: TRAIL_HEADS_LIMIT,
        fields: [...TRAIL_HEAD_FIELDS],
      },
    },
  } as Parameters<typeof adminDb.query>[0]);
  return normalizeTrailHeads(res);
}

async function queryTrailHeadsCandidates(): Promise<TrailHeadRow[]> {
  const res = await adminDb.query({
    trailHeads: {
      $: {
        limit: TRAIL_SEGMENTS_LIMIT,
        fields: [...TRAIL_HEAD_FIELDS],
      },
    },
  } as Parameters<typeof adminDb.query>[0]);
  return normalizeTrailHeads(res);
}

function matchesRawSystemSlug(head: TrailHeadRow, systemSlug: string): boolean {
  const raw = head.raw && typeof head.raw === "object" ? head.raw : null;
  return String((raw as { systemSlug?: unknown } | null)?.systemSlug ?? "").trim().toLowerCase() ===
    systemSlug.trim().toLowerCase();
}

function matchesRawSystemName(head: TrailHeadRow, systemName: string): boolean {
  const raw = head.raw && typeof head.raw === "object" ? head.raw : null;
  return String((raw as { systemName?: unknown } | null)?.systemName ?? "").trim().toLowerCase() ===
    systemName.trim().toLowerCase();
}

function buildRoutePointIndex(points: LatLngTuple[], radiusMeters: number): Map<string, LatLngTuple[]> {
  const bucketSize = Math.max(radiusMeters, 1);
  const buckets = new Map<string, LatLngTuple[]>();

  for (const point of points) {
    const latMeters = point[0] * 111_320;
    const lonMeters = point[1] * 111_320 * Math.cos((point[0] * Math.PI) / 180);
    const key = `${Math.floor(latMeters / bucketSize)}:${Math.floor(lonMeters / bucketSize)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), point]);
  }

  return buckets;
}

function filterTrailHeadsNearRoute(
  heads: TrailHeadRow[],
  segments: TrailSegmentRow[],
  radiusMeters: number
): TrailHeadRow[] {
  const parts = explodeSegmentsToParts(segments);
  const routePoints = parts.flatMap((part) => part.points);
  if (routePoints.length === 0) return [];

  let minLat = routePoints[0][0];
  let maxLat = routePoints[0][0];
  let minLon = routePoints[0][1];
  let maxLon = routePoints[0][1];

  for (const [lat, lon] of routePoints) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  const meanLat = (minLat + maxLat) / 2;
  const latPad = radiusMeters / 111_320;
  const lonPad = radiusMeters / Math.max(111_320 * Math.cos((meanLat * Math.PI) / 180), 1);
  const pointBuckets = buildRoutePointIndex(routePoints, radiusMeters);

  return heads.filter((head) => {
    const lat = typeof head.lat === "number" && Number.isFinite(head.lat) ? head.lat : null;
    const lon = typeof head.lon === "number" && Number.isFinite(head.lon) ? head.lon : null;
    if (lat == null || lon == null) return false;

    if (
      lat < minLat - latPad ||
      lat > maxLat + latPad ||
      lon < minLon - lonPad ||
      lon > maxLon + lonPad
    ) {
      return false;
    }

    const latMeters = lat * 111_320;
    const lonMeters = lon * 111_320 * Math.cos((lat * Math.PI) / 180);
    const baseLat = Math.floor(latMeters / radiusMeters);
    const baseLon = Math.floor(lonMeters / radiusMeters);

    for (let dLat = -1; dLat <= 1; dLat += 1) {
      for (let dLon = -1; dLon <= 1; dLon += 1) {
        const candidates = pointBuckets.get(`${baseLat + dLat}:${baseLon + dLon}`) ?? [];
        for (const point of candidates) {
          if (haversineMeters([lat, lon], point) <= radiusMeters) return true;
        }
      }
    }

    return false;
  });
}

const TRAILHEAD_PROXIMITY_POST_FILTER_METERS = 200;

async function resolveTrailHeadsForSystem(
  system: TrailSystemForPage,
  trailSegments: TrailSegmentRow[]
): Promise<{ trailHeads: TrailHeadRow[]; selection: TrailHeadMapSelection }> {
  const systemRef =
    typeof (system as { systemRef?: unknown }).systemRef === "string" &&
    String((system as { systemRef?: unknown }).systemRef).trim() !== ""
      ? String((system as { systemRef?: unknown }).systemRef).trim()
      : typeof system.extSystemRef === "string" && system.extSystemRef.trim() !== ""
        ? system.extSystemRef.trim()
        : null;
  const systemSlug = typeof system.slug === "string" ? system.slug.trim() : "";
  const systemName = typeof system.name === "string" ? system.name.trim() : "";

  const applyProximityFilter = (heads: TrailHeadRow[]): TrailHeadRow[] => {
    if (trailSegments.length === 0) return heads;
    const filtered = filterTrailHeadsNearRoute(
      heads,
      trailSegments,
      TRAILHEAD_PROXIMITY_POST_FILTER_METERS
    );
    return filtered.length > 0 ? filtered : heads;
  };

  if (systemRef) {
    const bySystemRef = dedupeTrailHeads(await queryTrailHeadsByField({ systemRef }));
    if (bySystemRef.length > 0) {
      return { trailHeads: applyProximityFilter(bySystemRef), selection: "systemRef" };
    }
  }

  if (systemSlug) {
    const byTrailSlug = dedupeTrailHeads(await queryTrailHeadsByField({ trailSlug: systemSlug }));
    if (byTrailSlug.length > 0) {
      return { trailHeads: applyProximityFilter(byTrailSlug), selection: "trailSlug" };
    }
  }

  const candidates = dedupeTrailHeads(await queryTrailHeadsCandidates());

  if (systemSlug) {
    const byRawSystemSlug = candidates.filter((head) => matchesRawSystemSlug(head, systemSlug));
    if (byRawSystemSlug.length > 0) {
      return { trailHeads: applyProximityFilter(byRawSystemSlug), selection: "raw.systemSlug" };
    }
  }

  if (systemName) {
    const byRawSystemName = candidates.filter((head) => matchesRawSystemName(head, systemName));
    if (byRawSystemName.length > 0) {
      return { trailHeads: applyProximityFilter(byRawSystemName), selection: "raw.systemName" };
    }
  }

  const withinRouteBuffer = filterTrailHeadsNearRoute(
    candidates,
    trailSegments,
    TRAILHEAD_ROUTE_BUFFER_METERS
  );
  if (withinRouteBuffer.length > 0) {
    return { trailHeads: dedupeTrailHeads(withinRouteBuffer), selection: "withinRouteBuffer" };
  }

  return { trailHeads: [], selection: "none" };
}

async function queryTrailAndHeadsById(
  id: string
): Promise<{ system: TrailSystemForPage | null; trailHeads: TrailHeadRow[] }> {
  const label = `db:trailSystems+trailHeads page by id (${id.slice(0, 8)}...)`;
  const res = await timed(label, () =>
    adminDb.query({
      trailSystems: {
        $: {
          where: { id },
          limit: 1,
          fields: [...PAGE_FIELDS],
        },
      },
      trailHeads: { $: { limit: TRAIL_HEADS_LIMIT, fields: [...TRAIL_HEAD_FIELDS] } },
    } as Parameters<typeof adminDb.query>[0])
  );
  logPayloadIfEnabled(label, res);
  const systemList = normalizeResult(res);
  const system =
    systemList.find((s) => String(s?.id ?? "") === id) ?? systemList[0] ?? null;
  warnIfLargePayload(system);
  const trailHeads = normalizeTrailHeads(res);
  return { system, trailHeads };
}

async function queryTrailAndHeadsByIdTail(
  tail: string
): Promise<{ system: TrailSystemForPage | null; trailHeads: TrailHeadRow[] }> {
  const label = "db:trailSystems+trailHeads page by idTail (trail)";
  const res = await timed(label, () =>
    adminDb.query({
      trailSystems: {
        $: {
          limit: 5000,
          fields: [...PAGE_FIELDS],
        },
      },
      trailHeads: { $: { limit: TRAIL_HEADS_LIMIT, fields: [...TRAIL_HEAD_FIELDS] } },
    } as Parameters<typeof adminDb.query>[0])
  );
  logPayloadIfEnabled(label, res);
  const systemList = normalizeResult(res);
  const system =
    systemList.find((s) => String(s?.id ?? "").toLowerCase().endsWith(tail)) ?? null;
  warnIfLargePayload(system);
  const trailHeads = normalizeTrailHeads(res);
  return { system, trailHeads };
}

export const getTrailSystemForPageById = cache(
  async (id: string): Promise<TrailSystemForPage | null> => {
    try {
      return await queryTrailById(id);
    } catch {
      return null;
    }
  }
);

export const getTrailSystemForPageByIdTail = cache(
  async (tail: string): Promise<TrailSystemForPage | null> => {
    try {
      return await queryTrailByIdTail(tail);
    } catch {
      return null;
    }
  }
);

export type TrailSystemLookup =
  | { kind: "id"; value: string }
  | { kind: "idTail"; value: string };

/** Shared cached entrypoint used by both generateMetadata() and page(). */
export async function getTrailSystemForPage(
  lookup: TrailSystemLookup
): Promise<TrailSystemForPage | null> {
  if (lookup.kind === "id") return getTrailSystemForPageById(lookup.value);
  return getTrailSystemForPageByIdTail(lookup.value);
}

/** Returns trail system and all trailHeads in one request for the detail page. */
export async function getTrailSystemAndHeadsForPage(lookup: TrailSystemLookup): Promise<{
  system: TrailSystemForPage | null;
  trailHeads: TrailHeadRow[];
}> {
  try {
    if (lookup.kind === "id") return await queryTrailAndHeadsById(lookup.value);
    return await queryTrailAndHeadsByIdTail(lookup.value);
  } catch {
    return { system: null, trailHeads: [] };
  }
}

export async function getTrailSystemHeadsAndSegmentsForPage(lookup: TrailSystemLookup): Promise<{
  system: TrailSystemForPage | null;
  trailHeads: TrailHeadRow[];
  trailHeadSelection: TrailHeadMapSelection;
}> {
  try {
    const system = await getTrailSystemForPage(lookup);
    const systemSlug =
      typeof system?.slug === "string" && system.slug.trim().length > 0 ? system.slug.trim() : null;

    if (!system || !systemSlug) {
      return { system, trailHeads: [], trailHeadSelection: "none" };
    }

    const label = `db:trailSegments page by systemSlug (${systemSlug})`;
    const res = await timed(label, () =>
      adminDb.query({
        trailSegments: {
          $: {
            where: { systemSlug },
            limit: TRAIL_SEGMENTS_LIMIT,
            fields: [...TRAIL_SEGMENT_FIELDS],
          },
        },
      } as Parameters<typeof adminDb.query>[0])
    );
    logPayloadIfEnabled(label, res);

    // Segments fetched here are used only for server-side trailhead proximity filtering.
    // Geometry is NOT returned to the page to keep the RSC payload small.
    // The map component fetches its own segments (with geometry) via /api/segments on mount.
    const trailSegments = normalizeTrailSegments(res).filter(
      (segment) => String(segment?.systemSlug ?? "") === systemSlug
    );
    const { trailHeads, selection } = await resolveTrailHeadsForSystem(system, trailSegments);

    return { system, trailHeads, trailHeadSelection: selection };
  } catch {
    return { system: null, trailHeads: [], trailHeadSelection: "none" };
  }
}
