// @ts-nocheck
import type { Highlight, HighlightRaw } from "./types";

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

export function humanize(input: string): string {
  const spaced = input.replace(/_/g, " ").trim();
  if (!spaced) return "";
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Title derivation (first match wins)
// ---------------------------------------------------------------------------

export function getHighlightTitle(raw: HighlightRaw): string {
  if (raw.name && raw.name.trim()) return raw.name.trim();

  const t = raw.tags ?? {};
  if (t.name && t.name.trim()) return t.name.trim();
  if (t.historic) return humanize(t.historic);
  if (t.ruins) return `${humanize(t.ruins)} Ruins`;
  if (t.tourism) return humanize(t.tourism);
  if (t.natural) return humanize(t.natural);
  if (t.amenity) return humanize(t.amenity);

  return humanize(raw.kind) || "Highlight";
}

// ---------------------------------------------------------------------------
// Category + icon derivation
// ---------------------------------------------------------------------------

export function getHighlightPresentation(raw: HighlightRaw): {
  category: string;
  iconKey: string;
} {
  if (raw.kind === "historic") {
    const t = raw.tags ?? {};
    let iconKey = "landmark";
    if (t.historic === "railway") iconKey = "train";
    else if (t.historic === "memorial") iconKey = "memorial";
    else if (t.historic === "ruins" || t.ruins) iconKey = "ruins";
    return { category: "Historic", iconKey };
  }
  return { category: humanize(raw.kind) || "Other", iconKey: "pin" };
}

// ---------------------------------------------------------------------------
// Subtitle derivation
// ---------------------------------------------------------------------------

export function getHighlightSubtitle(raw: HighlightRaw): string {
  const { category } = getHighlightPresentation(raw);
  const t = raw.tags ?? {};

  let descriptor: string | null = null;
  if (t.historic) {
    descriptor = t.historic;
  } else if (t.ruins) {
    descriptor = `ruins (${t.ruins})`;
  } else if (t.tourism) {
    descriptor = t.tourism;
  } else if (t.natural) {
    descriptor = t.natural;
  } else if (t.amenity) {
    descriptor = t.amenity;
  }

  if (descriptor) return `${category} · ${descriptor}`;
  return category;
}

// ---------------------------------------------------------------------------
// Distance formatting
// ---------------------------------------------------------------------------

export function formatDistanceLong(m: number): string {
  if (m < 1000) return `${Math.round(m)} m from trail`;
  return `${(m / 1000).toFixed(1)} km from trail`;
}

export function formatDistanceShort(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

// ---------------------------------------------------------------------------
// OSM URL
// ---------------------------------------------------------------------------

function buildOsmUrl(
  osmId: string,
  osmType: string,
  numericId: string | null,
): string {
  const slashMatch = osmId.match(/^(node|way|relation)\/(.+)$/);
  if (slashMatch) {
    return `https://www.openstreetmap.org/${slashMatch[1]}/${slashMatch[2]}`;
  }
  if (numericId) {
    return `https://www.openstreetmap.org/${osmType}/${numericId}`;
  }
  return `https://www.openstreetmap.org/${osmType}/${osmId}`;
}

// ---------------------------------------------------------------------------
// Parse numeric id from osmId
// ---------------------------------------------------------------------------

function parseNumericId(osmId: string): string | null {
  const slashMatch = osmId.match(/^(?:node|way|relation)\/(\d+)$/);
  if (slashMatch) return slashMatch[1];
  if (/^\d+$/.test(osmId)) return osmId;
  return null;
}

// ---------------------------------------------------------------------------
// Single-item normalization
// ---------------------------------------------------------------------------

const VALID_OSM_TYPES = new Set(["node", "way", "relation"]);

export function normalizeHighlight(raw: HighlightRaw): Highlight | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    if (typeof raw.kind !== "string" || !raw.kind) return null;
    if (typeof raw.osmId !== "string" || !raw.osmId) return null;
    if (!VALID_OSM_TYPES.has(raw.osmType)) return null;

    const coords = raw.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lng = coords[0];
    const lat = coords[1];
    if (typeof lng !== "number" || typeof lat !== "number") return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

    const dist =
      typeof raw.distanceToTrailMeters === "number" &&
      Number.isFinite(raw.distanceToTrailMeters)
        ? raw.distanceToTrailMeters
        : 0;

    const osmNumericId = parseNumericId(raw.osmId);
    const id = osmNumericId
      ? `${raw.osmType}:${osmNumericId}`
      : `${raw.osmType}:${raw.osmId}`;

    const { category, iconKey } = getHighlightPresentation(raw);

    return {
      id,
      kind: raw.kind,
      title: getHighlightTitle(raw),
      subtitle: getHighlightSubtitle(raw),
      category,
      categoryLabel: category,
      iconKey,
      distanceM: dist,
      distanceLabel: formatDistanceLong(dist),
      distanceShort: formatDistanceShort(dist),
      lat,
      lng,
      osmUrl: buildOsmUrl(raw.osmId, raw.osmType, osmNumericId),
      rawTags: raw.tags && typeof raw.tags === "object" ? raw.tags : {},
      osmType: raw.osmType,
      osmNumericId,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Batch normalization + sort
// ---------------------------------------------------------------------------

export function normalizeHighlights(
  raws?: HighlightRaw[] | null,
): Highlight[] {
  if (!Array.isArray(raws)) return [];
  const result: Highlight[] = [];
  for (const raw of raws) {
    const h = normalizeHighlight(raw);
    if (h) result.push(h);
  }
  result.sort((a, b) => a.distanceM - b.distanceM);
  return result;
}
