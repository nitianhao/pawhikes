/**
 * Dog Suitability Engine
 *
 * Deterministic interpretation of trail data into dog-owner guidance.
 * No LLM calls. No runtime inference. No invented facts.
 * Every output is grounded in at least one structured data field.
 *
 * ── AUTHORING RULES ──────────────────────────────────────────────────────────
 * 1. Each rule requires ≥1 supporting data field; omit if fields are null.
 * 2. Use "caution" severity unless ≥2 strong negative signals are present.
 * 3. confidence="strong" requires ≥2 corroborating data fields.
 * 4. confidence="moderate" requires ≥1 field; omit if absent.
 * 5. Never state something the data doesn't directly support.
 * 6. To extend: add a new rule block in getBestFor() or getAvoidIf().
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TrailSystemForPage } from "@/lib/data/trailSystem";

// ── Output types ──────────────────────────────────────────────────────────────

export type DogCategory =
  | "senior_dogs"
  | "small_dogs"
  | "heat_sensitive"
  | "reactive_dogs"
  | "water_lovers"
  | "high_energy"
  | "beginner_hikers"
  | "easy_walks";

export type Confidence = "strong" | "moderate";

export type SuitabilityItem = {
  category: DogCategory;
  label: string;
  reason: string;
  confidence: Confidence;
};

export type Warning = {
  label: string;
  reason: string;
  severity: "caution" | "risk";
};

export type TimeWindow = {
  label: string;
  reason: string;
};

export type VerdictLevel = "excellent" | "good" | "moderate" | "limited" | "unknown";

export type SuitabilityVerdict = {
  level: VerdictLevel;
  headline: string;
};

export type SuitabilityOutput = {
  verdict: SuitabilityVerdict;
  bestFor: SuitabilityItem[];
  avoidIf: Warning[];
  bestTimeWindows: TimeWindow[];
  comfortHighlights: string[];
  hasEnoughData: boolean;
};

// ── Internal normalized input ─────────────────────────────────────────────────

type NormalizedInput = {
  // Dogs & policy
  dogsAllowed: boolean | null;
  leashPolicy: string;           // lowercased
  isOnLeash: boolean;
  isOffLeash: boolean;
  policyConfidence: string;

  // Effort & terrain
  dist: number | null;           // miles
  gradeP50: number | null;       // median grade %
  gradeP90: number | null;       // 90th-pct grade %
  gainFt: number | null;         // elevation gain

  // Surface & roughness
  roughnessRisk: string;         // "low" | "medium" | "high" | ""
  naturalSurfacePct: number | null; // 0–100
  pavedPct: number | null;       // 0–100

  // Shade & heat
  shadeClass: string;            // "high" | "medium" | "low" | ""
  shadePct: number | null;       // 0–100 normalised
  heatRisk: string;              // "high" | "medium" | "low" | ""

  // Water
  waterNearPct: number | null;   // 0–100
  swimLikely: boolean | null;
  swimCount: number | null;
  waterTypes: string[];

  // Crowds & hazards
  crowdClass: string;            // "high" | "medium" | "low" | ""
  hazardsClass: string;          // "high" | "medium" | "low" | ""
  reactiveFriendly: boolean | null;

  // Flexibility
  bailoutScore: number | null;
  amenitiesScore: number | null;

  // Conditions
  mudRisk: string;               // "high" | "medium" | "low" | ""
  winterClass: string;
  nightClass: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function asNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Normalise a percent field that may arrive as 0–1 or 0–100. */
function normPct(v: unknown): number | null {
  const n = asNum(v);
  if (n === null) return null;
  if (n <= 1) return n * 100;
  if (n <= 100) return n;
  return 100;
}

