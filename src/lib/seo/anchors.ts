function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function placeLabel(cityName?: string | null, stateName?: string | null): string | null {
  const city = clean(cityName);
  const state = clean(stateName);
  if (city && state) return `${city}, ${state}`;
  return city ?? state ?? null;
}

export function trailGuideCtaLabel(trailName: string): string {
  const name = clean(trailName) ?? "this trail";
  return `View ${name} trail guide`;
}

export function trailGuideAriaLabel(input: {
  trailName: string;
  cityName?: string | null;
  stateName?: string | null;
}): string {
  const name = clean(input.trailName) ?? "Trail";
  const place = placeLabel(input.cityName, input.stateName);
  if (!place) return `${name} dog-friendly trail details`;
  return `${name} dog-friendly trail details in ${place}`;
}

export function cityDirectoryAriaLabel(input: {
  cityName: string;
  stateName?: string | null;
}): string {
  const city = clean(input.cityName) ?? "city";
  const state = clean(input.stateName);
  if (!state) return `Browse dog-friendly trails in ${city}`;
  return `Browse dog-friendly trails in ${city}, ${state}`;
}
