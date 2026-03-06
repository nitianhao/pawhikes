import { toLatLngTuple } from "@/lib/geo/coords";

export type AmenityPoint = {
  id: string;
  kind: "bench" | "shelter" | "restroom" | "waste_bin" | "drinking_water";
  lat: number;
  lon: number;
  source?: string;
  name?: string;
};

export type ParkingPoint = {
  id: string;
  lat: number;
  lon: number;
  name: string | null;
  capacity: number | null;
  fee: string | null;
  access: string | null;
};

type RawPoi = {
  osmId?: unknown;
  osmType?: unknown;
  kind?: unknown;
  name?: unknown;
  location?: unknown;
  tags?: unknown;
};

const KIND_MAP: Record<string, AmenityPoint["kind"] | null> = {
  bench: "bench",
  shelter: "shelter",
  toilets: "restroom",
  waste_basket: "waste_bin",
  drinking_water: "drinking_water",
};

function asCoordinatePair(value: unknown): [number, number] | null {
  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  ) {
    return [value[0], value[1]];
  }
  return null;
}

export function extractAmenityPoints(raw: unknown): {
  amenityPoints: AmenityPoint[];
  hasCoordinateBearingAmenities: boolean;
} {
  const arr = Array.isArray(raw) ? raw : [];
  const amenityPoints: AmenityPoint[] = [];

  arr.forEach((item, index) => {
    const poi = item as RawPoi;
    const kindRaw = typeof poi?.kind === "string" ? poi.kind.trim().toLowerCase() : "";
    const kind = KIND_MAP[kindRaw] ?? null;
    if (!kind) return;

    const location = poi.location && typeof poi.location === "object" ? poi.location as { coordinates?: unknown } : null;
    const pair = asCoordinatePair(location?.coordinates);
    if (!pair) return;

    const [lat, lon] = toLatLngTuple(pair);
    amenityPoints.push({
      id:
        typeof poi.osmId === "string" && poi.osmId.trim() !== ""
          ? poi.osmId
          : `amenity-${kind}-${index + 1}`,
      kind,
      lat,
      lon,
      source: typeof poi.osmType === "string" ? poi.osmType : undefined,
      name: typeof poi.name === "string" && poi.name.trim() !== "" ? poi.name.trim() : undefined,
    });
  });

  return { amenityPoints, hasCoordinateBearingAmenities: amenityPoints.length > 0 };
}

export function extractParkingPoints(raw: unknown): ParkingPoint[] {
  const arr = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const points: ParkingPoint[] = [];

  arr.forEach((item, index) => {
    const poi = item as RawPoi;
    const kindRaw = typeof poi?.kind === "string" ? poi.kind.trim().toLowerCase() : "";
    if (kindRaw !== "parking" && kindRaw !== "parking_entrance") return;

    const location = poi.location && typeof poi.location === "object" ? poi.location as { coordinates?: unknown } : null;
    const pair = asCoordinatePair(location?.coordinates);
    if (!pair) return;

    const osmId =
      typeof poi.osmId === "string" && poi.osmId.trim() !== ""
        ? poi.osmId
        : `parking-${index + 1}`;
    if (seen.has(osmId)) return;
    seen.add(osmId);

    const [lat, lon] = toLatLngTuple(pair);
    const tags = poi.tags && typeof poi.tags === "object" ? (poi.tags as Record<string, string>) : {};
    const rawCapacity = typeof tags.capacity === "string" ? parseInt(tags.capacity, 10) : NaN;

    points.push({
      id: osmId,
      lat,
      lon,
      name: typeof poi.name === "string" && poi.name.trim() !== "" ? poi.name.trim() : null,
      capacity: Number.isFinite(rawCapacity) && rawCapacity > 0 ? rawCapacity : null,
      fee: typeof tags.fee === "string" && tags.fee.trim() !== "" ? tags.fee.trim() : null,
      access: typeof tags.access === "string" && tags.access.trim() !== "" ? tags.access.trim() : null,
    });
  });

  return points;
}