function capitalFirst(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeInput(s: TrailSystemForPage | null): NormalizedInput {
  if (!s) {
    return {
      dogsAllowed: null, leashPolicy: "", isOnLeash: false, isOffLeash: false,
      policyConfidence: "", dist: null, gradeP50: null, gradeP90: null, gainFt: null,
      roughnessRisk: "", naturalSurfacePct: null, pavedPct: null,
      shadeClass: "", shadePct: null, heatRisk: "",
      waterNearPct: null, swimLikely: null, swimCount: null, waterTypes: [],
      crowdClass: "", hazardsClass: "", reactiveFriendly: null,
      bailoutScore: null, amenitiesScore: null,
      mudRisk: "", winterClass: "", nightClass: "",
    };
  }

  const leashPolicy = asStr((s as any).leashPolicy);
  const isOnLeash = /on[- ]?leash|leash[- ]?required|must be leash/i.test(leashPolicy);
  const isOffLeash = /off[- ]?leash|leash[- ]?optional|leash[- ]?free/i.test(leashPolicy);

  return {
    dogsAllowed:       typeof (s as any).dogsAllowed === "boolean" ? (s as any).dogsAllowed : null,
    leashPolicy,
    isOnLeash,
    isOffLeash,
    policyConfidence:  asStr((s as any).policyConfidence),

    dist:              asNum(s.lengthMilesTotal),
    gradeP50:          asNum((s as any).gradeP50),
    gradeP90:          asNum((s as any).gradeP90),
    gainFt:            asNum((s as any).elevationGainFt),

    roughnessRisk:     asStr((s as any).roughnessRisk),
    naturalSurfacePct: normPct((s as any).naturalSurfacePercent),
    pavedPct:          normPct((s as any).pavedPercentProxy ?? (s as any).asphaltPercent),

    shadeClass:        asStr((s as any).shadeClass),
    shadePct:          normPct((s as any).shadeProxyPercent),
    heatRisk:          asStr((s as any).heatRisk),

    waterNearPct:      normPct((s as any).waterNearPercent ?? (s as any).waterNearScore),
    swimLikely:        typeof (s as any).swimLikely === "boolean" ? (s as any).swimLikely : null,
    swimCount:         asNum((s as any).swimAccessPointsCount),
    waterTypes:        Array.isArray((s as any).waterTypesNearby)
                         ? (s as any).waterTypesNearby.map(String)
                         : [],

    crowdClass:        asStr((s as any).crowdClass),
    hazardsClass:      asStr((s as any).hazardsClass),
    reactiveFriendly:  typeof (s as any).reactiveDogFriendly === "boolean"
                         ? (s as any).reactiveDogFriendly : null,

    bailoutScore:      asNum((s as any).bailoutScore),
    amenitiesScore:    asNum((s as any).amenitiesIndexScore),

    mudRisk:           asStr((s as any).mudRisk),
    winterClass:       asStr((s as any).winterClass),
    nightClass:        asStr((s as any).nightClass),
  };
}

// ── Rule: getBestFor ──────────────────────────────────────────────────────────

export function getBestFor(system: TrailSystemForPage | null): SuitabilityItem[] {
  const i = normalizeInput(system);
  const items: SuitabilityItem[] = [];

  // ── Senior dogs
  // Rule: Flat or gentle grade + non-rough surface = joint-friendly
  // Requires: gradeP50 OR roughnessRisk
  if (i.gradeP50 !== null || i.roughnessRisk) {
    const flatGrade = i.gradeP50 !== null && i.gradeP50 < 5;
    const okGrade   = i.gradeP90 !== null && i.gradeP90 < 10;
    const smoothSurface = i.roughnessRisk && i.roughnessRisk !== "high";
    const shortDist = i.dist !== null && i.dist < 5;

    if ((flatGrade || okGrade) && smoothSurface) {
      items.push({
        category: "senior_dogs",
        label: "Senior dogs",
        reason: i.gradeP50 !== null && i.gradeP50 < 3
          ? "Flat grade and smooth surface — easy on aging joints"
          : "Gentle terrain and manageable surface for older dogs",
        confidence: flatGrade && smoothSurface ? "strong" : "moderate",
      });
    } else if (flatGrade && shortDist && !i.roughnessRisk) {
      // Grade known flat but surface unknown — moderate confidence
      items.push({
        category: "senior_dogs",
        label: "Senior dogs",
        reason: "Flat, manageable route — suitable for older dogs",
        confidence: "moderate",
      });
    }
  }

  // ── Small dogs
  // Rule: Gentle peak grade + short distance + non-rough surface
  // Requires: gradeP90 AND dist
  if (i.gradeP90 !== null && i.dist !== null) {
    const gentleGrade = i.gradeP90 < 10;
    const shortDist   = i.dist < 4;
    const okSurface   = i.roughnessRisk !== "high";

    if (gentleGrade && shortDist && okSurface) {
      items.push({
        category: "small_dogs",
        label: "Small dogs",
        reason: "Short distance and gentle grade — manageable for smaller breeds",
        confidence: i.roughnessRisk === "low" ? "strong" : "moderate",
      });
    }
  }

  // ── Easy walks (beginner-friendly)
  // Rule: Flat grade + short distance
  // Requires: gradeP50 AND dist
  if (i.gradeP50 !== null && i.dist !== null && i.gradeP50 < 4 && i.dist < 4) {
    items.push({
      category: "easy_walks",
      label: "Easy walks",
      reason: i.dist < 2
        ? "Short, flat route — ideal for a relaxed outing"
        : "Flat grade and manageable distance — low effort required",
      confidence: "strong",
    });
  }

  // ── Heat-sensitive dogs
  // Rule: Well-shaded OR confirmed low heat risk
  // Requires: shadeClass OR shadePct OR heatRisk
  if (i.shadeClass || i.shadePct !== null || i.heatRisk) {
    const wellShaded  = i.shadeClass === "high" || (i.shadePct !== null && i.shadePct >= 60);
    const notHot      = i.heatRisk !== "high";
    const someShade   = i.shadeClass === "medium" || (i.shadePct !== null && i.shadePct >= 35);

    if (wellShaded && notHot) {
      items.push({
        category: "heat_sensitive",
        label: "Heat-sensitive dogs",
        reason: i.shadePct !== null
          ? `~${Math.round(i.shadePct)}% shade coverage limits heat exposure`
          : "Well-shaded trail — stays cooler throughout",
        confidence: wellShaded && i.heatRisk === "low" ? "strong" : "moderate",
      });
    } else if (someShade && i.heatRisk === "low") {
      items.push({
        category: "heat_sensitive",
        label: "Heat-sensitive dogs",
        reason: "Moderate shade and low heat risk — manageable conditions",
        confidence: "moderate",
      });
    }
  }

  // ── Reactive dogs
  // Rule: Low crowd class + on-leash policy (other dogs controlled)
  // Requires: crowdClass
  if (i.crowdClass) {
    const quietTrail   = i.crowdClass === "low";
    const dogControlled = i.isOnLeash || (!i.isOffLeash && i.leashPolicy);
    const explicit      = i.reactiveFriendly === true;

    if (explicit || (quietTrail && dogControlled)) {
      items.push({
        category: "reactive_dogs",
        label: "Reactive dogs",
        reason: explicit
          ? "Trail conditions noted as suitable for reactive dogs"
          : "Low crowd levels and leash enforcement — fewer surprise encounters",
        confidence: explicit || (quietTrail && i.isOnLeash) ? "strong" : "moderate",
      });
    } else if (quietTrail && !i.isOffLeash) {
      items.push({
        category: "reactive_dogs",
        label: "Reactive dogs",
        reason: "Low foot traffic — calmer environment for reactive dogs",
        confidence: "moderate",
      });
    }
  }

  // ── Water-loving dogs
  // Rule: Confirmed swim access OR strong water proximity
  // Requires: swimLikely OR swimCount OR waterNearPct
  if (i.swimLikely === true || (i.swimCount !== null && i.swimCount > 0)) {
    items.push({
      category: "water_lovers",
      label: "Water-loving dogs",
      reason: i.swimCount !== null && i.swimCount > 0
        ? `Swim access at ${i.swimCount} spot${i.swimCount > 1 ? "s" : ""} along the route`
        : "Confirmed swim access — dogs can cool off on the trail",
      confidence: "strong",
    });
  } else if (i.waterNearPct !== null && i.waterNearPct >= 40) {
    const hasRiverOrLake = i.waterTypes.some(t => ["river", "lake", "lake_or_pond"].includes(t));
    items.push({
      category: "water_lovers",
      label: "Water-loving dogs",
      reason: hasRiverOrLake
        ? "River or lake nearby along the route — splash opportunities"
        : `Water accessible near ~${Math.round(i.waterNearPct)}% of the trail`,
      confidence: "moderate",
    });
  }

  // ── High-energy dogs
  // Rule: Long distance AND meaningful elevation OR technical grade
  // Requires: dist AND (gainFt OR gradeP90)
  if (i.dist !== null && i.dist >= 5) {
    const hasGain  = i.gainFt !== null && i.gainFt > 250;
    const hasGrade = i.gradeP90 !== null && i.gradeP90 > 8;

    if (hasGain || hasGrade) {
      items.push({
        category: "high_energy",
        label: "High-energy dogs",
        reason: hasGain
          ? `${i.dist.toFixed(1)} mi with ${Math.round(i.gainFt!)} ft of climbing — solid workout`
          : `${i.dist.toFixed(1)} mi with hilly terrain — great for energetic dogs`,
        confidence: hasGain && hasGrade ? "strong" : "moderate",
      });
    } else if (i.dist >= 7) {
      // Long flat route still tires energetic dogs
      items.push({
        category: "high_energy",
        label: "High-energy dogs",
        reason: `${i.dist.toFixed(1)} mi route — plenty of distance for energetic breeds`,
        confidence: "moderate",
      });
    }
  }

  // ── First-time trail dogs (beginner hikers)
  // Rule: Short-to-moderate flat route with bailout options
  // Requires: gradeP50 AND dist AND bailoutScore
  if (
    i.gradeP50 !== null &&
    i.dist !== null &&
    i.gradeP50 < 5 &&
    i.dist >= 1 &&
    i.dist < 4.5 &&
    i.bailoutScore !== null &&
    i.bailoutScore > 0
  ) {
    items.push({
      category: "beginner_hikers",
      label: "First-time trail dogs",
      reason: "Manageable length, gentle grade, and exit options — forgiving if cut short",
      confidence: "strong",
    });
  }

  return items;
}

// ── Rule: getAvoidIf ──────────────────────────────────────────────────────────

export function getAvoidIf(system: TrailSystemForPage | null): Warning[] {
  const i = normalizeInput(system);
  const warnings: Warning[] = [];

  // ── Heat-sensitive dogs — high heat + low shade = risk
  // Rule: heatRisk=high AND shade not protective
  if (i.heatRisk === "high") {
    const noShade = i.shadeClass === "low" || (i.shadePct !== null && i.shadePct < 25);
    warnings.push({
      label: "Heat-sensitive dogs",
      reason: noShade
        ? "High heat exposure with minimal shade — dangerous during warm months"
        : "High heat index — go early or on cooler days",
      severity: noShade ? "risk" : "caution",
    });
  } else if (i.shadeClass === "low" && i.heatRisk !== "low" && i.heatRisk !== "") {
    // Low shade without confirmed low heat risk
    warnings.push({
      label: "Heat-sensitive dogs",
      reason: "Mostly exposed trail — midday temperatures can be intense",
      severity: "caution",
    });
  }

  // ── Reactive dogs — high crowds
  // Rule: crowdClass=high (especially if off-leash allowed)
  if (i.crowdClass === "high") {
    const offLeashRisk = i.isOffLeash;
    warnings.push({
      label: "Reactive dogs",
      reason: offLeashRisk
        ? "Busy trail with off-leash dogs allowed — high encounter risk"
        : "Heavy foot traffic — frequent dog and person encounters",
      severity: offLeashRisk ? "risk" : "caution",
    });
  } else if (i.isOffLeash && i.crowdClass !== "low") {
    // Off-leash allowed on a non-quiet trail
    warnings.push({
      label: "Reactive dogs",
      reason: "Off-leash dogs are permitted — unpredictable encounters possible",
      severity: "caution",
    });
  } else if (i.reactiveFriendly === false) {
    warnings.push({
      label: "Reactive dogs",
      reason: "Trail conditions may be challenging for reactive dogs",
      severity: "caution",
    });
  }

  // ── Senior dogs — steep sections
  // Rule: gradeP90 > 15 OR (gradeP50 > 8 AND dist > 3)
  if (i.gradeP90 !== null && i.gradeP90 > 15) {
    warnings.push({
      label: "Senior dogs",
      reason: "Steep sections present — hard on aging joints and cardiovascular system",
      severity: "caution",
    });
  } else if (i.gradeP50 !== null && i.gradeP50 > 8 && i.dist !== null && i.dist > 3) {
    warnings.push({
      label: "Senior dogs",
      reason: "Consistently hilly terrain over a long distance — tiring for older dogs",
      severity: "caution",
    });
  }

  // ── Small dogs — rough or technical terrain
  // Rule: roughnessRisk=high (steep bonus adds context)
  if (i.roughnessRisk === "high") {
    const steepToo = i.gradeP90 !== null && i.gradeP90 > 12;
    warnings.push({
      label: "Small dogs",
      reason: steepToo
        ? "Rough surface and steep sections — difficult for small breeds"
        : "Rough trail surface — challenging for small paws",
      severity: "caution",
    });
  }

  // ── Any dogs — significant hazard presence
  // Rule: hazardsClass=high
  if (i.hazardsClass === "high") {
    warnings.push({
      label: "Dogs off trail",
      reason: "Elevated hazard rating — road crossings, terrain, or other risk factors present",
      severity: "caution",
    });
  }

  return warnings;
}

// ── Rule: getBestTimeWindows ──────────────────────────────────────────────────

export function getBestTimeWindows(system: TrailSystemForPage | null): TimeWindow[] {
  const i = normalizeInput(system);
  const windows: TimeWindow[] = [];

  // ── Heat & shade → early morning or evening
  // Rule: heatRisk=high OR (shadeClass=low AND some heat signal)
  const significantHeat = i.heatRisk === "high" ||
    (i.shadeClass === "low" && i.heatRisk !== "low");
  const modHeat = i.heatRisk === "medium" ||
    (i.shadePct !== null && i.shadePct < 30 && i.shadeClass === "low");

  if (significantHeat) {
    windows.push({
      label: "Before 10 AM or after 6 PM",
      reason: "Heat exposure is significant — trail is considerably cooler in morning and evening",
    });
  } else if (modHeat && !significantHeat) {
    windows.push({
      label: "Morning or late afternoon",
      reason: "Limited shade — more comfortable outside peak midday hours",
    });
  }

  // ── Crowds → weekday mornings
  // Rule: crowdClass=high
  if (i.crowdClass === "high") {
    windows.push({
      label: "Weekday mornings",
      reason: "Busy trail — foot traffic drops significantly on weekday mornings",
    });
  } else if (i.crowdClass === "medium") {
    windows.push({
      label: "Weekday visits",
      reason: "Moderate traffic — calmer on weekdays",
    });
  }

  // ── Night / evening access
  // Rule: nightClass contains "good" or "safe"
  if (i.nightClass && (i.nightClass.includes("good") || i.nightClass.includes("safe") || i.nightClass === "lit")) {
    windows.push({
      label: "Evening walks possible",
      reason: "Trail has lighting — evening access is a viable option",
    });
  }

  // ── Mud / wet weather
  // Rule: mudRisk=high or medium
  if (i.mudRisk === "high" || i.mudRisk === "medium") {
    windows.push({
      label: "Avoid after heavy rain",
      reason: i.mudRisk === "high"
        ? "Trail gets significantly muddy — surfaces become slippery and paws stay wet"
        : "Surfaces can get muddy after wet weather",
    });
  }

  return windows;
}

// ── Rule: getComfortSummary ───────────────────────────────────────────────────

export function getComfortSummary(system: TrailSystemForPage | null): string[] {
  const i = normalizeInput(system);
  const highlights: string[] = [];

  // Shade coverage — most informative when high
  if (i.shadePct !== null && i.shadePct >= 50) {
    highlights.push(`~${Math.round(i.shadePct)}% shade coverage along the route`);
  }

  // Water / swim access
  if (i.swimLikely === true || (i.swimCount !== null && i.swimCount > 0)) {
    highlights.push("Swim access confirmed — water features along the route");
  } else if (i.waterNearPct !== null && i.waterNearPct >= 50) {
    const hasRiverOrLake = i.waterTypes.some(t => ["river", "lake", "lake_or_pond"].includes(t));
    highlights.push(
      hasRiverOrLake
        ? "River or lake alongside much of the route"
        : `Water accessible near ~${Math.round(i.waterNearPct)}% of the trail`
    );
  }

  // Surface quality
  if (i.roughnessRisk === "low") {
    const pavedNote = i.pavedPct !== null && i.pavedPct >= 60 ? "Paved" : "Smooth";
    const naturalNote = i.naturalSurfacePct !== null && i.naturalSurfacePct >= 60 ? "Natural, soft surface" : null;
    highlights.push(naturalNote ?? `${pavedNote} surface — easy on paws`);
  } else if (i.roughnessRisk === "high") {
    highlights.push("Rocky or root-covered surface — watch footing");
  }

  // Grade / elevation
  if (i.gradeP50 !== null && i.gradeP50 < 3) {
    highlights.push("Essentially flat — average slope under 3%");
  } else if (i.gainFt !== null && i.gainFt > 500 && i.dist !== null) {
    highlights.push(`${Math.round(i.gainFt)} ft of elevation gain — good cardio workout`);
  }

  // Crowd / atmosphere
  if (i.crowdClass === "low") {
    highlights.push("Low foot traffic — calmer atmosphere for dogs");
  }

  // Distance as context (last resort)
  if (highlights.length < 2 && i.dist !== null) {
    highlights.push(`${i.dist.toFixed(1)} mi total — plan accordingly`);
  }

  return highlights.slice(0, 3);
}

// ── Rule: getSuitabilityVerdict ───────────────────────────────────────────────

export function getSuitabilityVerdict(system: TrailSystemForPage | null): SuitabilityVerdict {
  const i = normalizeInput(system);

  // Count data fields present to assess confidence
  const knownFields = [
    i.shadeClass, i.heatRisk, i.crowdClass, i.hazardsClass, i.roughnessRisk,
    i.gradeP50 !== null, i.gradeP90 !== null, i.dist !== null,
  ].filter(Boolean).length;

  if (knownFields < 2) {
    return { level: "unknown", headline: "Limited data — basic assessment only" };
  }

  // Score: start neutral, adjust for positives and negatives
  let score = 60;

  // ── Strong positive signals
  if (i.shadeClass === "high") score += 10;
  if (i.shadePct !== null && i.shadePct >= 60) score += 5;
  if (i.swimLikely || (i.swimCount !== null && i.swimCount > 0)) score += 8;
  if (i.crowdClass === "low") score += 8;
  if (i.hazardsClass === "low") score += 5;
  if (i.gradeP50 !== null && i.gradeP50 < 4) score += 8;
  if (i.roughnessRisk === "low") score += 6;
  if (i.isOnLeash) score += 4; // controlled environment

  // ── Negative signals (penalise proportionally to severity)
  if (i.heatRisk === "high" && i.shadeClass !== "high") score -= 20;
  else if (i.heatRisk === "high") score -= 8;
  if (i.shadeClass === "low" && i.heatRisk !== "low") score -= 12;
  if (i.crowdClass === "high") score -= 12;
  if (i.hazardsClass === "high") score -= 18;
  if (i.roughnessRisk === "high") score -= 10;
  if (i.gradeP50 !== null && i.gradeP50 > 10) score -= 14;
  if (i.isOffLeash && i.crowdClass === "high") score -= 10;
  if (i.mudRisk === "high") score -= 5;

  // Clamp
  score = Math.max(10, Math.min(100, score));

  // Map to verdict level
  const level: VerdictLevel =
    score >= 82 ? "excellent" :
    score >= 66 ? "good" :
    score >= 48 ? "moderate" :
    "limited";

  const headline = computeHeadline(i, level);
  return { level, headline };
}

function computeHeadline(i: NormalizedInput, level: VerdictLevel): string {
  // Identify the 1–2 most characterful features of this trail
  const chars: string[] = [];

  // Environmental character — lead with the most distinctive quality
  if (i.shadeClass === "high" || (i.shadePct !== null && i.shadePct >= 60)) {
    chars.push("well-shaded");
  } else if (i.shadeClass === "low" || (i.shadePct !== null && i.shadePct < 20)) {
    chars.push("exposed");
  }

  if (i.swimLikely || (i.swimCount !== null && i.swimCount > 0)) {
    chars.push("with swim access");
  } else if (i.waterNearPct !== null && i.waterNearPct >= 50) {
    chars.push("waterside");
  }

  if (chars.length < 2) {
    if (i.gradeP50 !== null && i.gradeP50 < 3) chars.push("flat");
    else if (i.gradeP50 !== null && i.gradeP50 > 8) chars.push("hilly");
  }

  if (chars.length < 2 && i.crowdClass === "low") chars.push("quiet");
  if (chars.length < 2 && i.crowdClass === "high") chars.push("busy");

  const qualifier = chars.length > 0 ? capitalFirst(chars.join(", ")) + " trail" : "Trail";

  if (level === "excellent") return `${qualifier} — comfortable for most dogs`;
  if (level === "good") return `${qualifier} — good fit with minor considerations`;
  if (level === "moderate") {
    // Mention the primary caveat
    if (i.heatRisk === "high") return `${qualifier} — plan around heat exposure`;
    if (i.crowdClass === "high") return `${qualifier} — busy; best for calm dogs`;
    if (i.hazardsClass === "high") return `${qualifier} — notable hazards present`;
    return `${qualifier} — some factors to plan around`;
  }
  return `${qualifier} — challenging for many dogs`;
}

// ── Rule: getSuitabilityReasons ───────────────────────────────────────────────

/** Short supporting reasons for why a verdict was reached (2–3 items). */
export function getSuitabilityReasons(system: TrailSystemForPage | null): string[] {
  return getComfortSummary(system);
}

// ── Rule: getSuitabilityWarnings ──────────────────────────────────────────────

/** Alias for getAvoidIf — returns the warning list for external use. */
export function getSuitabilityWarnings(system: TrailSystemForPage | null): Warning[] {
  return getAvoidIf(system);
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * computeSuitability — top-level entry point.
 *
 * Returns a fully structured SuitabilityOutput ready to pass to
 * DogSuitabilitySummary. All fields degrade gracefully when data is sparse.
 */
export function computeSuitability(system: TrailSystemForPage | null): SuitabilityOutput {
  const i = normalizeInput(system);
  const knownFields = [
    i.shadeClass, i.heatRisk, i.crowdClass, i.hazardsClass, i.roughnessRisk,
    i.gradeP50 !== null, i.gradeP90 !== null, i.dist !== null,
  ].filter(Boolean).length;

  return {
    verdict:          getSuitabilityVerdict(system),
    bestFor:          getBestFor(system),
    avoidIf:          getAvoidIf(system),
    bestTimeWindows:  getBestTimeWindows(system),
    comfortHighlights: getComfortSummary(system),
    hasEnoughData:    knownFields >= 3,
  };
}
