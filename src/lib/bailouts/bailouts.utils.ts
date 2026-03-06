export type BailoutPointRaw = {
  kind: string;
  name: string | null;
  anchor: string;
  location: { type: "Point"; coordinates: [number, number] };
  distanceToAnchorMeters: number;
};

export type BailoutAnchorKey = "start" | "centroid" | "end";

export type BailoutSpot = {
  id: string;
  lat: number;
  lng: number;
  kinds: string[];
  primaryKind: string;
  name: string | null;
  anchors: Record<string, number>;
  title: string;
  subtitle: string;
  badges: string[];
  distanceForSelectedAnchorM: number | null;
  distanceShort: string | null;
  distanceLong: string | null;
  googleMapsUrl: string;
  osmUrl: string | null;
  rawPoints: BailoutPointRaw[];
};

const KIND_PRIORITY = ["entrance", "intersection", "dead_end"] as const;
const DEFAULT_ANCHOR_FOR_SUBTITLE: BailoutAnchorKey = "start";

function normalizeToken(input: unknown): string {
  return String(input ?? "").trim().toLowerCase();
}

export function humanize(input: string): string {
  const source = String(input ?? "").replace(/_/g, " ").trim();
  if (!source) return "";
  return source.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function anchorLabel(anchor: string): string {
  const a = normalizeToken(anchor);
  if (a === "start") return "Start";
  if (a === "end") return "End";
  if (a === "centroid") return "Midpoint";
  return humanize(a) || "Unknown anchor";
}

function sortKindsByPriority(kinds: string[]): string[] {
  const uniq = Array.from(new Set(kinds.map(normalizeToken).filter(Boolean)));
  return uniq.sort((a, b) => {
    const ai = KIND_PRIORITY.indexOf(a as (typeof KIND_PRIORITY)[number]);
    const bi = KIND_PRIORITY.indexOf(b as (typeof KIND_PRIORITY)[number]);
    const ap = ai === -1 ? Number.POSITIVE_INFINITY : ai;
    const bp = bi === -1 ? Number.POSITIVE_INFINITY : bi;
    if (ap !== bp) return ap - bp;
    return a.localeCompare(b);
  });
}

function selectPrimaryKind(kinds: string[]): string {
  const sorted = sortKindsByPriority(kinds);
  return sorted[0] ?? "unknown";
}

function titleFrom(primaryKind: string, name: string | null): string {
  const n = String(name ?? "").trim();
  if (n) return n;
  const k = normalizeToken(primaryKind);
  if (k === "entrance") return "Trail entrance / exit";
  if (k === "intersection") return "Intersection / connector";
  if (k === "dead_end") return "Dead end (limited options)";
  return humanize(k) || "Bailout spot";
}

export function formatDistanceShort(distanceM: number): string {
  if (!Number.isFinite(distanceM)) return "Unknown distance";
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

export function formatDistanceLong(distanceM: number, anchor: string): string {
  const short = formatDistanceShort(distanceM);
  if (short === "Unknown distance") return short;
  return `${short} from ${anchorLabel(anchor).toLowerCase()}`;
}

function validCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function makeClusterKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)}:${lng.toFixed(5)}`;
}

function defaultSubtitle(anchors: Record<string, number>): string {
  const anchorOrder: string[] = ["start", "centroid", "end"];
  const first = anchorOrder.find((key) => typeof anchors[key] === "number" && Number.isFinite(anchors[key]));
  const key = first ?? DEFAULT_ANCHOR_FOR_SUBTITLE;
  const distance = anchors[key];
  if (distance == null || !Number.isFinite(distance)) return `Near ${anchorLabel(key)}`;
  return `Near ${anchorLabel(key)} · ${formatDistanceLong(distance, key)}`;
}

function getAnchorDistance(spot: BailoutSpot, anchor: BailoutAnchorKey): number | null {
  const value = spot.anchors[anchor];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function deriveSpotForAnchor(spot: BailoutSpot, selectedAnchor: BailoutAnchorKey): BailoutSpot {
  const distance = getAnchorDistance(spot, selectedAnchor);
  const short = distance == null ? null : formatDistanceShort(distance);
  const long = distance == null ? null : formatDistanceLong(distance, selectedAnchor);
  return {
    ...spot,
    distanceForSelectedAnchorM: distance,
    distanceShort: short,
    distanceLong: long,
    subtitle:
      distance == null
        ? `Near ${anchorLabel(selectedAnchor)}`
        : `Near ${anchorLabel(selectedAnchor)} · ${long}`,
  };
}

export function isActionableExit(spot: BailoutSpot): boolean {
  const kinds = new Set(spot.kinds.map(normalizeToken));
  return kinds.has("entrance") || kinds.has("intersection");
}

export function isDeadEndOnly(spot: BailoutSpot): boolean {
  const kinds = new Set(spot.kinds.map(normalizeToken));
  return kinds.has("dead_end") && !kinds.has("entrance") && !kinds.has("intersection");
}

export function sortSpotsBySelectedAnchorDistance(spots: BailoutSpot[]): BailoutSpot[] {
  return [...spots].sort((a, b) => {
    const ad = a.distanceForSelectedAnchorM ?? Number.POSITIVE_INFINITY;
    const bd = b.distanceForSelectedAnchorM ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.title.localeCompare(b.title);
  });
}

export function normalizeBailoutPoints(raws?: BailoutPointRaw[] | null): BailoutSpot[] {
  try {
    if (!Array.isArray(raws)) return [];

    const clusters = new Map<
      string,
      {
        id: string;
        lat: number;
        lng: number;
        kinds: Set<string>;
        anchors: Record<string, number>;
        name: string | null;
        rawPoints: BailoutPointRaw[];
      }
    >();

    for (const input of raws) {
      if (!input || typeof input !== "object") continue;
      const coords = (input as BailoutPointRaw)?.location?.coordinates;
      if (!validCoordinatePair(coords)) continue;

      const lng = coords[0];
      const lat = coords[1];
      const key = makeClusterKey(lat, lng);
      const kind = normalizeToken((input as BailoutPointRaw).kind);
      const anchor = normalizeToken((input as BailoutPointRaw).anchor);
      const distance = (input as BailoutPointRaw).distanceToAnchorMeters;
      const name = String((input as BailoutPointRaw).name ?? "").trim();

      const existing =
        clusters.get(key) ??
        {
          id: key,
          lat,
          lng,
          kinds: new Set<string>(),
          anchors: {} as Record<string, number>,
          name: null,
          rawPoints: [] as BailoutPointRaw[],
        };

      if (kind) existing.kinds.add(kind);
      if (anchor && typeof distance === "number" && Number.isFinite(distance)) {
        const prev = existing.anchors[anchor];
        if (prev == null || distance < prev) {
          existing.anchors[anchor] = distance;
        }
      }
      if (!existing.name && name) existing.name = name;

      existing.rawPoints.push({
        kind: String((input as BailoutPointRaw).kind ?? ""),
        name: (input as BailoutPointRaw).name ?? null,
        anchor: String((input as BailoutPointRaw).anchor ?? ""),
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        distanceToAnchorMeters:
          typeof distance === "number" && Number.isFinite(distance) ? distance : Number.NaN,
      });

      clusters.set(key, existing);
    }

    const spots: BailoutSpot[] = Array.from(clusters.values()).map((cluster) => {
      const kinds = sortKindsByPriority(Array.from(cluster.kinds));
      const primaryKind = selectPrimaryKind(kinds);
      const title = titleFrom(primaryKind, cluster.name);
      return {
        id: cluster.id,
        lat: cluster.lat,
        lng: cluster.lng,
        kinds,
        primaryKind,
        name: cluster.name,
        anchors: cluster.anchors,
        title,
        subtitle: defaultSubtitle(cluster.anchors),
        badges: kinds.map((k) => humanize(k) || "Other"),
        distanceForSelectedAnchorM: null,
        distanceShort: null,
        distanceLong: null,
        googleMapsUrl: `https://www.google.com/maps?q=${cluster.lat},${cluster.lng}`,
        osmUrl: null,
        rawPoints: cluster.rawPoints,
      };
    });

    return spots.sort((a, b) => {
      const actionableA = isActionableExit(a) ? 0 : 1;
      const actionableB = isActionableExit(b) ? 0 : 1;
      if (actionableA !== actionableB) return actionableA - actionableB;
      return a.title.localeCompare(b.title);
    });
  } catch {
    return [];
  }
}
