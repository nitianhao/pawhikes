import { normalizeEntityName } from "@/lib/seo/entities";

/**
 * Central indexation decision framework.
 * Priority order for URL handling:
 * 1) invalid route params -> notFound
 * 2) valid but non-canonical params -> redirect/canonical
 * 3) canonical but low-value content -> noindex
 * 4) canonical and content-worthy -> index + include in sitemap
 */

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const INDEXATION_THRESHOLDS = {
  minStateCities: envNumber("SEO_MIN_STATE_CITIES", 1),
  minStateTrails: envNumber("SEO_MIN_STATE_TRAILS", 2),
  minCityTrails: envNumber("SEO_MIN_CITY_TRAILS", 2),
  minTrailLengthMiles: envNumber("SEO_MIN_TRAIL_LENGTH_MILES", 1),
  minTrailSignals: envNumber("SEO_MIN_TRAIL_SIGNALS", 2),
};

export function hasNonCanonicalQueryParams(
  params: Record<string, string | string[] | undefined> | undefined,
  allowlist: string[] = []
): boolean {
  const input = params ?? {};
  return Object.keys(input).some((key) => !allowlist.includes(key));
}

export function isWellFormedStateParam(raw: string): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return false;
  return /^[A-Za-z-]{2,30}$/.test(value);
}

export function isWellFormedCityParam(raw: string): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return false;
  return /^[A-Za-z0-9-]{1,80}$/.test(value);
}

export type TrailIndexInput = {
  name: unknown;
  city: unknown;
  state: unknown;
  lengthMilesTotal?: unknown;
  dogsAllowed?: unknown;
  leashPolicy?: unknown;
  shadeProxyPercent?: unknown;
  waterNearPercent?: unknown;
  swimLikely?: unknown;
  surfaceSummary?: unknown;
  elevationGainFt?: unknown;
  parkingCount?: unknown;
  trailheadPOIs?: unknown;
  highlights?: unknown;
  faqs?: unknown;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function countTrailSignals(input: TrailIndexInput): number {
  let count = 0;
  if (hasText(input.dogsAllowed)) count += 1;
  if (hasText(input.leashPolicy)) count += 1;
  if (hasNumber(input.shadeProxyPercent)) count += 1;
  if (hasNumber(input.waterNearPercent) || typeof input.swimLikely === "boolean") count += 1;
  const surface = input.surfaceSummary as { dominant?: unknown } | null | undefined;
  if (surface && hasText(surface.dominant)) count += 1;
  if (hasNumber(input.elevationGainFt)) count += 1;
  if (hasNumber(input.parkingCount)) count += 1;
  if (Array.isArray(input.trailheadPOIs) && input.trailheadPOIs.length > 0) count += 1;
  if (Array.isArray(input.highlights) && input.highlights.length > 0) count += 1;
  if (Array.isArray(input.faqs) && input.faqs.length > 0) count += 1;
  return count;
}

export function evaluateTrailIndexability(input: TrailIndexInput): {
  indexable: boolean;
  reason: string;
  signalCount: number;
} {
  const name = normalizeEntityName(input.name, "");
  const city = normalizeEntityName(input.city, "");
  const state = normalizeEntityName(input.state, "");
  const lengthMiles = hasNumber(input.lengthMilesTotal)
    ? Number(input.lengthMilesTotal)
    : null;

  if (!name || !city || !state) {
    return { indexable: false, reason: "missing_core_identity", signalCount: 0 };
  }
  if (lengthMiles == null || lengthMiles < INDEXATION_THRESHOLDS.minTrailLengthMiles) {
    return { indexable: false, reason: "short_or_missing_distance", signalCount: 0 };
  }

  const signalCount = countTrailSignals(input);
  if (signalCount < INDEXATION_THRESHOLDS.minTrailSignals) {
    return { indexable: false, reason: "insufficient_trail_signals", signalCount };
  }

  return { indexable: true, reason: "trail_quality_ok", signalCount };
}

export function evaluateCityIndexability(input: {
  trailCount: number;
}): { indexable: boolean; reason: string } {
  if (input.trailCount < INDEXATION_THRESHOLDS.minCityTrails) {
    return { indexable: false, reason: "insufficient_city_inventory" };
  }
  return { indexable: true, reason: "city_inventory_ok" };
}

export function evaluateStateIndexability(input: {
  cityCount: number;
  trailCount: number;
}): { indexable: boolean; reason: string } {
  if (input.cityCount < INDEXATION_THRESHOLDS.minStateCities) {
    return { indexable: false, reason: "insufficient_state_city_inventory" };
  }
  if (input.trailCount < INDEXATION_THRESHOLDS.minStateTrails) {
    return { indexable: false, reason: "insufficient_state_trail_inventory" };
  }
  return { indexable: true, reason: "state_inventory_ok" };
}
