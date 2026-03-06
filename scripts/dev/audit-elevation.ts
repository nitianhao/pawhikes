#!/usr/bin/env npx tsx

import { getAdminDbSafe, instantDbMissingEnvMessage } from "../../src/lib/instant/safeAdmin";

type TrailSystem = Record<string, any>;

const DEFAULT_CITY = "Austin";
const DEFAULT_STATE = "TX";
const LIMIT = 200;

function isElevationLikeKey(key: string): boolean {
  return /(elev|grade|slope|gain|loss)/i.test(key);
}

async function loadSystems(): Promise<TrailSystem[]> {
  const db = await getAdminDbSafe();
  if (!db) {
    console.error(instantDbMissingEnvMessage());
    return [];
  }
  const city = DEFAULT_CITY;
  const state = DEFAULT_STATE;

  // Try filtered query first.
  try {
    const res = await db.query({
      trailSystems: { $: { where: { city, state }, limit: LIMIT } },
    } as any);
    const systems = Array.isArray((res as any)?.trailSystems)
      ? (res as any).trailSystems
      : (res as any)?.trailSystems?.data ?? [];
    if (Array.isArray(systems)) return systems as TrailSystem[];
  } catch {
    // ignore and fall back
  }

  const res = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const systems = Array.isArray((res as any)?.trailSystems)
    ? (res as any).trailSystems
    : (res as any)?.trailSystems?.data ?? [];
  const list: TrailSystem[] = Array.isArray(systems) ? systems : [];
  const cityLow = city.toLowerCase();
  const stateLow = state.toLowerCase();
  return list
    .filter((s) => String(s?.city ?? "").trim().toLowerCase() === cityLow)
    .filter((s) => String(s?.state ?? "").trim().toLowerCase() === stateLow)
    .slice(0, LIMIT);
}

async function main() {
  const systems = await loadSystems();

  const total = systems.length;
  const elevationGainFtCount = systems.filter(
    (s) => typeof s.elevationGainFt === "number" && Number.isFinite(s.elevationGainFt)
  ).length;

  const keyCounts = new Map<string, number>();
  let withAnyElevationLike = 0;

  for (const sys of systems) {
    const keys = Object.keys(sys);
    let hasElevLike = false;
    for (const key of keys) {
      if (!isElevationLikeKey(key)) continue;
      hasElevLike = true;
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
    if (hasElevLike) withAnyElevationLike += 1;
  }

  console.log("=== Elevation Audit (Austin, TX) ===");
  console.log(`Total systems: ${total}`);
  console.log(`With elevationGainFt: ${elevationGainFtCount}`);
  console.log(`With ANY elevation-like field: ${withAnyElevationLike}`);
  console.log("");
  console.log("Elevation-related keys and counts:");
  const sortedKeys = Array.from(keyCounts.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [key, count] of sortedKeys) {
    console.log(`- ${key}: ${count}`);
  }

  console.log("");
  console.log("Sample systems (id, name, elevation-related fields):");
  const sample = systems.slice(0, 3);
  for (const sys of sample) {
    const elevFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(sys)) {
      if (isElevationLikeKey(k)) elevFields[k] = v;
    }
    console.log("----");
    console.log(
      JSON.stringify(
        {
          id: sys.id,
          name: sys.name,
          city: sys.city,
          state: sys.state,
          elevation: elevFields,
        },
        null,
        2
      )
    );
  }
}

main().catch((err) => {
  console.error("Elevation audit failed:", err);
  process.exit(1);
});

