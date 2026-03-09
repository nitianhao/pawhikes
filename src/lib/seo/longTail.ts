import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import { slugifyCity } from "@/lib/slug";

export type LongTailIntentSlug = "with-water" | "shaded" | "leash-required";

export type LongTailTrailRecord = {
  id?: string;
  extSystemRef?: string;
  name?: string;
  state?: string;
  city?: string;
  lengthMilesTotal?: number;
  leashPolicy?: string;
  shadeProxyPercent?: number;
  waterNearPercent?: number;
  swimLikely?: boolean;
  elevationGainFt?: number;
  dogsAllowed?: string;
  heatRisk?: string;
};

export type LongTailIntentDefinition = {
  slug: LongTailIntentSlug;
  shortLabel: string;
  whyItMatters: string;
  predicate: (trail: LongTailTrailRecord) => boolean;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Conservative quality gates for programmatic long-tail pages.
 * Guardrail goal: prevent doorway-like expansion as inventory grows.
 */
export const LONG_TAIL_THRESHOLDS = {
  minMatchingTrailsToRender: envNumber("SEO_LONGTAIL_MIN_MATCH_RENDER", 2),
  minMatchingTrailsToIndex: envNumber("SEO_LONGTAIL_MIN_MATCH_INDEX", 3),
  minCityCoverageShareToIndex: envNumber("SEO_LONGTAIL_MIN_CITY_SHARE_INDEX", 0.35),
  maxOverlapRatioForIndex: envNumber("SEO_LONGTAIL_MAX_OVERLAP_RATIO", 0.9),
};

function matchesLeashRequired(policy: unknown): boolean {
  if (typeof policy !== "string") return false;
  const value = policy.toLowerCase().trim();
  if (!value || !value.includes("leash")) return false;
  if (value.includes("off leash") || value.includes("off-leash")) return false;
  return (
    value.includes("required") ||
    value.includes("on leash") ||
    value.includes("must be")
  );
}

export const LONG_TAIL_INTENTS: LongTailIntentDefinition[] = [
  {
    slug: "with-water",
    shortLabel: "Dog-friendly trails with water access",
    whyItMatters:
      "Water access can help with hydration and cooldown planning on warmer dog hikes.",
    predicate: (trail) =>
      (typeof trail.waterNearPercent === "number" && trail.waterNearPercent >= 0.25) ||
      trail.swimLikely === true,
  },
  {
    slug: "shaded",
    shortLabel: "Shaded dog-friendly trails",
    whyItMatters:
      "Shade coverage helps reduce heat exposure for dogs, especially on midday outings.",
    predicate: (trail) =>
      typeof trail.shadeProxyPercent === "number" && trail.shadeProxyPercent >= 0.35,
  },
  {
    slug: "leash-required",
    shortLabel: "Leash-required dog trails",
    whyItMatters:
      "Leash-required trails are useful for dogs that need tighter control and predictable trail etiquette.",
    predicate: (trail) => matchesLeashRequired(trail.leashPolicy),
  },
];

export type LongTailIntentEvaluation = {
  intent: LongTailIntentDefinition;
  matchingTrails: LongTailTrailRecord[];
  matchingCount: number;
  cityTrailCount: number;
  coverageShare: number;
  renderable: boolean;
  indexable: boolean;
  reason: string;
};

export function getLongTailIntentBySlug(
  slug: string
): LongTailIntentDefinition | null {
  return LONG_TAIL_INTENTS.find((intent) => intent.slug === slug) ?? null;
}

function overlapRatio(
  a: LongTailTrailRecord[],
  b: LongTailTrailRecord[]
): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aIds = new Set(a.map((trail) => String(trail.id ?? "")));
  let shared = 0;
  for (const trail of b) {
    if (aIds.has(String(trail.id ?? ""))) shared += 1;
  }
  return shared / Math.min(a.length, b.length);
}

