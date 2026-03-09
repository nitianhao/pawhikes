/**
 * DogTypesSection — shows suitability of this trail for 6 distinct dog types,
 * each with a 0–100% match score and 3 key factor signals (good/warn/bad).
 *
 * Placed inside the "Dog Fit" InsightCard as an expandable sub-section.
 * All scoring is derived from existing trailSystems fields — no new DB queries.
 */

import type { TrailSystemForPage } from "@/lib/data/trailSystem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Status = "good" | "warn" | "bad";

interface Signal {
  label: string;
  status: Status;
  note: string;
}

interface DogProfile {
  name: string;
  emoji: string;
  description: string;
  score: number; // 0–100
  signals: Signal[];
  hasData: boolean;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.min(hi, Math.max(lo, n));
}

function asStr(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function asNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Normalizes a percent field that may be 0–1 or 0–100 scale to 0–100.
 * Matches the pattern used in WaterSection.tsx.
 */
function normPct(v: unknown): number | null {
  const n = asNum(v);
  if (n === null) return null;
  if (n <= 1) return n * 100;
  if (n <= 100) return n;
  return 100;
}

// ---------------------------------------------------------------------------
// Dog-type score functions
// Each returns a DogProfile with score (0–100) and up to 3 signals.
// ---------------------------------------------------------------------------

function scoreSmallDog(s: TrailSystemForPage | null): DogProfile {
  const base: DogProfile = {
    name: "Small Dog",
    emoji: "🐾",
    description: "Toy & small breeds",
    score: 0,
    signals: [],
    hasData: false,
  };
  if (!s) return base;

  let pts = 65;
  const signals: Signal[] = [];
  let hasData = false;

  const dist = asNum(s.lengthMilesTotal);
  const gradeP90 = asNum(s.gradeP90);
  const roughness = asStr((s as any).roughnessRisk);
  const naturalPct = normPct((s as any).naturalSurfacePercent);
  const heat = asStr((s as any).heatRisk);
  const shadePct = normPct((s as any).shadeProxyPercent);

  // Distance — small dogs tire faster
  if (dist !== null) {
    hasData = true;
    if (dist < 2) {
      pts += 15;
      signals.push({ label: "Distance", status: "good", note: "Short & easy to complete" });
    } else if (dist < 4) {
      pts += 5;
      signals.push({ label: "Distance", status: "good", note: "Manageable length" });
    } else if (dist < 7) {
      pts -= 12;
      signals.push({ label: "Distance", status: "warn", note: "May need extra breaks" });
    } else {
      pts -= 30;
      signals.push({ label: "Distance", status: "bad", note: "Long for small breeds" });
    }
  }

  // Steep grade — short legs struggle on climbs
  if (gradeP90 !== null) {
    hasData = true;
    if (gradeP90 < 5) pts += 10;
    else if (gradeP90 < 12) pts -= 5;
    else if (gradeP90 < 18) pts -= 18;
    else pts -= 28;
  }

  // Surface / roughness — sensitive paws
  if (roughness) {
    hasData = true;
    if (roughness === "high") {
      pts -= 22;
      signals.push({ label: "Surface", status: "bad", note: "Rough on small paws" });
    } else if (roughness === "medium") {
      pts -= 8;
      signals.push({ label: "Surface", status: "warn", note: "Some rough patches" });
    } else {
      pts += 8;
      if (naturalPct !== null && naturalPct >= 50) {
        signals.push({ label: "Surface", status: "good", note: "Natural & paw-friendly" });
      } else {
        signals.push({ label: "Surface", status: "good", note: "Smooth, easy on paws" });
      }
    }
  }

  // Heat + shade combined
  if (heat === "high") {
    pts -= 18;
    signals.push({ label: "Heat", status: "bad", note: "Hot in summer — go early" });
  } else if (heat === "medium") {
    pts -= 8;
    signals.push({ label: "Shade", status: "warn", note: "Warm; bring extra water" });
  } else if (shadePct !== null) {
    hasData = true;
    if (shadePct >= 55) {
      pts += 5;
      signals.push({ label: "Shade", status: "good", note: "Well-shaded route" });
    } else if (shadePct < 20) {
      pts -= 5;
      signals.push({ label: "Shade", status: "warn", note: "Mostly exposed" });
    }
  }

  return { ...base, score: clamp(pts), signals: signals.slice(0, 3), hasData };
}

function scoreSeniorDog(s: TrailSystemForPage | null): DogProfile {
  const base: DogProfile = {
    name: "Senior Dog",
    emoji: "🐕",
    description: "Older dogs, 7+ years",
    score: 0,
    signals: [],
    hasData: false,
  };
  if (!s) return base;

  let pts = 65;
  const signals: Signal[] = [];
  let hasData = false;

  const dist = asNum(s.lengthMilesTotal);
  const gradeP50 = asNum((s as any).gradeP50);
  const gradeP90 = asNum((s as any).gradeP90);
  const roughness = asStr((s as any).roughnessRisk);
  const heat = asStr((s as any).heatRisk);
  const shadePct = normPct((s as any).shadeProxyPercent);

  // Grade P50 (typical slope) — most critical for joint health
  if (gradeP50 !== null) {
    hasData = true;
    if (gradeP50 < 3) {
      pts += 20;
      signals.push({ label: "Grade", status: "good", note: "Flat & joint-friendly" });
    } else if (gradeP50 < 6) {
      pts += 5;
      signals.push({ label: "Grade", status: "good", note: "Gentle slope" });
    } else if (gradeP50 < 10) {
      pts -= 18;
      signals.push({ label: "Grade", status: "warn", note: "Some challenging climbs" });
    } else {
      pts -= 35;
      signals.push({ label: "Grade", status: "bad", note: "Steep — hard on aging joints" });
    }
  } else if (gradeP90 !== null) {
    hasData = true;
    if (gradeP90 < 8) {
      pts += 5;
      signals.push({ label: "Grade", status: "good", note: "Gentle terrain" });
    } else if (gradeP90 > 15) {
      pts -= 20;
      signals.push({ label: "Grade", status: "bad", note: "Steep sections present" });
    }
  }

  // Distance
  if (dist !== null) {
    hasData = true;
    if (dist < 2) {
      pts += 15;
      signals.push({ label: "Distance", status: "good", note: "Short, relaxed walk" });
    } else if (dist < 3.5) {
      pts += 5;
      signals.push({ label: "Distance", status: "good", note: "Comfortable distance" });
    } else if (dist < 5) {
      pts -= 10;
      signals.push({ label: "Distance", status: "warn", note: "Moderate — plan rest stops" });
    } else {
      pts -= 28;
      signals.push({ label: "Distance", status: "bad", note: "Long for senior dogs" });
    }
  }

  // Surface roughness
  if (roughness) {
    hasData = true;
    if (roughness === "high") {
      pts -= 22;
      signals.push({ label: "Surface", status: "bad", note: "Hard on aging joints" });
    } else if (roughness === "medium") {
      pts -= 8;
    } else {
      pts += 8;
      if (signals.length < 3) {
        signals.push({ label: "Surface", status: "good", note: "Smooth surface — easy going" });
      }
    }
  }

  // Heat
  if (heat === "high") {
    pts -= 20;
    signals.push({ label: "Heat", status: "bad", note: "Senior dogs overheat faster" });
  } else if (heat === "medium") {
    pts -= 8;
  }

  // Shade bonus
  if (shadePct !== null && shadePct >= 50 && signals.length < 3) {
    pts += 5;
    signals.push({ label: "Shade", status: "good", note: "Good shade available" });
  }

  return { ...base, score: clamp(pts), signals: signals.slice(0, 3), hasData };
}

function scoreReactiveDog(s: TrailSystemForPage | null): DogProfile {
  const base: DogProfile = {
    name: "Reactive Dog",
    emoji: "⚠️",
    description: "Reactive to dogs & strangers",
    score: 0,
    signals: [],
    hasData: false,
  };
  if (!s) return base;

  let pts = 65;
  const signals: Signal[] = [];
  let hasData = false;

  const crowdClass = asStr((s as any).crowdClass);
  const leashRaw = asStr((s as any).leashPolicy);
  const bailoutScore = asNum((s as any).bailoutScore);
  const reactiveFriendly = (s as any).reactiveDogFriendly;
  const crowdSignals = (s as any).crowdSignals;

  // Use explicit reactiveDogFriendly flag if present
  if (typeof reactiveFriendly === "boolean") {
    hasData = true;
    pts += reactiveFriendly ? 12 : -12;
  }

  // Crowds — the primary factor
  if (crowdClass) {
    hasData = true;
    if (crowdClass === "low") {
      pts += 28;
      signals.push({ label: "Crowds", status: "good", note: "Usually quiet — fewer encounters" });
    } else if (crowdClass === "medium") {
      pts -= 10;
      signals.push({ label: "Crowds", status: "warn", note: "Moderately busy — stay alert" });
    } else if (crowdClass === "high") {
      pts -= 40;
      signals.push({ label: "Crowds", status: "bad", note: "Often busy — high encounter risk" });
    }
  }

  // Leash policy — 2nd most critical (controls other dogs)
  const isOffLeash = /off[- ]?leash|leash[- ]?optional/i.test(leashRaw);
  const isOnLeash = /on[- ]?leash|required/i.test(leashRaw);

  if (leashRaw) {
    hasData = true;
    if (isOnLeash) {
      pts += 20;
      signals.push({ label: "Leash rule", status: "good", note: "All dogs leashed — controlled" });
    } else if (isOffLeash) {
      pts -= 30;
      signals.push({ label: "Leash rule", status: "bad", note: "Off-leash allowed — surprise encounters" });
    } else {
      signals.push({ label: "Leash rule", status: "warn", note: "Leash rules vary — check before going" });
    }
  }

  // Entrance count — more entrances = more surprise meetings
  if (crowdSignals && typeof crowdSignals === "object") {
    const entranceCount = asNum((crowdSignals as any).entranceCount);
    if (entranceCount !== null) {
      if (entranceCount > 5) pts -= 10;
      else if (entranceCount <= 2) pts += 5;
    }
  }

  // Bailout points — ability to retreat
  if (bailoutScore !== null) {
    hasData = true;
    if (bailoutScore > 0) {
      pts += 8;
      if (signals.length < 3) {
        signals.push({ label: "Escape routes", status: "good", note: "Can cut short if needed" });
      }
    } else if (signals.length < 3) {
      signals.push({ label: "Escape routes", status: "warn", note: "Limited bailout options" });
    }
  }

  return { ...base, score: clamp(pts), signals: signals.slice(0, 3), hasData };
}

function scoreSensitiveDog(s: TrailSystemForPage | null): DogProfile {
  const base: DogProfile = {
    name: "Sensitive Dog",
    emoji: "🌸",
    description: "Anxious or paw-sensitive dogs",
    score: 0,
    signals: [],
    hasData: false,
  };
  if (!s) return base;

  let pts = 65;
  const signals: Signal[] = [];
  let hasData = false;

  const roughness = asStr((s as any).roughnessRisk);
  const heat = asStr((s as any).heatRisk);
  const shadePct = normPct((s as any).shadeProxyPercent);
  const crowdClass = asStr((s as any).crowdClass);
  const hazardsClass = asStr((s as any).hazardsClass);
  const naturalPct = normPct((s as any).naturalSurfacePercent);

  // Surface (paw sensitivity)
  if (roughness) {
    hasData = true;
    if (roughness === "high") {
      pts -= 30;
      signals.push({ label: "Surface", status: "bad", note: "Rough — can hurt sensitive paws" });
    } else if (roughness === "medium") {
      pts -= 10;
      signals.push({ label: "Surface", status: "warn", note: "Some rough patches" });
    } else {
      pts += 12;
      if (naturalPct !== null && naturalPct >= 50) {
        signals.push({ label: "Surface", status: "good", note: "Soft natural surface" });
      } else {
        signals.push({ label: "Surface", status: "good", note: "Paw-friendly surface" });
      }
    }
  }

  // Heat & shade (temperature / paw pad burns)
  if (heat === "high") {
    pts -= 30;
    signals.push({ label: "Heat", status: "bad", note: "Hot pavement can burn paws" });
  } else if (heat === "medium") {
    pts -= 12;
    signals.push({ label: "Heat", status: "warn", note: "Warm — check ground temp" });
  } else if (shadePct !== null) {
    hasData = true;
    if (shadePct >= 50) {
      pts += 12;
      signals.push({ label: "Shade", status: "good", note: "Well-shaded — stays cooler" });
    } else if (shadePct < 20) {
      pts -= 8;
      signals.push({ label: "Shade", status: "warn", note: "Mostly exposed" });
    }
  }

  // Crowds (anxiety trigger)
  if (crowdClass) {
    hasData = true;
    if (crowdClass === "low") {
      pts += 8;
      signals.push({ label: "Crowds", status: "good", note: "Quiet — less stressful" });
    } else if (crowdClass === "high") {
      pts -= 18;
      signals.push({ label: "Crowds", status: "bad", note: "Busy — may cause anxiety" });
    } else if (signals.length < 3) {
      signals.push({ label: "Crowds", status: "warn", note: "Moderate traffic" });
    }
  }

  // Hazards
  if (hazardsClass === "high") {
    pts -= 15;
  } else if (hazardsClass === "medium") {
    pts -= 8;
  }

  return { ...base, score: clamp(pts), signals: signals.slice(0, 3), hasData };
}

function scoreGettingFitDog(s: TrailSystemForPage | null): DogProfile {
  const base: DogProfile = {
    name: "Getting-Fit Dog",
    emoji: "💪",
    description: "Building up stamina",
    score: 0,
    signals: [],
    hasData: false,
  };
  if (!s) return base;

  // Start lower — ideal conditions are needed to earn a high score
  let pts = 42;
  const signals: Signal[] = [];
  let hasData = false;

  const dist = asNum(s.lengthMilesTotal);
  const gradeP50 = asNum((s as any).gradeP50);
  const roughness = asStr((s as any).roughnessRisk);
  const heat = asStr((s as any).heatRisk);
  const shadePct = normPct((s as any).shadeProxyPercent);
  const bailoutScore = asNum((s as any).bailoutScore);
  const amenitiesScore = asNum((s as any).amenitiesIndexScore);

  // Distance sweet spot: 1–3 miles
  if (dist !== null) {
    hasData = true;
    if (dist >= 1 && dist < 2.5) {
      pts += 30;
      signals.push({ label: "Distance", status: "good", note: "Ideal starter length (1–2.5 mi)" });
    } else if (dist >= 2.5 && dist < 4) {
      pts += 20;
      signals.push({ label: "Distance", status: "good", note: "Good training length" });
    } else if (dist >= 4 && dist < 6) {
      pts += 5;
      signals.push({ label: "Distance", status: "warn", note: "Moderate — build up to this" });
    } else if (dist < 1) {
      pts += 10;
      signals.push({ label: "Distance", status: "warn", note: "Very short — may need multiple laps" });
    } else {
      pts -= 15;
      signals.push({ label: "Distance", status: "bad", note: "Too long for early fitness training" });
    }
  }

  // Grade — gentle is ideal
  if (gradeP50 !== null) {
    hasData = true;
    if (gradeP50 < 3) {
      pts += 18;
      signals.push({ label: "Grade", status: "good", note: "Flat — great for conditioning" });
    } else if (gradeP50 < 7) {
      pts += 8;
      signals.push({ label: "Grade", status: "good", note: "Gentle grade — good challenge" });
    } else if (gradeP50 < 12) {
      pts -= 12;
      signals.push({ label: "Grade", status: "warn", note: "Moderate hills — start easy" });
    } else {
      pts -= 25;
      signals.push({ label: "Grade", status: "bad", note: "Too steep for fitness building" });
    }
  }

  // Bailout options — ability to cut the route short
  if (bailoutScore !== null) {
    hasData = true;
    if (bailoutScore > 0) {
      pts += 12;
      if (signals.length < 3) {
        signals.push({ label: "Flexibility", status: "good", note: "Can shorten route if needed" });
      }
    } else if (signals.length < 3) {
      signals.push({ label: "Flexibility", status: "warn", note: "Commit to full route" });
    }
  }

  // Heat
  if (heat === "high") pts -= 22;
  else if (heat === "medium") pts -= 10;

  // Shade bonus for recovery during walk
  if (shadePct !== null && shadePct >= 40) pts += 5;

  // Roughness
  if (roughness === "high") pts -= 15;
  else if (roughness === "low") pts += 5;

  // Rest stop amenities help fitness training
  if (amenitiesScore !== null && amenitiesScore > 0) pts += 5;

  return { ...base, score: clamp(pts), signals: signals.slice(0, 3), hasData };
}

function scoreWaterLoverDog(s: TrailSystemForPage | null): DogProfile {
  const base: DogProfile = {
    name: "Water Lover",
    emoji: "💧",
    description: "Dogs who love to swim & splash",
    score: 0,
    signals: [],
    hasData: false,
  };
  if (!s) return base;

  // Start very low — water access is everything
  let pts = 12;
  const signals: Signal[] = [];
  let hasData = false;

  const waterNearPct = normPct((s as any).waterNearPercent ?? (s as any).waterNearScore);
  const swimLikely = (s as any).swimLikely;
  const swimCount = asNum((s as any).swimAccessPointsCount);
  const waterTypes = (s as any).waterTypesNearby;
  const leashRaw = asStr((s as any).leashPolicy);
  const isOffLeash = /off[- ]?leash|leash[- ]?optional/i.test(leashRaw);
  const isOnLeash = /on[- ]?leash|required/i.test(leashRaw);

  // Swim access — primary factor
  if (swimLikely === true) {
    hasData = true;
    pts += 45;
    signals.push({ label: "Swim access", status: "good", note: "Swim spots confirmed on this trail" });
  } else if (swimCount !== null && swimCount > 0) {
    hasData = true;
    pts += 25;
    signals.push({
      label: "Swim access",
      status: "good",
      note: `${swimCount} water access point${swimCount > 1 ? "s" : ""}`,
    });
  } else if (waterNearPct !== null && waterNearPct > 20) {
    pts += 5;
    signals.push({ label: "Swim access", status: "warn", note: "Water nearby — no swim confirmed" });
  } else {
    signals.push({ label: "Swim access", status: "bad", note: "No water access found" });
  }

  // Water proximity (how much of the trail has water near it)
  if (waterNearPct !== null) {
    hasData = true;
    pts += Math.round((waterNearPct / 100) * 25); // up to 25 pts
    if (waterNearPct >= 50 && signals.length < 3) {
      signals.push({ label: "Water nearby", status: "good", note: "Water along most of the route" });
    } else if (waterNearPct >= 20 && signals.length < 3) {
      signals.push({ label: "Water nearby", status: "warn", note: "Water near parts of the trail" });
    } else if (waterNearPct < 10 && signals.length < 3) {
      signals.push({ label: "Water nearby", status: "bad", note: "Mostly dry route" });
    }
  }

  // Water type bonus (river/lake > stream/canal)
  if (Array.isArray(waterTypes)) {
    if (waterTypes.some((t: string) => ["river", "lake", "lake_or_pond"].includes(String(t).toLowerCase()))) {
      pts += 8;
    }
  }

  // Leash policy affects water access quality
  if (leashRaw) {
    hasData = true;
    if (isOffLeash) {
      pts += 12;
      if (signals.length < 3) {
        signals.push({ label: "Leash", status: "good", note: "Off-leash — free to splash!" });
      }
    } else if (isOnLeash) {
      pts -= 8;
      if (signals.length < 3) {
        signals.push({ label: "Leash", status: "warn", note: "Leash required — limits water play" });
      }
    }
  }

  return { ...base, score: clamp(pts), signals: signals.slice(0, 3), hasData };
}

function computeDogProfiles(s: TrailSystemForPage | null): DogProfile[] {
  return [
    scoreSmallDog(s),
    scoreSeniorDog(s),
    scoreReactiveDog(s),
    scoreSensitiveDog(s),
    scoreGettingFitDog(s),
    scoreWaterLoverDog(s),
  ];
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const SIGNAL_COLOR: Record<Status, string> = {
  good: "#2c5f28",
  warn: "#a09880",
  bad:  "#8b4a3a",
};

const SIGNAL_SYMBOL: Record<Status, string> = {
  good: "✓",
  warn: "–",
  bad:  "×",
};

function verdictLabel(score: number): string {
  if (score >= 80) return "Great fit";
  if (score >= 65) return "Good fit";
  if (score >= 55) return "Fair fit";
  if (score >= 42) return "Caution";
  if (score >= 25) return "Tough";
  return "Not ideal";
}

function scoreBarColor(score: number): string {
  if (score >= 70) return "#2f7d4b"; // green
  if (score >= 45) return "#d97706"; // orange
  return "#dc2626"; // red
}

function DogTypeCard({ name, emoji, description, score, signals, hasData }: DogProfile) {
  return (
    <div style={{
      border: "1px solid #e5e0d8",
      borderRadius: "0.875rem",
      overflow: "hidden",
      backgroundColor: "#fff",
    }}>
      {/* ── Header row ── */}
      <div style={{
        padding: "0.75rem 0.875rem",
        display: "flex",
        alignItems: "center",
        gap: "0.625rem",
        borderBottom: "1px solid #f0ece6",
      }}>
        <span style={{ fontSize: "1.25rem", flexShrink: 0, lineHeight: 1 }} aria-hidden>{emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#1c1a17", lineHeight: 1.2 }}>
            {name}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "#a09880", marginTop: "0.1rem", lineHeight: 1.3 }}>
            {description}
          </div>
        </div>
        {hasData && (
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#1c1a17", lineHeight: 1, letterSpacing: "-0.02em" }}>
              {score}%
            </div>
            <div style={{ fontSize: "0.5625rem", color: "#a09880", fontWeight: 700, marginTop: "0.15rem", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              {verdictLabel(score)}
            </div>
          </div>
        )}
      </div>

      {/* ── Card body ── */}
      <div style={{ padding: "0.625rem 0.875rem 0.75rem" }}>
        {hasData && (
          <div style={{
            height: "3px",
            borderRadius: "9999px",
            backgroundColor: "#f0ece6",
            overflow: "hidden",
            marginBottom: "0.625rem",
          }}>
            <div aria-hidden style={{
              height: "100%",
              width: `${score}%`,
              borderRadius: "9999px",
              backgroundColor: scoreBarColor(score),
            }} />
          </div>
        )}

        {signals.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {signals.map((sig, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", fontSize: "0.78rem" }}>
                <span style={{
                  color: SIGNAL_COLOR[sig.status],
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  flexShrink: 0,
                  lineHeight: 1.5,
                  width: "0.75rem",
                  textAlign: "center",
                }} aria-hidden>
                  {SIGNAL_SYMBOL[sig.status]}
                </span>
                <span style={{ color: "#3d3730", lineHeight: 1.45 }}>{sig.note}</span>
              </div>
            ))}
          </div>
        )}

        {!hasData && (
          <p style={{ fontSize: "0.73rem", color: "#a09880", margin: 0 }}>No trail data available</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export
// ---------------------------------------------------------------------------

export function DogTypesSection({ system }: { system: TrailSystemForPage | null }) {
  const profiles = computeDogProfiles(system);

  return (
    <div style={{ marginTop: "1.375rem", paddingTop: "1.125rem", borderTop: "1px solid #e5e7eb" }}>
      <div style={{ marginBottom: "0.875rem" }}>
        <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
          By Dog Type
        </h3>
        <p style={{ fontSize: "0.8125rem", color: "#64748b", margin: "0.2rem 0 0 0" }}>
          How this trail suits different kinds of dogs
        </p>
      </div>

      <div
        className="dog-types-grid"
        style={{
          display: "grid",
          gap: "0.75rem",
        }}
      >
        {profiles.map((profile) => (
          <DogTypeCard key={profile.name} {...profile} />
        ))}
      </div>
    </div>
  );
}
