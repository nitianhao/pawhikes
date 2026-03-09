import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import { slugifyCity } from "@/lib/slug";

export type DogTypeRouteSlug =
  | "trails-for-reactive-dogs"
  | "trails-for-senior-dogs"
  | "trails-for-small-dogs"
  | "easy-dog-friendly-trails";

export type DogTypeTrailRecord = {
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
  crowdClass?: string;
  crowdProxyScore?: number;
  surfaceSummary?: { dominant?: string } | unknown;
};

export type DogTypeIntent = {
  routeSlug: DogTypeRouteSlug;
  headingLabel: string;
  shortLabel: string;
  intro: string;
  predicate: (trail: DogTypeTrailRecord) => boolean;
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Programmatic dog-type guardrails read lazily so runtime env vars (not just
 * build-time vars) are respected without requiring a rebuild.
 */
export function getDogTypeThresholds() {
  return {
    minMatchRender: envNumber("SEO_DOGTYPE_MIN_MATCH_RENDER", 2),
    minMatchIndex: envNumber("SEO_DOGTYPE_MIN_MATCH_INDEX", 3),
    minCityShareIndex: envNumber("SEO_DOGTYPE_MIN_CITY_SHARE_INDEX", 0.3),
    maxIntentOverlapRatio: envNumber("SEO_DOGTYPE_MAX_INTENT_OVERLAP_RATIO", 0.9),
  };
}

function asFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asLowerText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function dominantSurface(trail: DogTypeTrailRecord): string {
  const raw = trail.surfaceSummary;
  if (!raw || typeof raw !== "object") return "";
  const dominant = (raw as { dominant?: unknown }).dominant;
  return typeof dominant === "string" ? dominant.trim().toLowerCase() : "";
}

function isStableSurface(trail: DogTypeTrailRecord): boolean {
  const surface = dominantSurface(trail);
  return (
    surface.includes("paved") ||
    surface.includes("asphalt") ||
    surface.includes("concrete") ||
    surface.includes("gravel") ||
    surface.includes("crushed")
  );
}

function isLowCrowd(trail: DogTypeTrailRecord): boolean {
  const cls = asLowerText(trail.crowdClass);
  if (cls === "low") return true;
  if (cls === "high") return false;
  const score = asFinite(trail.crowdProxyScore);
  if (score == null) return false;
  return score <= 0.38;
}

function isLeashControlled(trail: DogTypeTrailRecord): boolean {
  const policy = asLowerText(trail.leashPolicy);
  if (!policy) return false;
  if (!policy.includes("leash")) return false;
  if (policy.includes("off leash") || policy.includes("off-leash")) return false;
  return policy.includes("required") || policy.includes("on leash") || policy.includes("must");
}

export const DOG_TYPE_INTENTS: DogTypeIntent[] = [
  {
    routeSlug: "trails-for-reactive-dogs",
    headingLabel: "Trails for Reactive Dogs",
    shortLabel: "Reactive-dog friendly trails",
    intro:
      "These listings prioritize calmer trail environments and leash-controlled conditions where available.",
    predicate: (trail) =>
      isLowCrowd(trail) &&
      isLeashControlled(trail) &&
      ((asFinite(trail.lengthMilesTotal) ?? 99) <= 6.5),
  },
  {
    routeSlug: "trails-for-senior-dogs",
    headingLabel: "Trails for Senior Dogs",
    shortLabel: "Senior-dog friendly trails",
    intro:
      "These trails emphasize gentler distance and climbing profiles for older dogs with lower-impact needs.",
    predicate: (trail) =>
      ((asFinite(trail.lengthMilesTotal) ?? 99) <= 4.5) &&
      ((asFinite(trail.elevationGainFt) ?? 9999) <= 350) &&
      (isStableSurface(trail) || (asFinite(trail.shadeProxyPercent) ?? 0) >= 0.3),
  },
  {
    routeSlug: "trails-for-small-dogs",
    headingLabel: "Trails for Small Dogs",
    shortLabel: "Small-dog friendly trails",
    intro:
      "These trails focus on manageable effort and more predictable footing for smaller dogs.",
    predicate: (trail) =>
      ((asFinite(trail.lengthMilesTotal) ?? 99) <= 5.5) &&
      ((asFinite(trail.elevationGainFt) ?? 9999) <= 500) &&
      isStableSurface(trail) &&
      asLowerText(trail.heatRisk) !== "high",
  },
  {
    routeSlug: "easy-dog-friendly-trails",
    headingLabel: "Easy Dog-Friendly Trails",
    shortLabel: "Easy dog-friendly trails",
    intro:
      "These routes are selected for lower overall effort using distance and elevation signals.",
    predicate: (trail) =>
      ((asFinite(trail.lengthMilesTotal) ?? 99) <= 4) &&
      ((asFinite(trail.elevationGainFt) ?? 9999) <= 300) &&
      asLowerText(trail.heatRisk) !== "high",
  },
];

export type DogTypeEvaluation = {
  intent: DogTypeIntent;
  matches: DogTypeTrailRecord[];
  matchingCount: number;
  cityTrailCount: number;
  coverageShare: number;
  renderable: boolean;
  indexable: boolean;
  reason: string;
};

function trailKey(trail: DogTypeTrailRecord): string {
  return String(trail.extSystemRef ?? trail.id ?? "");
}

function overlapRatio(a: DogTypeTrailRecord[], b: DogTypeTrailRecord[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const aKeys = new Set(a.map(trailKey));
  let overlap = 0;
  for (const trail of b) {
    if (aKeys.has(trailKey(trail))) overlap += 1;
  }
  return overlap / Math.min(a.length, b.length);
}

export function evaluateDogTypeIntentsForCity(
  trailsInCity: DogTypeTrailRecord[]
): DogTypeEvaluation[] {
  const thresholds = getDogTypeThresholds();
  const cityTrailCount = trailsInCity.length;
  const evaluations: DogTypeEvaluation[] = DOG_TYPE_INTENTS.map((intent) => {
    const matches = trailsInCity.filter((trail) => intent.predicate(trail));
    const matchingCount = matches.length;
    const coverageShare = cityTrailCount > 0 ? matchingCount / cityTrailCount : 0;
    const renderable = matchingCount >= thresholds.minMatchRender;
    const indexable =
      renderable &&
      matchingCount >= thresholds.minMatchIndex &&
      coverageShare >= thresholds.minCityShareIndex;
    return {
      intent,
      matches,
      matchingCount,
      cityTrailCount,
      coverageShare,
      renderable,
      indexable,
      reason: indexable ? "meets_quality_thresholds" : "below_quality_thresholds",
    };
  });

  for (let i = 0; i < evaluations.length; i += 1) {
    for (let j = i + 1; j < evaluations.length; j += 1) {
      const a = evaluations[i];
      const b = evaluations[j];
      if (!a.indexable || !b.indexable) continue;
      const overlap = overlapRatio(a.matches, b.matches);
      if (overlap <= thresholds.maxIntentOverlapRatio) continue;
      if (a.matchingCount >= b.matchingCount) {
        b.indexable = false;
        b.reason = "near_duplicate_of_stronger_intent";
      } else {
        a.indexable = false;
        a.reason = "near_duplicate_of_stronger_intent";
      }
    }
  }

  return evaluations;
}

export function getDogTypeIntentByRouteSlug(
  routeSlug: string
): DogTypeIntent | null {
  return DOG_TYPE_INTENTS.find((intent) => intent.routeSlug === routeSlug) ?? null;
}

export function buildDogTypePath(input: {
  state: string;
  city: string;
  routeSlug: DogTypeRouteSlug;
}): string {
  const stateCode = normalizeState(input.state);
  const citySlug = slugifyCity(input.city);
  return `/${encodeURIComponent(stateCode)}/${encodeURIComponent(citySlug)}/${encodeURIComponent(input.routeSlug)}`;
}

export function dogTypeTitle(input: {
  intent: DogTypeIntent;
  cityName: string;
  stateName: string;
}): string {
  return `${input.intent.headingLabel} in ${input.cityName}, ${input.stateName}`;
}

export function dogTypeDescription(input: {
  intent: DogTypeIntent;
  cityName: string;
  stateName: string;
  matchingCount: number;
  cityTrailCount: number;
}): string {
  const share =
    input.cityTrailCount > 0
      ? `${Math.round((input.matchingCount / input.cityTrailCount) * 100)}% of listed city trails`
      : "city trail listings";
  return `${input.intent.headingLabel} in ${input.cityName}, ${input.stateName}. ${input.intent.intro} ${input.matchingCount} matching trails (${share}) based on real trail data.`;
}

export function dogTypeTrailHref(input: {
  state: string;
  city: string;
  trail: DogTypeTrailRecord;
}): string {
  const stateCode = normalizeState(input.state);
  const citySlug = slugifyCity(input.city);
  const trailSlug = canonicalTrailSlug({
    name: input.trail.name ?? null,
    id: input.trail.id ?? null,
    extSystemRef: input.trail.extSystemRef ?? null,
  });
  return `/${encodeURIComponent(stateCode)}/${encodeURIComponent(citySlug)}/${encodeURIComponent(trailSlug)}`;
}
