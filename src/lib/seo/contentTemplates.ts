export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

function fmtPctUnit(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const pct = value <= 1 ? value * 100 : value;
  return `${Math.round(pct)}%`;
}

export function homeHeroSupport(input: {
  totalStates: number;
  totalCities: number;
  totalTrails: number;
}): string {
  const { totalStates, totalCities, totalTrails } = input;
  if (totalTrails <= 0) {
    return "Paw Hikes is a dog-first hiking directory built for people planning where to hike with their dogs.";
  }
  return `Browse ${totalTrails} ${pluralize(totalTrails, "dog-friendly trail")} across ${totalCities} ${pluralize(totalCities, "city", "cities")} in ${totalStates} ${pluralize(totalStates, "state")}.`;
}

export function stateIntro(input: {
  stateName: string;
  cityCount: number;
  totalTrails: number;
  totalMiles: number;
}): string {
  const { stateName, cityCount, totalTrails, totalMiles } = input;
  if (totalTrails <= 0) {
    return `This ${stateName} page lists cities as they are added, with dog-hiking details like leash rules, shade, water access, and surface conditions.`;
  }
  const milesPart = totalMiles > 0 ? `${Math.round(totalMiles)} total miles tracked` : "coverage expanding";
  return `${stateName} currently includes ${totalTrails} ${pluralize(totalTrails, "dog-friendly trail system")} across ${cityCount} ${pluralize(cityCount, "city", "cities")}, with ${milesPart}.`;
}

export function stateBrowseHelp(input: {
  stateName: string;
  featuredCities: string[];
}): string {
  const cityList = input.featuredCities.filter(Boolean).slice(0, 3);
  const cityText = cityList.length > 0 ? `, including ${cityList.join(", ")},` : "";
  return `Use this page to compare cities in ${input.stateName}${cityText} then open each city page for trail-level dog policy, terrain, shade, and water details.`;
}

export function cityIntro(input: {
  city: string;
  state: string;
  trailCount: number;
  totalMiles: number;
  avgShadePct: number | null;
  hasWaterSignals: boolean;
  hasLeashSignals: boolean;
}): string {
  const { city, state, trailCount, totalMiles, avgShadePct, hasWaterSignals, hasLeashSignals } = input;
  const parts: string[] = [];
  parts.push(`${city}, ${state} has ${trailCount} ${pluralize(trailCount, "dog-friendly trail system")} in this directory` + (totalMiles > 0 ? ` (${Math.round(totalMiles)} total miles).` : "."));
  const signalParts: string[] = [];
  const shade = fmtPctUnit(avgShadePct);
  if (shade) signalParts.push(`${shade} average shade coverage`);
  if (hasWaterSignals) signalParts.push("water-access signals");
  if (hasLeashSignals) signalParts.push("leash-policy details");
  if (signalParts.length > 0) {
    parts.push(`You can compare trails by ${signalParts.join(", ")} before choosing where to hike with your dog.`);
  } else {
    parts.push("Open each trail to review dog access, route conditions, and trailhead logistics.");
  }
  return parts.join(" ");
}

export function cityBrowseHelp(input: {
  city: string;
  state: string;
}): string {
  return `Looking for hikes with dogs near ${input.city}? Start with this list, then open each trail page for dog rules, terrain, shade, water, and parking context.`;
}

export function trailSummary(input: {
  trailName: string;
  city: string | null;
  state: string | null;
  distanceMiles: number | null;
  dogsAllowed: string | null;
  leashPolicy: string | null;
  shadeClass: string | null;
  waterNearPercent: number | null;
  surface: string | null;
  elevationGainFt: number | null;
}): string {
  const location = [input.city, input.state].filter(Boolean).join(", ") || "this area";
  const lead = input.distanceMiles != null
    ? `${input.trailName} is a ${input.distanceMiles.toFixed(1)}-mile dog hiking trail in ${location}.`
    : `${input.trailName} is a dog hiking trail in ${location}.`;

  const details: string[] = [];
  if (input.dogsAllowed) details.push(`Dogs allowed: ${input.dogsAllowed}`);
  if (input.leashPolicy) details.push(`leash policy: ${input.leashPolicy}`);
  if (input.surface) details.push(`surface: ${input.surface}`);
  if (input.elevationGainFt != null) details.push(`elevation gain: ${Math.round(input.elevationGainFt)} ft`);
  const waterPct = fmtPctUnit(input.waterNearPercent);
  if (waterPct) details.push(`water proximity: ${waterPct}`);
  if (input.shadeClass) details.push(`shade: ${input.shadeClass}`);

  if (details.length === 0) {
    return `${lead} Use this page to review dog access, terrain, heat exposure, and trailhead access before you go.`;
  }

  return `${lead} Key trail facts include ${details.join(", ")}.`;
}

export function terrainFallbackCopy(input: {
  distanceMiles: number | null;
  elevationGainFt: number | null;
  surface: string | null;
  shadeClass: string | null;
  waterNearPercent: number | null;
}): {
  terrain: string;
  surface: string;
  shade: string;
  water: string;
} {
  const terrain =
    input.distanceMiles != null && input.elevationGainFt != null
      ? `Distance and climbing are shown together so you can judge overall effort for your dog on a ${input.distanceMiles.toFixed(1)}-mile route with ${Math.round(input.elevationGainFt)} ft of gain.`
      : "Distance, elevation, and trail width are combined here to estimate how demanding the walk feels for different dogs.";

  const surface = input.surface
    ? `Surface signals indicate where paws spend most time, with ${input.surface.toLowerCase()} as the dominant ground type.`
    : "Surface coverage helps you plan for paw comfort and choose routes that match your dog's tolerance for rough or hot terrain.";

  const shade = input.shadeClass
    ? `Shade coverage and heat exposure are summarized to show when this trail is safer for warm-weather dog hikes.`
    : "Shade and heat signals help you decide timing, especially for hot days and heat-sensitive dogs.";

  const waterPct = fmtPctUnit(input.waterNearPercent);
  const water = waterPct
    ? `Water proximity is tracked along the route (${waterPct}) to help you plan hydration and cooldown stops.`
    : "Water access and nearby water types are shown to help you evaluate hydration and splash opportunities.";

  return { terrain, surface, shade, water };
}

export function accessFallbackCopy(input: {
  trailHeadCount: number;
  parkingCount: number | null;
  parkingFeeKnown: boolean | null;
}): string {
  const trailheads = input.trailHeadCount > 0
    ? `${input.trailHeadCount} ${pluralize(input.trailHeadCount, "trailhead")} listed`
    : "trailhead details where available";
  const parking = input.parkingCount != null
    ? `${input.parkingCount} parking ${pluralize(input.parkingCount, "lot")}`
    : "parking availability";
  const fee = input.parkingFeeKnown === true ? "fees may apply" : input.parkingFeeKnown === false ? "parking is usually free" : "parking fees vary by location";
  return `This section covers ${trailheads}, ${parking}, and amenity placement so you can plan start points and access logistics before arriving. ${fee}.`;
}

export function rulesSafetyFallbackCopy(input: {
  hazardsClass: string | null;
  vetCount: number;
}): string {
  const hazard = input.hazardsClass
    ? `Current hazard level is marked as ${input.hazardsClass.toLowerCase()}.`
    : "Hazard levels are summarized from available route data.";
  const vets = input.vetCount > 0
    ? `${input.vetCount} nearby emergency veterinary ${pluralize(input.vetCount, "option")} mapped where available.`
    : "Nearby emergency veterinary coverage appears when mapped in source data.";
  return `${hazard} ${vets}`;
}
