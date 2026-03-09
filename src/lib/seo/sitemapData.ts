import { getAdminDbSafe } from "@/lib/instant/safeAdmin";
import { unstable_cache } from "next/cache";
import { slugifyCity } from "@/lib/slug";
import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import {
  evaluateCityIndexability,
  evaluateStateIndexability,
  evaluateTrailIndexability,
} from "@/lib/seo/indexation";
import { buildDogTypePath, evaluateDogTypeIntentsForCity } from "@/lib/seo/dogType";
import { buildGeoClusterPath, getGeoClustersForCity } from "@/lib/seo/geographic";

export type IndexablePath = {
  path: string;
  lastModified: Date;
};

type TrailSystemRecord = Record<string, unknown>;

const FALLBACK_LAST_MODIFIED = new Date("2025-01-01T00:00:00.000Z");

function parseLastModified(value: unknown): Date | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function trailLastModified(record: TrailSystemRecord): Date {
  return (
    parseLastModified(record.updatedAt) ??
    parseLastModified(record.lastUpdatedAt) ??
    parseLastModified(record.modifiedAt) ??
    parseLastModified(record.sourceUpdatedAt) ??
    FALLBACK_LAST_MODIFIED
  );
}

const loadTrailSystemsCached = unstable_cache(
  async (): Promise<TrailSystemRecord[]> => {
    const db = await getAdminDbSafe();
    if (!db) return [];

    const result = await db.query({
      trailSystems: {
        $: {
          limit: 5000,
          fields: [
            "id",
            "name",
            "city",
            "state",
            "extSystemRef",
            "lengthMilesTotal",
            "dogsAllowed",
            "leashPolicy",
            "shadeProxyPercent",
            "waterNearPercent",
            "swimLikely",
            "surfaceSummary",
            "elevationGainFt",
            "parkingCount",
            "trailheadPOIs",
            "highlights",
            "faqs",
            "updatedAt",
            "lastUpdatedAt",
            "modifiedAt",
            "sourceUpdatedAt",
          ],
        },
      },
    } as Parameters<typeof db.query>[0]);

    const systems = Array.isArray((result as any).trailSystems)
      ? (result as any).trailSystems
      : (result as any).trailSystems?.data ?? [];

    return Array.isArray(systems) ? systems : [];
  },
  ["sitemap-trail-systems-v1"],
  { revalidate: 3600, tags: ["sitemap"] }
);

async function loadTrailSystems(): Promise<TrailSystemRecord[]> {
  return loadTrailSystemsCached();
}

function isIndexableStateEntry(entry: { trailCount: number; citySet: Set<string> }): boolean {
  return evaluateStateIndexability({
    cityCount: entry.citySet.size,
    trailCount: entry.trailCount,
  }).indexable;
}

function isIndexableCityEntry(entry: { trailCount: number }): boolean {
  return evaluateCityIndexability({
    trailCount: entry.trailCount,
  }).indexable;
}

