import { deslugifyCity } from "@/lib/slug";
import { normalizeState } from "@/lib/trailSlug";

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas",
  CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho",
  IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia",
  WI: "Wisconsin", WY: "Wyoming", DC: "Washington D.C.",
};

export type BreadcrumbEntity = {
  name: string;
  path: string;
};

export function resolveStateName(state: string | null | undefined): string {
  const normalized = normalizeState(state);
  if (/^[A-Z]{2}$/.test(normalized)) return STATE_NAMES[normalized] ?? normalized;
  return normalized;
}

export function humanCityName(citySlugOrName: string | null | undefined): string {
  const raw = String(citySlugOrName ?? "").trim();
  if (!raw) return "Unknown city";
  if (raw.includes("-")) return deslugifyCity(raw);
  return raw;
}

export function normalizeBreadcrumbs(items: BreadcrumbEntity[]): BreadcrumbEntity[] {
  const out: BreadcrumbEntity[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const name = String(item.name ?? "").trim();
    const path = String(item.path ?? "").trim();
    if (!name || !path) continue;
    const key = `${name.toLowerCase()}::${path.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, path: path.startsWith("/") ? path : `/${path}` });
  }
  return out;
}

export function normalizeEntityName(name: unknown, fallback = "Trail"): string {
  const value = String(name ?? "").trim();
  return value.length > 0 ? value : fallback;
}