export function evaluateLongTailIntentsForCity(
  trailsInCity: LongTailTrailRecord[]
): LongTailIntentEvaluation[] {
  const cityTrailCount = trailsInCity.length;
  const base = LONG_TAIL_INTENTS.map((intent) => {
    const matchingTrails = trailsInCity.filter((trail) => intent.predicate(trail));
    const matchingCount = matchingTrails.length;
    const coverageShare = cityTrailCount > 0 ? matchingCount / cityTrailCount : 0;
    const renderable = matchingCount >= LONG_TAIL_THRESHOLDS.minMatchingTrailsToRender;
    const indexable =
      renderable &&
      matchingCount >= LONG_TAIL_THRESHOLDS.minMatchingTrailsToIndex &&
      coverageShare >= LONG_TAIL_THRESHOLDS.minCityCoverageShareToIndex;

    return {
      intent,
      matchingTrails,
      matchingCount,
      cityTrailCount,
      coverageShare,
      renderable,
      indexable,
      reason: indexable ? "meets_quality_thresholds" : "below_quality_thresholds",
    };
  });

  // Duplicate-protection guardrail: demote near-duplicate intent pages.
  for (let i = 0; i < base.length; i += 1) {
    for (let j = i + 1; j < base.length; j += 1) {
      const left = base[i];
      const right = base[j];
      if (!left.indexable || !right.indexable) continue;
      const overlap = overlapRatio(left.matchingTrails, right.matchingTrails);
      if (overlap <= LONG_TAIL_THRESHOLDS.maxOverlapRatioForIndex) continue;
      if (left.matchingCount >= right.matchingCount) {
        right.indexable = false;
        right.reason = "near_duplicate_of_stronger_intent";
      } else {
        left.indexable = false;
        left.reason = "near_duplicate_of_stronger_intent";
      }
    }
  }

  return base;
}

export function buildLongTailCityPath(input: {
  state: string;
  city: string;
  intent: LongTailIntentSlug;
}): string {
  const state = normalizeState(input.state);
  const city = slugifyCity(input.city);
  return `/${encodeURIComponent(state)}/${encodeURIComponent(city)}/dog-friendly/${encodeURIComponent(input.intent)}`;
}

export function longTailTitle(input: {
  intent: LongTailIntentDefinition;
  cityName: string;
  stateName: string;
  matchingCount: number;
}): string {
  const countPart =
    input.matchingCount > 0 ? `${input.matchingCount} trails` : "trail listings";
  return `${input.intent.shortLabel} in ${input.cityName}, ${input.stateName} (${countPart})`;
}

export function longTailDescription(input: {
  intent: LongTailIntentDefinition;
  cityName: string;
  stateName: string;
  matchingCount: number;
  cityTrailCount: number;
}): string {
  const share =
    input.cityTrailCount > 0
      ? `${Math.round((input.matchingCount / input.cityTrailCount) * 100)}% of city listings`
      : "city listings";
  return `${input.intent.shortLabel} in ${input.cityName}, ${input.stateName}. Compare real trail data for leash policy, shade, water access, and route effort. Currently ${input.matchingCount} matching trails (${share}).`;
}

export function longTailHeading(input: {
  intent: LongTailIntentDefinition;
  cityName: string;
  stateName: string;
}): string {
  return `${input.intent.shortLabel} in ${input.cityName}, ${input.stateName}`;
}

export function trailHrefForCityTrail(input: {
  state: string;
  city: string;
  trail: LongTailTrailRecord;
}): string {
  const state = normalizeState(input.state);
  const city = slugifyCity(input.city);
  const trailSlug = canonicalTrailSlug({
    name: input.trail.name ?? null,
    id: input.trail.id ?? null,
    extSystemRef: input.trail.extSystemRef ?? null,
  });
  return `/${encodeURIComponent(state)}/${encodeURIComponent(city)}/${encodeURIComponent(trailSlug)}`;
}
