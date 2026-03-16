import "server-only";

import { slugifyCity } from "@/lib/slug";
import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import type { TrailSystemsIndexRecord } from "@/lib/data/trailSystemsIndex";
import { resolveStateName } from "@/lib/seo/entities";

export const RELATED_TRAILS_LIMIT = 3;

export type RelatedTrailCardCandidate = {
  id: string;
  name: string;
  href: string;
  cityName: string;
  stateName: string;
  distance: string;
  distanceMiles: number | null;
  dogsAllowed: string | null;
  leashPolicy: string | null;
  shade: string | null;
  shadePct: number | null;
  heat: string | null;
  waterNearPct: number | null;
  swimLikely: boolean | null;
  elevationGainFt: number | null;
  sourceBucket: "sameCity" | "sameState";
};

type ResolveRelatedTrailsInput = {
  currentTrail: {
    id: string;
    city: string | null | undefined;
    state: string | null | undefined;
  };
  candidates: TrailSystemsIndexRecord[];
  limit?: number;
};

function normalizeCityKey(value: string | null | undefined): string {
  return slugifyCity(String(value ?? ""));
}

function normalizeStateKey(value: string | null | undefined): string {
  return normalizeState(String(value ?? ""));
}

function asDistanceLabel(miles: unknown): string {
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles <= 0) return "—";
  return `${miles.toFixed(1)} mi`;
}

function asName(value: unknown): string {
  const name = String(value ?? "").trim();
  return name.length > 0 ? name : "Unnamed trail";
}

function isBrowseable(record: TrailSystemsIndexRecord): boolean {
  const hasName = String(record.name ?? "").trim().length > 0;
  const hasCity = String(record.city ?? "").trim().length > 0;
  const hasState = String(record.state ?? "").trim().length > 0;
  const hasDistance =
    typeof record.lengthMilesTotal === "number" &&
    Number.isFinite(record.lengthMilesTotal) &&
    record.lengthMilesTotal > 1;
  return hasName && hasCity && hasState && hasDistance;
}

function completenessScore(record: TrailSystemsIndexRecord): number {
  let score = 0;
  if (
    typeof record.lengthMilesTotal === "number" &&
    Number.isFinite(record.lengthMilesTotal) &&
    record.lengthMilesTotal > 0
  ) score += 1;
  if (typeof record.leashPolicy === "string" && record.leashPolicy.trim().length > 0) score += 1;
  if (typeof record.dogsAllowed === "string" && record.dogsAllowed.trim().length > 0) score += 1;
  if (typeof record.shadeProxyPercent === "number" && Number.isFinite(record.shadeProxyPercent)) score += 1;
  if (typeof record.waterNearPercent === "number" && Number.isFinite(record.waterNearPercent)) score += 1;
  if (typeof record.swimLikely === "boolean") score += 1;
  if (typeof record.elevationGainFt === "number" && Number.isFinite(record.elevationGainFt)) score += 1;
  if (typeof record.heatRisk === "string" && record.heatRisk.trim().length > 0) score += 1;
  return score;
}

function sortStable(records: TrailSystemsIndexRecord[]): TrailSystemsIndexRecord[] {
  return [...records].sort((a, b) => {
    const browseableDiff = Number(isBrowseable(b)) - Number(isBrowseable(a));
    if (browseableDiff !== 0) return browseableDiff;

    const completenessDiff = completenessScore(b) - completenessScore(a);
    if (completenessDiff !== 0) return completenessDiff;

    const byName = asName(a.name).localeCompare(asName(b.name), undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (byName !== 0) return byName;

    return String(a.id ?? "").localeCompare(String(b.id ?? ""), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function toCardCandidate(
  record: TrailSystemsIndexRecord,
  bucket: "sameCity" | "sameState"
): RelatedTrailCardCandidate {
  const id = String(record.id ?? "").trim();
  const name = asName(record.name);
  const stateCode = normalizeState(String(record.state ?? ""));
  const cityName = String(record.city ?? "").trim() || "Unknown city";
  const trailSlug = canonicalTrailSlug({
    name: record.name ?? null,
    id: record.id ?? null,
    extSystemRef: record.extSystemRef ?? null,
  });

  return {
    id,
    name,
    href: `/${encodeURIComponent(stateCode)}/${encodeURIComponent(slugifyCity(cityName))}/${encodeURIComponent(trailSlug)}`,
    cityName,
    stateName: resolveStateName(stateCode),
    distance: asDistanceLabel(record.lengthMilesTotal),
    distanceMiles:
      typeof record.lengthMilesTotal === "number" && Number.isFinite(record.lengthMilesTotal)
        ? record.lengthMilesTotal
        : null,
    dogsAllowed:
      typeof record.dogsAllowed === "string" && record.dogsAllowed.trim().length > 0
        ? record.dogsAllowed
        : null,
    leashPolicy:
      typeof record.leashPolicy === "string" && record.leashPolicy.trim().length > 0
        ? record.leashPolicy
        : null,
    shade:
      typeof record.shadeProxyPercent === "number" && Number.isFinite(record.shadeProxyPercent)
        ? `${Math.round(record.shadeProxyPercent * 100)}%`
        : null,
    shadePct:
      typeof record.shadeProxyPercent === "number" && Number.isFinite(record.shadeProxyPercent)
        ? record.shadeProxyPercent
        : null,
    heat:
      typeof record.heatRisk === "string" && record.heatRisk.trim().length > 0
        ? record.heatRisk
        : null,
    waterNearPct:
      typeof record.waterNearPercent === "number" && Number.isFinite(record.waterNearPercent)
        ? record.waterNearPercent
        : null,
    swimLikely: typeof record.swimLikely === "boolean" ? record.swimLikely : null,
    elevationGainFt:
      typeof record.elevationGainFt === "number" && Number.isFinite(record.elevationGainFt)
        ? record.elevationGainFt
        : null,
    sourceBucket: bucket,
  };
}

function dedupeByTrailId(records: TrailSystemsIndexRecord[]): TrailSystemsIndexRecord[] {
  const seen = new Set<string>();
  const out: TrailSystemsIndexRecord[] = [];
  for (const record of records) {
    const id = String(record.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(record);
  }
  return out;
}

export function resolveRelatedTrails(input: ResolveRelatedTrailsInput): RelatedTrailCardCandidate[] {
  const limit = Math.max(0, Math.floor(input.limit ?? RELATED_TRAILS_LIMIT));
  if (limit === 0) return [];

  const currentId = String(input.currentTrail.id ?? "").trim();
  const currentState = normalizeStateKey(input.currentTrail.state);
  const currentCity = normalizeCityKey(input.currentTrail.city);

  const deduped = dedupeByTrailId(input.candidates);
  const filtered = deduped.filter((record) => String(record.id ?? "").trim() !== currentId);

  const sameCity = sortStable(
    filtered.filter((record) => {
      return (
        normalizeStateKey(record.state) === currentState &&
        normalizeCityKey(record.city) === currentCity
      );
    })
  );

  if (sameCity.length > 0) {
    return sameCity.slice(0, limit).map((record) => toCardCandidate(record, "sameCity"));
  }

  const sameState = sortStable(
    filtered.filter((record) => normalizeStateKey(record.state) === currentState)
  );

  if (sameState.length > 0) {
    return sameState.slice(0, limit).map((record) => toCardCandidate(record, "sameState"));
  }

  return [];
}
