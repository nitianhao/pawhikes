import { ElevationProfileChart, type ElevationProfilePoint } from "./ElevationProfileChart";
import { TrailEffortCard, type EffortLevel, type TrailEffortMetrics } from "./TrailEffortCard";

/**
 * ElevationWidthSection — effort level + trail width, matching InsightCard visual language.
 *
 * Trail Effort: compact difficulty meter + supporting metrics (TrailEffortCard).
 * Trail Width: explicit Narrow / In-between / Wide tier visualization.
 * ▸ Numbers & data (collapsed)
 */

export type ElevationProfile = {
  emoji: string;
  label: string;
  explanation: string;
};

export type WidthSummary = {
  min?: number | null;
  max?: number | null;
  p50?: number | null;
  p90?: number | null;
  unknownPct?: number | null;
};

export type ElevationWidthSectionProps = {
  elevationProfile?: ElevationProfile | null;
  elevationProfilePoints?: ElevationProfilePoint[] | null;
  totalGainFt?: number | null;
  maxFt?: number | null;
  minFt?: number | null;
  lengthMiles?: number | null;
  gradP50?: number | null;
  gradP90?: number | null;
  widthSummary?: WidthSummary | null;
};

// ---------------------------------------------------------------------------
// Effort tier
// ---------------------------------------------------------------------------
type EffortTier = {
  level: 1 | 2 | 3 | 4;
  label: string;
  color: string;
  bg: string;
  border: string;
  desc: string;
};

