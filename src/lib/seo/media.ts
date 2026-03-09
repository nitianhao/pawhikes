import { absoluteUrl } from "@/lib/seo/site";

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function toAbsoluteMediaUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  if (isAbsoluteHttpUrl(raw)) return raw;
  return absoluteUrl(raw.startsWith("/") ? raw : `/${raw}`);
}

export function defaultOgImages(): Array<{ url: string; alt: string }> {
  return [
    {
      url: absoluteUrl("/icon.svg"),
      alt: "Paw Hikes dog-friendly hiking trails",
    },
  ];
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function pickImageCandidate(source: unknown): string | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;
  const directKeys = [
    "heroImageUrl",
    "coverImageUrl",
    "imageUrl",
    "photoUrl",
    "thumbnailUrl",
    "googlePhotoUri",
  ];
  for (const key of directKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  const listKeys = ["trailheadPOIs", "trailHeads", "trailheads", "photos", "images"];
  for (const key of listKeys) {
    const list = record[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const nested = pickImageCandidate(item);
      if (nested) return nested;
    }
  }
  return null;
}

export function trailheadImageAlt(input: {
  trailheadName?: string | null;
  trailName?: string | null;
  cityName?: string | null;
  stateName?: string | null;
}): string {
  const trailheadName = normalizeLabel(input.trailheadName);
  const trailName = normalizeLabel(input.trailName);
  const cityName = normalizeLabel(input.cityName);
  const stateName = normalizeLabel(input.stateName);
  const place = [cityName, stateName].filter((item): item is string => Boolean(item)).join(", ");

  const parts: string[] = [];
  parts.push(trailheadName ? `${trailheadName} trailhead` : "Trailhead access point");
  if (trailName) parts.push(`for ${trailName}`);
  if (place) parts.push(`in ${place}`);
  return parts.join(" ");
}

export function pickDirectoryOgImage(input: {
  systems: unknown[];
  pageLabel: string;
}): Array<{ url: string; alt: string }> {
  for (const system of input.systems) {
    const candidate = pickImageCandidate(system);
    const absolute = toAbsoluteMediaUrl(candidate);
    if (absolute) {
      return [
        {
          url: absolute,
          alt: `${input.pageLabel} dog-friendly trail overview`,
        },
      ];
    }
  }
  return defaultOgImages();
}

export function pickTrailOgImage(input: {
  trailheadPhotoUri?: string | null;
  trailName?: string | null;
  cityName?: string | null;
  stateName?: string | null;
}): Array<{ url: string; alt: string }> {
  const image = toAbsoluteMediaUrl(input.trailheadPhotoUri ?? null);
  if (!image) return defaultOgImages();
  const trailName = normalizeLabel(input.trailName);
  const cityName = normalizeLabel(input.cityName);
  const stateName = normalizeLabel(input.stateName);
  const place = [cityName, stateName].filter((item): item is string => Boolean(item)).join(", ");
  const alt = trailName
    ? `${trailName} trail access photo${place ? ` in ${place}` : ""}`
    : `Dog-friendly trail access photo${place ? ` in ${place}` : ""}`;
  return [
    {
      url: image,
      alt,
    },
  ];
}
