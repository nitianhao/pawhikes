export type PersonalizationOutput = {
  seniorSafeScore: number;
  seniorSafeReasons: string[];
  smallDogScore: number;
  smallDogReasons: string[];
  heatSensitiveLevel: "low" | "medium" | "high";
  heatSensitiveReasons: string[];
  highEnergyScore: number;
  highEnergyReasons: string[];
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

function asRiskClass(value: unknown): "low" | "medium" | "high" | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return null;
}

function capReasons(reasons: string[]): string[] {
  return reasons.filter(Boolean).slice(0, 3);
}

export function computePersonalization(system: any): PersonalizationOutput {
  const s: AnyRecord = system && typeof system === "object" ? system : {};

  const lengthMilesTotal = asNumber(s.lengthMilesTotal);
  const heatRisk = asRiskClass(s.heatRisk);
  const asphaltPercent = asNumber(s.asphaltPercent);
  const shadeClass = asRiskClass(s.shadeClass);
  const shadeProxyPercent = asNumber(s.shadeProxyPercent);
  const crowdClass = asRiskClass(s.crowdClass);
  const amenitiesIndexScore = asNumber(s.amenitiesIndexScore);
  const amenitiesCounts: AnyRecord = s.amenitiesCounts && typeof s.amenitiesCounts === "object" ? s.amenitiesCounts : {};
  const widthSummary: AnyRecord = s.widthSummary && typeof s.widthSummary === "object" ? s.widthSummary : {};
  const roughnessRisk = asRiskClass(s.roughnessRisk);
  const waterNearPercent = asNumber(s.waterNearPercent);

  const benchCount = asNumber(amenitiesCounts.bench) ?? 0;
  const shelterCount = asNumber(amenitiesCounts.shelter) ?? 0;
  const drinkingWaterCount = asNumber(amenitiesCounts.drinking_water) ?? 0;
  const widthMin = asNumber(widthSummary.min);

  let seniorSafeScore = 0.5;
  const seniorSafeReasons: string[] = [];

  if (heatRisk === "high") {
    seniorSafeScore -= 0.2;
    seniorSafeReasons.push("High heat risk can be hard on older dogs.");
  }
  if (lengthMilesTotal !== null && lengthMilesTotal >= 7) {
    seniorSafeScore -= 0.1;
    seniorSafeReasons.push("Long total distance may be tiring for seniors.");
  } else if (lengthMilesTotal !== null && lengthMilesTotal >= 4 && lengthMilesTotal < 7) {
    seniorSafeScore -= 0.05;
    seniorSafeReasons.push("Moderate trail length may require pacing for seniors.");
  }
  if (crowdClass === "high") {
    seniorSafeScore -= 0.1;
    seniorSafeReasons.push("High crowd levels can add stress for slower-moving dogs.");
  }
  if ((amenitiesIndexScore ?? -1) >= 0.6) {
    seniorSafeScore += 0.15;
    seniorSafeReasons.push("Strong amenities support frequent rest and comfort.");
  }
  if (benchCount >= 5) {
    seniorSafeScore += 0.1;
    seniorSafeReasons.push("Multiple benches provide regular rest stops.");
  }
  if (shelterCount >= 1) {
    seniorSafeScore += 0.05;
    seniorSafeReasons.push("Shelter availability helps with weather breaks.");
  }
  if (shadeClass === "high" || (shadeProxyPercent !== null && shadeProxyPercent >= 0.65)) {
    seniorSafeScore += 0.05;
    seniorSafeReasons.push("Good shade coverage reduces heat strain.");
  }

  let smallDogScore = 0.55;
  const smallDogReasons: string[] = [];

  if (roughnessRisk === "low") {
    smallDogScore += 0.15;
    smallDogReasons.push("Low roughness is easier on small paws and joints.");
  }
  if (widthMin !== null && widthMin >= 4) {
    smallDogScore += 0.05;
    smallDogReasons.push("Wider minimum path gives safer passing space.");
  }
  if (shadeClass !== "low" && shadeClass !== null) {
    smallDogScore += 0.05;
    smallDogReasons.push("At least moderate shade helps small dogs regulate heat.");
  }
  if (crowdClass === "high") {
    smallDogScore -= 0.1;
    smallDogReasons.push("Crowded paths can be harder for small dogs to navigate.");
  }
  if (heatRisk === "high") {
    smallDogScore -= 0.1;
    smallDogReasons.push("High heat risk can affect small dogs faster.");
  }

  let heatSensitiveLevel: "low" | "medium" | "high" = "medium";
  const lowShade = shadeClass === "low";
  const highShade = shadeClass === "high" || (shadeProxyPercent !== null && shadeProxyPercent >= 0.7);
  const asphaltHot = asphaltPercent !== null && asphaltPercent >= 10;

  if (heatRisk === "high" || (asphaltHot && lowShade)) {
    heatSensitiveLevel = "high";
  } else if (heatRisk === "low" && highShade) {
    heatSensitiveLevel = "low";
  }

  const heatSensitiveReasons: string[] = [];
  if (heatRisk) {
    heatSensitiveReasons.push(`Heat risk is ${heatRisk}.`);
  }
  if (asphaltPercent !== null || shadeClass || shadeProxyPercent !== null) {
    const asphaltText =
      asphaltPercent !== null ? `${asphaltPercent.toFixed(1)}% asphalt` : "asphalt unknown";
    const shadeText = shadeClass
      ? `shade class ${shadeClass}`
      : shadeProxyPercent !== null
        ? `shade proxy ${(shadeProxyPercent * 100).toFixed(0)}%`
        : "shade unknown";
    heatSensitiveReasons.push(`${asphaltText}; ${shadeText}.`);
  }
  heatSensitiveReasons.push(
    `Drinking water points: ${Math.max(0, Math.round(drinkingWaterCount))}.`
  );

  let highEnergyScore = 0.5;
  const highEnergyReasons: string[] = [];

  if (lengthMilesTotal !== null && lengthMilesTotal >= 9) {
    highEnergyScore += 0.1;
    highEnergyReasons.push("Very long trail system supports longer high-energy sessions.");
  }
  if (lengthMilesTotal !== null && lengthMilesTotal >= 6) {
    highEnergyScore += 0.15;
    highEnergyReasons.push("Long total mileage supports sustained activity.");
  }
  if (waterNearPercent !== null && waterNearPercent >= 0.5) {
    highEnergyScore += 0.05;
    highEnergyReasons.push("Nearby water can help with recovery breaks.");
  }
  if (heatRisk === "high") {
    highEnergyScore -= 0.1;
    highEnergyReasons.push("High heat risk can limit safe exertion time.");
  }
  if (crowdClass === "high") {
    highEnergyScore -= 0.05;
    highEnergyReasons.push("High crowds reduce freedom for active running.");
  }

  return {
    seniorSafeScore: clamp01(seniorSafeScore),
    seniorSafeReasons: capReasons(seniorSafeReasons),
    smallDogScore: clamp01(smallDogScore),
    smallDogReasons: capReasons(smallDogReasons),
    heatSensitiveLevel,
    heatSensitiveReasons: capReasons(heatSensitiveReasons),
    highEnergyScore: clamp01(highEnergyScore),
    highEnergyReasons: capReasons(highEnergyReasons),
  };
}
