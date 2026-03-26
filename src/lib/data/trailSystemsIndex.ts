import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getAdminDbSafe } from "@/lib/instant/safeAdmin";

export type TrailSystemsIndexRecord = {
  id: string;
  name?: string;
  state?: string;
  city?: string;
  extSystemRef?: string;
  lengthMilesTotal?: number;
  leashPolicy?: string;
  shadeProxyPercent?: number;
  waterNearPercent?: number;
  swimLikely?: boolean;
  surfaceSummary?: unknown;
  elevationGainFt?: number;
  dogsAllowed?: string;
  centroid?: [number, number] | unknown;
  heatRisk?: string;
  crowdClass?: string;
  crowdProxyScore?: number;
};

const INDEX_FIELDS = [
  "id",
  "name",
  "state",
  "city",
  "extSystemRef",
  "lengthMilesTotal",
  "leashPolicy",
  "shadeProxyPercent",
  "waterNearPercent",
  "swimLikely",
  "surfaceSummary",
  "elevationGainFt",
  "dogsAllowed",
  "centroid",
  "heatRisk",
  "crowdClass",
  "crowdProxyScore",
] as const;

const INDEX_LIMIT = 5000;

const loadTrailSystemsIndexCached = unstable_cache(
  async (): Promise<TrailSystemsIndexRecord[]> => {
    const db = await getAdminDbSafe();
    if (!db) return [];

    const result = await db.query({
      trailSystems: {
        $: {
          limit: INDEX_LIMIT,
          fields: [...INDEX_FIELDS],
        },
      },
    } as Parameters<typeof db.query>[0]);

    const systems = Array.isArray((result as any).trailSystems)
      ? (result as any).trailSystems
      : (result as any).trailSystems?.data ?? [];

    return Array.isArray(systems) ? (systems as TrailSystemsIndexRecord[]) : [];
  },
  ["trail-systems-index-v3"],
  {
    revalidate: 1800,
    tags: ["trail-systems-index"],
  }
);

// Wrapped in React cache() so generateMetadata() and the page component
// share one resolved value per request even if unstable_cache is cold.
export const getTrailSystemsIndex = cache(
  async (): Promise<TrailSystemsIndexRecord[]> => loadTrailSystemsIndexCached()
);