function getEffortTier(p50Pct: number | null, profile: ElevationProfile | null | undefined): EffortTier {
  // Prefer the same source as the hero: elevation gain per mile → 4-tier label. Only use grade (p50Pct) when profile is missing.
  const lbl = profile?.label ?? "";
  if (lbl === "Mostly Flat") return { level: 1, label: "Easy", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", desc: "Flat or gently rolling. Comfortable for almost all dogs." };
  if (lbl === "Rolling Hills") return { level: 2, label: "Moderate", color: "#b45309", bg: "#fffbeb", border: "#fde68a", desc: "Gentle hills. Most healthy adult dogs will enjoy this." };
  if (lbl === "Challenging Climb") return { level: 3, label: "Challenging", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", desc: "Noticeable climbs. Better for fit, active dogs." };
  if (lbl === "Steep Workout") return { level: 4, label: "Strenuous", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca", desc: "Steep sections throughout. Best for athletic dogs." };
  // Fallback when no profile: use median grade % (same thresholds as before)
  if (p50Pct != null && p50Pct < 3) return { level: 1, label: "Easy", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", desc: "Flat or gently rolling. Comfortable for almost all dogs." };
  if (p50Pct != null && p50Pct < 6) return { level: 2, label: "Moderate", color: "#b45309", bg: "#fffbeb", border: "#fde68a", desc: "Gentle hills. Most healthy adult dogs will enjoy this." };
  if (p50Pct != null && p50Pct <= 10) return { level: 3, label: "Challenging", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa", desc: "Noticeable climbs. Better for fit, active dogs." };
  return { level: 4, label: "Strenuous", color: "#b91c1c", bg: "#fef2f2", border: "#fecaca", desc: "Steep sections throughout. Best for athletic dogs." };
}

// ---------------------------------------------------------------------------
// Width tier
// ---------------------------------------------------------------------------
type WidthTier = {
  label: string;
  desc: string;
  pos: number;
  band: "narrow" | "between" | "wide";
};

function getWidthTier(p50: number | null): WidthTier | null {
  if (p50 == null) return null;
  if (p50 >= 10) return { label: "Wide", desc: "Comfortable side-by-side walking in most sections.", pos: 0.8, band: "wide" };
  if (p50 >= 6) return { label: "In-between", desc: "Mixed width. Some side-by-side, some single-file spots.", pos: 0.5, band: "between" };
  return { label: "Narrow", desc: "Mostly single-file with tighter passing space.", pos: 0.18, band: "narrow" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatFeet(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString()} ft`;
}

function toPercent(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  if (v <= 1) return Math.round(v * 1000) / 10;
  return Math.round(v * 10) / 10;
}

function effortLevelFromTier(level: 1 | 2 | 3 | 4): EffortLevel {
  const map: Record<1 | 2 | 3 | 4, EffortLevel> = { 1: "easy", 2: "moderate", 3: "challenging", 4: "strenuous" };
  return map[level];
}

function steepnessLabelFromP50(p50Pct: number | null): string | null {
  if (p50Pct == null || !Number.isFinite(p50Pct)) return null;
  if (p50Pct < 3) return "gentle";
  if (p50Pct < 6) return "moderate";
  if (p50Pct <= 10) return "steep";
  return "very steep";
}

/** Steep sections: Low / Med / High from median grade. Only show when not contradicting effort. */
function steepSectionsFromP50(p50Pct: number | null): "Low" | "Med" | "High" | null {
  if (p50Pct == null || !Number.isFinite(p50Pct)) return null;
  if (p50Pct < 3) return "Low";
  if (p50Pct < 6) return "Med";
  return "High";
}

/** Only pass steep sections chip when it doesn't contradict the main effort label. */
function resolveSteepSectionsForChip(
  effortLevel: EffortLevel,
  steep: "Low" | "Med" | "High" | null
): "Low" | "Med" | "High" | null {
  if (steep == null) return null;
  const isHighEffort = effortLevel === "challenging" || effortLevel === "strenuous";
  const isLowEffort = effortLevel === "easy";
  if (isLowEffort && steep === "High") return null;
  if (isHighEffort && steep === "Low") return null;
  return steep;
}

// ---------------------------------------------------------------------------
// Width gradient track
// ---------------------------------------------------------------------------
function WidthTrack({ tier, widthP50 }: { tier: WidthTier; widthP50: number | null }) {
  const dotPct = Math.round(tier.pos * 100);
  const bands: Array<{
    id: WidthTier["band"];
    label: string;
    range: string;
    fg: string;
    bg: string;
    bd: string;
  }> = [
    { id: "narrow", label: "Narrow", range: "< 6 ft", fg: "#9a3412", bg: "#fff7ed", bd: "#fed7aa" },
    { id: "between", label: "In-between", range: "6-10 ft", fg: "#92400e", bg: "#fffbeb", bd: "#fde68a" },
    { id: "wide", label: "Wide", range: "10+ ft", fg: "#166534", bg: "#f0fdf4", bd: "#bbf7d0" },
  ];

  return (
    <div style={{ marginTop: "0.875rem" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "0.4rem",
          marginBottom: "0.55rem",
        }}
      >
        {bands.map((band) => {
          const isActive = band.id === tier.band;
          return (
            <div
              key={band.id}
              style={{
                border: "1px solid",
                borderColor: isActive ? band.bd : "#e5e7eb",
                background: isActive ? band.bg : "#fafafa",
                borderRadius: "0.55rem",
                padding: "0.35rem 0.45rem",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: "0.74rem", fontWeight: 700, color: isActive ? band.fg : "#6b7280", lineHeight: 1.15 }}>
                {band.label}
              </div>
              <div style={{ marginTop: "0.1rem", fontSize: "0.66rem", color: isActive ? band.fg : "#9ca3af", letterSpacing: "0.03em" }}>
                {band.range}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ position: "relative", height: "12px", borderRadius: "9999px", background: "linear-gradient(to right, #e5e0d8, #6b6457)", marginBottom: "0.5rem" }}>
        <div style={{
          position: "absolute",
          top: "50%",
          left: `${dotPct}%`,
          transform: "translate(-50%, -50%)",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          backgroundColor: "#fff",
          border: "3px solid #6b6457",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }} aria-hidden />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.7rem", color: "#9ca3af", letterSpacing: "0.04em" }}>NARROW</span>
        {widthP50 != null && (
          <span
            style={{
              fontSize: "0.72rem",
              color: "#475569",
              fontWeight: 600,
              border: "1px solid #e2e8f0",
              backgroundColor: "#f8fafc",
              borderRadius: "9999px",
              padding: "0.12rem 0.45rem",
            }}
          >
            Typical: ~{Math.round(widthP50)} ft
          </span>
        )}
        <span style={{ fontSize: "0.7rem", color: "#9ca3af", letterSpacing: "0.04em" }}>WIDE</span>
      </div>
      <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "#64748b", lineHeight: 1.45 }}>
        {tier.desc}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat block — neutral header matching InsightCard design language
// ---------------------------------------------------------------------------
function StatBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="elevation-stat-block" style={{
      border: "1px solid #e5e0d8",
      borderRadius: "0.75rem",
      overflow: "hidden",
    }}>
      <div className="elevation-stat-block__header" style={{
        padding: "0.5rem 0.875rem",
        borderBottom: "1px solid #f0ece6",
      }}>
        <span style={{
          fontSize: "0.6875rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          color: "#a09880",
        }}>
          {label}
        </span>
      </div>
      <div className="elevation-stat-block__body" style={{ padding: "0.875rem 0.875rem 1rem", backgroundColor: "#fff" }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function ElevationWidthSection({
  elevationProfile,
  elevationProfilePoints,
  totalGainFt,
  maxFt,
  minFt,
  lengthMiles,
  gradP50,
  gradP90,
  widthSummary,
}: ElevationWidthSectionProps) {
  const hasProfile = elevationProfile != null || totalGainFt != null || maxFt != null || minFt != null;
  const p50Pct = toPercent(gradP50);
  const p90Pct = toPercent(gradP90);
  const hasGrade = p50Pct != null || p90Pct != null;
  const w = widthSummary;
  const widthP50 = w?.p50 != null && Number.isFinite(w.p50) ? w.p50 : null;
  const hasWidth = w && [w.min, w.max, w.p50, w.p90].some((v) => v != null && Number.isFinite(v as number));
  const hasAny = hasProfile || hasGrade || hasWidth;

  if (!hasAny) return null;

  const effort = getEffortTier(p50Pct, elevationProfile);
  const widthTier = getWidthTier(widthP50);

  const effortLevel = effortLevelFromTier(effort.level);
  const steepSections = steepSectionsFromP50(p50Pct);
  const gainPerMileFt =
    totalGainFt != null &&
    lengthMiles != null &&
    lengthMiles >= 0.5
      ? totalGainFt / lengthMiles
      : null;
  const effortMetrics: TrailEffortMetrics = {
    gainFt: totalGainFt ?? null,
    gainPerMileFt: gainPerMileFt ?? null,
    steepSectionsLabel: resolveSteepSectionsForChip(effortLevel, steepSections),
  };

  return (
    <section style={S.section}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

        {/* Effort block — compact meter + stat chips */}
        {(hasProfile || hasGrade) && (
          <StatBlock label="Trail Effort">
            <TrailEffortCard effortLevel={effortLevel} metrics={effortMetrics} />
          </StatBlock>
        )}

        {/* Elevation profile chart */}
        {elevationProfilePoints && elevationProfilePoints.length >= 2 && (
          <StatBlock label="Elevation Profile">
            <ElevationProfileChart
              points={elevationProfilePoints}
              minFt={minFt}
              maxFt={maxFt}
            />
          </StatBlock>
        )}

        {/* Width block */}
        {hasWidth && widthTier != null && (
          <StatBlock label="Trail Width">
            <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1c1a17", lineHeight: 1 }}>
              {widthTier.label}
            </span>
            <WidthTrack tier={widthTier} widthP50={widthP50} />
          </StatBlock>
        )}

      </div>
    </section>
  );
}

const S = {
  section: {} as const,
} as const;
