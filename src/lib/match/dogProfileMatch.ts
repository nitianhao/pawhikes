export type DogProfile = "senior" | "small" | "heat_sensitive" | "high_energy" | "balanced";

export type MatchResult = {
  profile: DogProfile;
  score: number;
  reasons: string[];
  warnings: string[];
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

function cap(items: string[], max: number): string[] {
  return items.filter(Boolean).slice(0, max);
}

export function computeMatch(system: any, profile: DogProfile): MatchResult {
  const s: AnyRecord = system && typeof system === "object" ? system : {};
  const personalization: AnyRecord =
    s.personalization && typeof s.personalization === "object" ? s.personalization : {};
  const amenitiesCounts: AnyRecord =
    s.amenitiesCounts && typeof s.amenitiesCounts === "object" ? s.amenitiesCounts : {};
  const safety: AnyRecord = s.safety && typeof s.safety === "object" ? s.safety : {};

  const seniorSafeScore = asNumber(personalization.seniorSafeScore) ?? 0.5;
  const smallDogScore = asNumber(personalization.smallDogScore) ?? 0.55;
  const highEnergyScore = asNumber(personalization.highEnergyScore) ?? 0.5;
  const heatSensitiveLevel = String(personalization.heatSensitiveLevel ?? "medium").toLowerCase();

  const heatRisk = String(s.heatRisk ?? "").toLowerCase();
  const shadeClass = String(s.shadeClass ?? "").toLowerCase();
  const shadeProxyPercent = asNumber(s.shadeProxyPercent) ?? 0;
  const waterNearPercent = asNumber(s.waterNearPercent) ?? 0;
  const crowdClass = String(s.crowdClass ?? "").toLowerCase();
  const roughnessRisk = String(s.roughnessRisk ?? "").toLowerCase();

  const benchCount = asNumber(amenitiesCounts.bench) ?? 0;
  const drinkingWaterCount = asNumber(amenitiesCounts.drinking_water) ?? 0;
  const vetCountWithin5km = asNumber(safety.vetCountWithin5km) ?? 0;
  const emergencyAccessClass = String(safety.emergencyAccessClass ?? "").toLowerCase();

  let score = 0.5;
  const reasons: string[] = [];

  if (profile === "senior") {
    score = seniorSafeScore;
    if (benchCount >= 5) {
      score += 0.1;
      reasons.push("Plenty of benches for rest breaks.");
    }
    if (drinkingWaterCount >= 1) {
      score += 0.05;
      reasons.push("Drinking water is available nearby.");
    }
    if (crowdClass === "high") {
      score -= 0.1;
      reasons.push("High crowd levels can stress senior dogs.");
    }
    if (heatRisk === "high") {
      score -= 0.15;
      reasons.push("High heat risk is tougher for senior dogs.");
    }
  }

  if (profile === "small") {
    score = smallDogScore;
    if (roughnessRisk === "low") reasons.push("Low roughness is easier on small paws.");
    if (crowdClass === "high") {
      score -= 0.1;
      reasons.push("High crowd levels can be challenging for small dogs.");
    }
    if (heatRisk === "high") {
      score -= 0.1;
      reasons.push("High heat risk can impact small dogs faster.");
    }
    if (drinkingWaterCount >= 1) reasons.push("Water points help with quick cooldowns.");
  }

  if (profile === "heat_sensitive") {
    score = 0.7;
    if (heatSensitiveLevel === "high") {
      score -= 0.35;
      reasons.push("Marked as high heat-sensitive risk.");
    }
    if (heatRisk === "high") {
      score -= 0.15;
      reasons.push("Heat risk is high.");
    }
    if (drinkingWaterCount >= 1) {
      score += 0.1;
      reasons.push("Drinking water is available.");
    }
    if (shadeClass === "high" || shadeProxyPercent >= 0.65) {
      score += 0.1;
      reasons.push("Good shade coverage supports heat-sensitive dogs.");
    }
  }

  if (profile === "high_energy") {
    score = highEnergyScore;
    if (waterNearPercent >= 0.5) {
      score += 0.1;
      reasons.push("Nearby water supports recovery after activity.");
    }
    if (heatRisk === "high") {
      score -= 0.15;
      reasons.push("High heat can limit safe high-energy sessions.");
    }
    if (vetCountWithin5km >= 3) reasons.push("Multiple vets nearby add confidence for hard outings.");
  }

  if (profile === "balanced") {
    score = clamp01((seniorSafeScore + smallDogScore + highEnergyScore) / 3);
    if (shadeClass === "high" || shadeProxyPercent >= 0.65)
      reasons.push("Good shade quality.");
    if (drinkingWaterCount >= 1) reasons.push("Drinking water available.");
    if (emergencyAccessClass === "high") reasons.push("Strong emergency access profile.");
    if (reasons.length === 0) reasons.push("Balanced mix of trail conditions.");
  }

  const warnings: string[] = [];
  if (heatSensitiveLevel === "high") warnings.push("High heat sensitivity flag.");
  if (crowdClass === "high") warnings.push("High crowd levels.");
  if (emergencyAccessClass === "low") warnings.push("Low emergency access score.");

  return {
    profile,
    score: clamp01(score),
    reasons: cap(reasons, 3),
    warnings: cap(warnings, 2),
  };
}
