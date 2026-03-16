import { normalizeEntityName } from "@/lib/seo/entities";

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizePolicy(value: unknown): string | null {
  if (!hasText(value)) return null;
  return value.trim();
}

function policySnippet(policy: string | null): string | null {
  if (!policy) return null;
  const lower = policy.toLowerCase();
  if (/(off[- ]?leash|leash optional)/.test(lower)) return "off-leash policy details";
  if (/(on[- ]?leash|required)/.test(lower)) return "leash-required policy details";
  return `dog policy: ${policy}`;
}

export function homeTitle(): string {
  return "Dog-Friendly Hiking Trails Directory";
}

export function homeDescription(input: {
  stateCount: number;
  cityCount: number;
  trailCount: number;
}): string {
  const { stateCount, cityCount, trailCount } = input;
  if (trailCount <= 0) {
    return "Dog-first hiking trail directory with dog access, leash rules, shade, water, surface, and trailhead logistics.";
  }
  return `Browse ${trailCount} dog-friendly trails across ${cityCount} cities in ${stateCount} states, with leash rules, shade, water, surface, and access details.`;
}

export function stateTitle(input: {
  stateName: string;
  trailCount: number;
}): string {
  if (input.trailCount > 0) {
    return `Dog-Friendly Trails in ${input.stateName}`;
  }
  return `${input.stateName} Dog Hiking Trails Directory`;
}

export function stateDescription(input: {
  stateName: string;
  cityCount: number;
  trailCount: number;
}): string {
  const { stateName, cityCount, trailCount } = input;
  if (trailCount <= 0) {
    return `Browse cities in ${stateName} as dog-friendly trail coverage is added, with dog policy and route-condition details.`;
  }
  return `Browse dog-friendly trails in ${stateName} by city (${cityCount} cities, ${trailCount} trails) and compare leash policy, shade, water, surface, and access.`;
}

export function cityTitle(input: {
  cityName: string;
  stateCode: string;
  trailCount: number;
}): string {
  if (input.trailCount > 0) {
    return `Dog-Friendly Trails, Hikes & Walking Paths in ${input.cityName}, ${input.stateCode}`;
  }
  return `Dog-Friendly Trails and Hikes in ${input.cityName}, ${input.stateCode}`;
}

export function cityDescription(input: {
  cityName: string;
  stateName: string;
  trailCount: number;
  hasLeashSignals: boolean;
  hasWaterSignals: boolean;
  hasShadeSignals: boolean;
}): string {
  const lead = input.trailCount > 0
    ? `Compare ${input.trailCount} dog-friendly trails, hikes, and walking paths in ${input.cityName}, ${input.stateName}.`
    : `Compare dog-friendly trails, hikes, and walking paths in ${input.cityName}, ${input.stateName}.`;

  const attributes: string[] = [];
  if (input.hasLeashSignals) attributes.push("leash rules");
  if (input.hasShadeSignals) attributes.push("shade");
  if (input.hasWaterSignals) attributes.push("water access");
  attributes.push("distance and terrain");

  return `${lead} Review ${attributes.join(", ")} to choose the best fit for your dog.`;
}

function trailAttributePhrase(input: {
  leashPolicy: string | null;
  shadeClass: string | null;
  waterNearPercent: number | null;
  surface: string | null;
}): string | null {
  const bits: string[] = [];
  const policy = policySnippet(input.leashPolicy);
  if (policy) bits.push(policy);
  if (input.shadeClass) bits.push(`${input.shadeClass.toLowerCase()} shade`);
  if (input.waterNearPercent != null) {
    const pct = Math.round((input.waterNearPercent <= 1 ? input.waterNearPercent * 100 : input.waterNearPercent));
    bits.push(`${pct}% water proximity`);
  }
  if (input.surface) bits.push(`${input.surface.toLowerCase()} surface`);
  if (bits.length === 0) return null;
  return bits.slice(0, 2).join(" · ");
}

export function trailTitle(input: {
  trailName: string;
  cityName: string | null;
  stateCode: string | null;
  leashPolicy: string | null;
}): string {
  const name = normalizeEntityName(input.trailName, "Trail");
  const location = input.cityName && input.stateCode ? ` in ${input.cityName}, ${input.stateCode}` : "";
  const policy = policySnippet(input.leashPolicy);
  if (policy && /off-leash/.test(policy)) {
    return `${name}${location} (Off-Leash & Dog Policy)`;
  }
  if (policy) {
    return `${name}${location} (Dog Access & Leash Rules)`;
  }
  return `${name}${location} Dog-Friendly Trail Guide`;
}

export function trailDescription(input: {
  trailName: string;
  cityName: string | null;
  stateName: string | null;
  distanceMiles: number | null;
  leashPolicy: string | null;
  shadeClass: string | null;
  waterNearPercent: number | null;
  surface: string | null;
  elevationGainFt: number | null;
}): string {
  const name = normalizeEntityName(input.trailName, "Trail");
  const location = [input.cityName, input.stateName].filter((v): v is string => Boolean(v && v.trim())).join(", ");
  const lead = input.distanceMiles != null
    ? `${name} is a ${input.distanceMiles.toFixed(1)}-mile dog-friendly trail${location ? ` in ${location}` : ""}.`
    : `${name} is a dog-friendly trail${location ? ` in ${location}` : ""}.`;

  const attr = trailAttributePhrase({
    leashPolicy: normalizePolicy(input.leashPolicy),
    shadeClass: input.shadeClass,
    waterNearPercent: input.waterNearPercent,
    surface: input.surface,
  });

  const effort = input.elevationGainFt != null
    ? `Elevation gain is about ${Math.round(input.elevationGainFt)} ft.`
    : "";

  if (!attr) return `${lead} Review dog policy, route conditions, and trailhead access before your hike.`;
  return `${lead} Includes ${attr}. ${effort}`.trim();
}
