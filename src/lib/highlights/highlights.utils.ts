import type { Highlight, HighlightRaw } from "./types";

export type HighlightSort = "closest" | "farthest" | "name" | "category";

const VALID_OSM_TYPES = new Set<HighlightRaw["osmType"]>(["node", "way", "relation"]);

export function humanize(str: string): string {
  const source = String(str ?? "").replace(/_/g, " ").trim();
  if (!source) return "";
  return source.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function sanitizeTags(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (!k) continue;
    if (v == null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

function parseDistance(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function parseOsmNumericId(osmIdRaw: string): string | null {
  const slashMatch = osmIdRaw.match(/^(?:node|way|relation)\/(\d+)$/);
  if (slashMatch) return slashMatch[1];
  if (/^\d+$/.test(osmIdRaw)) return osmIdRaw;
  return null;
}

function getOsmUrl(
  osmIdRaw: string,
  osmType: HighlightRaw["osmType"],
  osmNumericId: string | null,
): string | null {
  const slashMatch = osmIdRaw.match(/^(node|way|relation)\/(.+)$/);
  if (slashMatch) return `https://www.openstreetmap.org/${slashMatch[1]}/${slashMatch[2]}`;
  if (osmNumericId) return `https://www.openstreetmap.org/${osmType}/${osmNumericId}`;
  if (osmIdRaw) return `https://www.openstreetmap.org/${osmType}/${osmIdRaw}`;
  return null;
}

function deriveTypeLabel(tags: Record<string, string>): string | null {
  if (tags.historic) return humanize(tags.historic);
  if (tags.ruins) return `Ruins (${tags.ruins})`;
  if (tags.tourism) return humanize(tags.tourism);
  if (tags.natural) return humanize(tags.natural);
  if (tags.amenity) return humanize(tags.amenity);
  return null;
}

function deriveCategoryAndIcon(kind: string, tags: Record<string, string>): Pick<Highlight, "categoryLabel" | "iconKey"> {
  if (kind === "historic") {
    if (tags.historic === "railway") return { categoryLabel: "Historic", iconKey: "train" };
    if (tags.historic === "memorial") return { categoryLabel: "Historic", iconKey: "memorial" };
    if (tags.historic === "ruins" || tags.ruins) return { categoryLabel: "Historic", iconKey: "ruins" };
    return { categoryLabel: "Historic", iconKey: "landmark" };
  }
  return { categoryLabel: humanize(kind) || "Highlight", iconKey: "pin" };
}

function deriveTitle(name: string | null | undefined, kind: string, tags: Record<string, string>): string {
  const name1 = String(name ?? "").trim();
  if (name1) return name1;
  const name2 = String(tags.name ?? "").trim();
  if (name2) return name2;
  if (tags.historic) return humanize(tags.historic);
  if (tags.ruins) return `${humanize(tags.ruins)} Ruins`;
  if (tags.tourism) return humanize(tags.tourism);
  if (tags.natural) return humanize(tags.natural);
  if (tags.amenity) return humanize(tags.amenity);
  return humanize(kind) || "Highlight";
}

export function formatDistanceShort(distanceM: number): string {
  if (!Number.isFinite(distanceM)) return "Unknown distance";
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  return `${(distanceM / 1000).toFixed(1)} km`;
}

export function formatDistanceLong(distanceM: number): string {
  const short = formatDistanceShort(distanceM);
  return short === "Unknown distance" ? short : `${short} from trail`;
}

export function getDistanceBand(distanceM: number): Highlight["distanceBand"] {
  if (!Number.isFinite(distanceM)) return "off-route";
  if (distanceM <= 5) return "on-trail";
  if (distanceM <= 25) return "very-close";
  if (distanceM <= 75) return "close";
  if (distanceM <= 250) return "nearby";
  return "off-route";
}

export function getSubtitle(highlight: Pick<Highlight, "categoryLabel" | "typeLabel">): string {
  return highlight.typeLabel ? `${highlight.categoryLabel} · ${highlight.typeLabel}` : highlight.categoryLabel;
}

function normalizeOne(rawInput: unknown, index: number): Highlight {
  const rawSafe = (rawInput && typeof rawInput === "object" ? rawInput : {}) as Partial<HighlightRaw>;
  const kind = typeof rawSafe.kind === "string" ? rawSafe.kind : "";
  const tags = sanitizeTags(rawSafe.tags);
  const osmIdRaw = typeof rawSafe.osmId === "string" ? rawSafe.osmId : "";
  const osmType: HighlightRaw["osmType"] = VALID_OSM_TYPES.has(rawSafe.osmType as HighlightRaw["osmType"])
    ? (rawSafe.osmType as HighlightRaw["osmType"])
    : "node";
  const coordinates = Array.isArray(rawSafe.location?.coordinates) ? rawSafe.location?.coordinates : [];
  const lng = typeof coordinates?.[0] === "number" && Number.isFinite(coordinates[0]) ? coordinates[0] : 0;
  const lat = typeof coordinates?.[1] === "number" && Number.isFinite(coordinates[1]) ? coordinates[1] : 0;
  const distanceM = parseDistance(rawSafe.distanceToTrailMeters);
  const typeLabel = deriveTypeLabel(tags);
  const { categoryLabel, iconKey } = deriveCategoryAndIcon(kind, tags);
  const title = deriveTitle(rawSafe.name, kind, tags) || "Unknown highlight";
  const osmNumericId = parseOsmNumericId(osmIdRaw);
  const idBase = osmNumericId ? `${osmType}:${osmNumericId}` : `${osmType}:${osmIdRaw || `missing-${index}`}`;
  const isIncomplete =
    !kind ||
    !osmIdRaw ||
    !Number.isFinite(distanceM) ||
    !Array.isArray(rawSafe.location?.coordinates) ||
    !Number.isFinite(rawSafe.location?.coordinates?.[0] as number) ||
    !Number.isFinite(rawSafe.location?.coordinates?.[1] as number);

  const raw: HighlightRaw = {
    kind: kind || "unknown",
    name: typeof rawSafe.name === "string" ? rawSafe.name : null,
    tags,
    osmId: osmIdRaw || "unknown",
    osmType,
    location: {
      type: "Point",
      coordinates: [lng, lat],
    },
    distanceToTrailMeters: Number.isFinite(distanceM) ? distanceM : 0,
  };

  return {
    id: idBase,
    kind: kind || "unknown",
    title: title || "Unknown highlight",
    typeLabel,
    categoryLabel,
    iconKey,
    distanceM,
    distanceShort: formatDistanceShort(distanceM),
    distanceLong: formatDistanceLong(distanceM),
    distanceBand: getDistanceBand(distanceM),
    lat,
    lng,
    osmType,
    osmIdRaw,
    osmNumericId,
    osmUrl: getOsmUrl(osmIdRaw, osmType, osmNumericId),
    tags,
    raw,
    isIncomplete,
  };
}

export function normalizeHighlights(raws?: HighlightRaw[] | null): Highlight[] {
  if (!Array.isArray(raws)) return [];
  const normalized = raws.map((raw, i) => {
    try {
      return normalizeOne(raw, i);
    } catch {
      return normalizeOne({}, i);
    }
  });
  return sortHighlights(normalized, "closest");
}

export function matchesHighlightSearch(highlight: Highlight, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    highlight.title,
    highlight.typeLabel ?? "",
    highlight.categoryLabel,
    ...Object.keys(highlight.tags),
    ...Object.values(highlight.tags),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

export function sortHighlights(highlights: Highlight[], sortBy: HighlightSort): Highlight[] {
  const list = [...highlights];
  if (sortBy === "farthest") {
    return list.sort((a, b) => {
      const ad = Number.isFinite(a.distanceM) ? a.distanceM : Number.POSITIVE_INFINITY;
      const bd = Number.isFinite(b.distanceM) ? b.distanceM : Number.POSITIVE_INFINITY;
      return bd - ad;
    });
  }
  if (sortBy === "name") {
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }
  if (sortBy === "category") {
    return list.sort((a, b) => {
      const c = a.categoryLabel.localeCompare(b.categoryLabel);
      if (c !== 0) return c;
      const ad = Number.isFinite(a.distanceM) ? a.distanceM : Number.POSITIVE_INFINITY;
      const bd = Number.isFinite(b.distanceM) ? b.distanceM : Number.POSITIVE_INFINITY;
      return ad - bd;
    });
  }
  return list.sort((a, b) => {
    const ad = Number.isFinite(a.distanceM) ? a.distanceM : Number.POSITIVE_INFINITY;
    const bd = Number.isFinite(b.distanceM) ? b.distanceM : Number.POSITIVE_INFINITY;
    return ad - bd;
  });
}
