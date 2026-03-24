export type SafetyVet = {
  source: "osm";
  osmId: string;
  name: string | null;
  kind: "veterinary" | "animal_hospital" | "emergency_vet" | "unknown";
  location: { type: "Point"; coordinates: [number, number] };
  distanceToCentroidMeters: number;
  tags: Record<string, any>;
};

export type SafetyOutput = {
  nearbyVets: SafetyVet[];
  vetCountWithin5km: number;
  emergencyVetCountWithin10km: number;
  emergencyAccessScore: number;
  emergencyAccessClass: "low" | "medium" | "high";
  emergencyAccessReasons: string[];
  cellCoverageProxy: "unknown" | "likely" | "unlikely";
  cellCoverageReasons: string[];
};

type AnyRecord = Record<string, any>;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function capReasons(reasons: string[]): string[] {
  return reasons.filter(Boolean).slice(0, 3);
}

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function centroidFromSystem(system: AnyRecord): [number, number] | null {
  const c = system.centroid;
  if (Array.isArray(c) && c.length >= 2) {
    const lon = asNumber(c[0]);
    const lat = asNumber(c[1]);
    if (lon !== null && lat !== null) return [lon, lat];
  }
  if (c && typeof c === "object") {
    if (Array.isArray(c.coordinates) && c.coordinates.length >= 2) {
      const lon = asNumber(c.coordinates[0]);
      const lat = asNumber(c.coordinates[1]);
      if (lon !== null && lat !== null) return [lon, lat];
    }
    const lon = asNumber(c.lon ?? c.lng ?? c.x);
    const lat = asNumber(c.lat ?? c.y);
    if (lon !== null && lat !== null) return [lon, lat];
  }
  return null;
}

function inferEmergency(tags: Record<string, any>): boolean {
  const emergency = String(tags.emergency ?? "").toLowerCase();
  const openingHours = String(tags.opening_hours ?? "").toLowerCase();
  const name = String(tags.name ?? "").toLowerCase();
  const speciality = String(tags["healthcare:speciality"] ?? tags.healthcare_speciality ?? "").toLowerCase();

  return (
    emergency === "yes" ||
    openingHours.includes("24/7") ||
    name.includes("emergency") ||
    speciality.includes("emergency")
  );
}

function classifyVetKind(tags: Record<string, any>): SafetyVet["kind"] {
  if (inferEmergency(tags)) return "emergency_vet";
  const amenity = String(tags.amenity ?? "").toLowerCase();
  const healthcare = String(tags.healthcare ?? "").toLowerCase();

  if (amenity === "veterinary" || healthcare === "veterinary") return "veterinary";
  if (amenity === "animal_hospital" || healthcare === "animal_hospital") return "animal_hospital";
  return "unknown";
}

function vetQuery(lat: number, lon: number, radiusMeters: number): string {
  return `[out:json][timeout:60];
(
  node["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});
  way["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});
  relation["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});

  node["healthcare"="veterinary"](around:${radiusMeters},${lat},${lon});
  way["healthcare"="veterinary"](around:${radiusMeters},${lat},${lon});
  relation["healthcare"="veterinary"](around:${radiusMeters},${lat},${lon});

  node["healthcare"="animal_hospital"](around:${radiusMeters},${lat},${lon});
  way["healthcare"="animal_hospital"](around:${radiusMeters},${lat},${lon});
  relation["healthcare"="animal_hospital"](around:${radiusMeters},${lat},${lon});

  node["amenity"="animal_hospital"](around:${radiusMeters},${lat},${lon});
  way["amenity"="animal_hospital"](around:${radiusMeters},${lat},${lon});
  relation["amenity"="animal_hospital"](around:${radiusMeters},${lat},${lon});
);
out center tags;`;
}