function dedupePaths(paths: IndexablePath[]): IndexablePath[] {
  // Guardrail: keep only canonical unique paths in sitemap output.
  const map = new Map<string, Date>();
  for (const entry of paths) {
    const prev = map.get(entry.path);
    if (!prev || entry.lastModified > prev) {
      map.set(entry.path, entry.lastModified);
    }
  }
  return Array.from(map.entries())
    .map(([path, lastModified]) => ({ path, lastModified }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export async function loadIndexablePaths(): Promise<IndexablePath[]> {
  const systems = await loadTrailSystems();

  const stateMap = new Map<string, { lastModified: Date; trailCount: number; citySet: Set<string> }>();
  const cityMap = new Map<string, { lastModified: Date; trailCount: number }>();
  const cityTrailMap = new Map<string, TrailSystemRecord[]>();
  const trailPaths: IndexablePath[] = [];

  for (const system of systems) {
    const trailEval = evaluateTrailIndexability({
      name: system.name,
      city: system.city,
      state: system.state,
      lengthMilesTotal: system.lengthMilesTotal,
      dogsAllowed: system.dogsAllowed,
      leashPolicy: system.leashPolicy,
      shadeProxyPercent: system.shadeProxyPercent,
      waterNearPercent: system.waterNearPercent,
      swimLikely: system.swimLikely,
      surfaceSummary: system.surfaceSummary,
      elevationGainFt: system.elevationGainFt,
      parkingCount: system.parkingCount,
      trailheadPOIs: system.trailheadPOIs,
      highlights: system.highlights,
      faqs: system.faqs,
    });
    if (!trailEval.indexable) continue;

    const state = normalizeState(String(system.state ?? ""));
    const citySlug = slugifyCity(String(system.city ?? ""));
    const trailSlug = canonicalTrailSlug({
      name: (system.name as string | null | undefined) ?? null,
      id: (system.id as string | null | undefined) ?? null,
      extSystemRef: (system.extSystemRef as string | null | undefined) ?? null,
    });
    const modified = trailLastModified(system);

    const statePath = `/${encodeURIComponent(state)}`;
    const cityPath = `/${encodeURIComponent(state)}/${encodeURIComponent(citySlug)}`;

    const stateEntry = stateMap.get(statePath);
    if (!stateEntry) {
      stateMap.set(statePath, { lastModified: modified, trailCount: 1, citySet: new Set([cityPath]) });
    } else {
      if (modified > stateEntry.lastModified) stateEntry.lastModified = modified;
      stateEntry.trailCount += 1;
      stateEntry.citySet.add(cityPath);
    }

    const cityEntry = cityMap.get(cityPath);
    if (!cityEntry) {
      cityMap.set(cityPath, { lastModified: modified, trailCount: 1 });
    } else {
      if (modified > cityEntry.lastModified) cityEntry.lastModified = modified;
      cityEntry.trailCount += 1;
    }
    const trails = cityTrailMap.get(cityPath) ?? [];
    trails.push(system);
    cityTrailMap.set(cityPath, trails);

    trailPaths.push({
      path: `${cityPath}/${encodeURIComponent(trailSlug)}`,
      lastModified: modified,
    });
  }

  const root = [{ path: "/", lastModified: FALLBACK_LAST_MODIFIED }];
  const statePaths = Array.from(stateMap.entries())
    .filter(([, entry]) => isIndexableStateEntry(entry))
    .map(([path, entry]) => ({
      path,
      lastModified: entry.lastModified,
    }));
  const cityPaths = Array.from(cityMap.entries())
    .filter(([, entry]) => isIndexableCityEntry(entry))
    .map(([path, entry]) => ({
      path,
      lastModified: entry.lastModified,
    }));
  const cityIndexableSet = new Set(cityPaths.map((entry) => entry.path));
  const dogTypePaths: IndexablePath[] = [];
  const geoPaths: IndexablePath[] = [];
  for (const [cityPath, trails] of cityTrailMap.entries()) {
    if (!cityIndexableSet.has(cityPath)) continue;
    const parts = cityPath.split("/").filter(Boolean);
    const stateCode = parts[0] ?? "";
    const citySlug = parts[1] ?? "";
    if (!stateCode || !citySlug) continue;
    const evaluations = evaluateDogTypeIntentsForCity(trails);
    const cityLastModified = cityMap.get(cityPath)?.lastModified ?? FALLBACK_LAST_MODIFIED;
    for (const evaluation of evaluations) {
      if (!evaluation.indexable) continue;
      dogTypePaths.push({
        path: buildDogTypePath({
          state: stateCode,
          city: citySlug,
          routeSlug: evaluation.intent.routeSlug,
        }),
        lastModified: cityLastModified,
      });
    }

    const cityLabel = trails[0]?.city ? String(trails[0].city) : citySlug.replace(/-/g, " ");
    const geoClusters = getGeoClustersForCity({ cityName: cityLabel, trails });
    for (const cluster of geoClusters) {
      if (!cluster.indexable) continue;
      geoPaths.push({
        path: buildGeoClusterPath({
          state: stateCode,
          city: citySlug,
          clusterSlug: cluster.slug,
        }),
        lastModified: cityLastModified,
      });
    }
  }

  return dedupePaths([...root, ...statePaths, ...cityPaths, ...dogTypePaths, ...geoPaths, ...trailPaths]);
}