export async function computeSafety(
  system: any,
  deps: {
    overpass: (query: string) => Promise<any>;
    radiusMeters?: number;
    localVets?: { elements: any[]; bboxes: ([number, number, number, number] | null)[] } | null;
    filterByRadius?: (index: any, lat: number, lon: number, radiusM: number) => any[];
  }
): Promise<SafetyOutput> {
  const s: AnyRecord = system && typeof system === "object" ? system : {};
  const crowdSignals: AnyRecord = s.crowdSignals && typeof s.crowdSignals === "object" ? s.crowdSignals : {};

  const entranceCount = asNumber(crowdSignals.entranceCount) ?? 0;
  const busStopCount = asNumber(crowdSignals.busStopCount) ?? 0;
  const urbanScore = asNumber(crowdSignals.urbanScore) ?? 0;
  const crowdParkingCapacity = asNumber(crowdSignals.parkingCapacity) ?? 0;
  const parkingCapacityEstimate = asNumber(s.parkingCapacityEstimate) ?? 0;

  let emergencyAccessScore = 0.3;
  const emergencyAccessReasons: string[] = [];

  if (entranceCount >= 10) {
    emergencyAccessScore += 0.25;
    emergencyAccessReasons.push("Many entrances / access points");
  }
  if (crowdParkingCapacity >= 50 || parkingCapacityEstimate >= 50) {
    emergencyAccessScore += 0.15;
    emergencyAccessReasons.push("Large parking nearby");
  }
  if (busStopCount >= 5) {
    emergencyAccessScore += 0.1;
    emergencyAccessReasons.push("Transit access available nearby");
  }
  if (urbanScore >= 0.8) {
    emergencyAccessScore += 0.2;
    emergencyAccessReasons.push("Urban-adjacent (faster emergency response)");
  }

  emergencyAccessScore = clamp01(emergencyAccessScore);
  const emergencyAccessClass: SafetyOutput["emergencyAccessClass"] =
    emergencyAccessScore >= 0.7 ? "high" : emergencyAccessScore >= 0.45 ? "medium" : "low";

  let cellCoverageProxy: SafetyOutput["cellCoverageProxy"] = "unknown";
  const cellCoverageReasons: string[] = [];

  if (urbanScore >= 0.8 && entranceCount >= 5) {
    cellCoverageProxy = "likely";
    cellCoverageReasons.push("Proxy: urban density suggests coverage likely.");
    cellCoverageReasons.push("Proxy: many access points indicate stronger service corridors.");
  } else if (urbanScore <= 0.3 && entranceCount <= 2) {
    cellCoverageProxy = "unlikely";
    cellCoverageReasons.push("Proxy: low urban density suggests weaker coverage.");
    cellCoverageReasons.push("Proxy: few access points can correlate with limited infrastructure.");
  } else {
    cellCoverageProxy = "unknown";
    cellCoverageReasons.push("Proxy only: available signals are mixed.");
  }

  const centroid = centroidFromSystem(s);
  if (!centroid) {
    return {
      nearbyVets: [],
      vetCountWithin5km: 0,
      emergencyVetCountWithin10km: 0,
      emergencyAccessScore,
      emergencyAccessClass,
      emergencyAccessReasons: capReasons(emergencyAccessReasons),
      cellCoverageProxy,
      cellCoverageReasons: capReasons(cellCoverageReasons),
    };
  }

  const [lon, lat] = centroid;
  const radiusMeters =
    typeof deps.radiusMeters === "number" && Number.isFinite(deps.radiusMeters) && deps.radiusMeters > 0
      ? deps.radiusMeters
      : 10_000;

  let elements: any[];
  if (deps.localVets && deps.filterByRadius) {
    elements = deps.filterByRadius(deps.localVets, lat, lon, radiusMeters);
  } else {
    const raw = await deps.overpass(vetQuery(lat, lon, radiusMeters));
    elements = Array.isArray(raw) ? raw : Array.isArray(raw?.elements) ? raw.elements : [];
  }

  const vets: SafetyVet[] = [];
  const seen = new Set<string>();

  for (const el of elements) {
    const type = String(el?.type ?? "");
    const id = el?.id;
    if (!type || id === undefined || id === null) continue;

    const elLon = asNumber(el?.lon ?? el?.center?.lon);
    const elLat = asNumber(el?.lat ?? el?.center?.lat);
    if (elLon === null || elLat === null) continue;

    const osmId = `${type}/${id}`;
    if (seen.has(osmId)) continue;
    seen.add(osmId);

    const tags: Record<string, any> = el?.tags && typeof el.tags === "object" ? el.tags : {};
    const distanceToCentroidMeters = haversineMeters(centroid, [elLon, elLat]);

    vets.push({
      source: "osm",
      osmId,
      name: typeof tags.name === "string" ? tags.name : null,
      kind: classifyVetKind(tags),
      location: { type: "Point", coordinates: [elLon, elLat] },
      distanceToCentroidMeters,
      tags,
    });
  }

  vets.sort((a, b) => a.distanceToCentroidMeters - b.distanceToCentroidMeters);

  const vetCountWithin5km = vets.filter((v) => v.distanceToCentroidMeters <= 5_000).length;
  const emergencyVetCountWithin10km = vets.filter(
    (v) => v.distanceToCentroidMeters <= 10_000 && v.kind === "emergency_vet"
  ).length;

  return {
    nearbyVets: vets.slice(0, 5),
    vetCountWithin5km,
    emergencyVetCountWithin10km,
    emergencyAccessScore,
    emergencyAccessClass,
    emergencyAccessReasons: capReasons(emergencyAccessReasons),
    cellCoverageProxy,
    cellCoverageReasons: capReasons(cellCoverageReasons),
  };
}
