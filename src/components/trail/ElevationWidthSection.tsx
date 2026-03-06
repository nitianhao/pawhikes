import { ElevationProfileChart, type ElevationProfilePoint } from "./ElevationProfileChart";
import { TrailEffortCard, type EffortLevel, type TrailEffortMetrics } from "./TrailEffortCard";

/**
 * ElevationWidthSection — effort level + trail width, matching InsightCard visual language.
 *
 * Trail Effort: compact difficulty meter + supporting metrics (TrailEffortCard).
 * Trail Width: gradient track + label.
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
type WidthTier = { label: string; desc: string; pos: number };

function getWidthTier(p50: number | null): WidthTier | null {
  if (p50 == null) return null;
  if (p50 >= 14) return { label: "Wide open", desc: "Dogs can roam side by side with plenty of room.", pos: 0.92 };
  if (p50 >= 10) return { label: "Spacious", desc: "Comfortable walking side by side with your dog.", pos: 0.68 };
  if (p50 >= 6)  return { label: "Standard", desc: "Single file in places — manageable on leash.", pos: 0.42 };
  return            { label: "Narrow", desc: "Close passes likely — keep your dog close on leash.", pos: 0.14 };
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
function WidthTrack({ tier }: { tier: WidthTier }) {
  const dotPct = Math.round(tier.pos * 100);
  return (
    <div style={{ marginTop: "0.875rem" }}>
      <div style={{ position: "relative", height: "12px", borderRadius: "9999px", background: "linear-gradient(to right, #bbf7d0, #15803d)", marginBottom: "0.5rem" }}>
        <div style={{
          position: "absolute",
          top: "50%",
          left: `${dotPct}%`,
          transform: "translate(-50%, -50%)",
          width: "20px",
          height: "20px",
          borderRadius: "50%",
          backgroundColor: "#fff",
          border: "3px solid #15803d",
          boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }} aria-hidden />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: "0.7rem", color: "#9ca3af", letterSpacing: "0.04em" }}>NARROW</span>
        <span style={{ fontSize: "0.7rem", color: "#9ca3af", letterSpacing: "0.04em" }}>WIDE</span>
      </div>
      <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "#64748b", lineHeight: 1.45 }}>
        {tier.desc}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat block — matches InsightCard inner metric style
// ---------------------------------------------------------------------------
function StatBlock({
  icon,
  label,
  accentColor,
  accentBg,
  accentBorder,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      border: `1px solid ${accentBorder}`,
      borderRadius: "0.75rem",
      overflow: "hidden",
    }}>
      {/* Mini header band — matches InsightCard pattern */}
      <div style={{
        backgroundColor: accentBg,
        padding: "0.5rem 0.875rem",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
      }}>
        <div style={{
          width: "1.5rem",
          height: "1.5rem",
          borderRadius: "50%",
          backgroundColor: accentColor,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <span style={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
          color: accentColor,
        }}>
          {label}
        </span>
      </div>
      {/* Body */}
      <div style={{ padding: "0.875rem 0.875rem 1rem", backgroundColor: "#fff" }}>
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
          <StatBlock
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 3l4 8 5-5 5 15H2L8 3z" />
              </svg>
            }
            label="Trail Effort"
            accentColor="#ea580c"
            accentBg="#fff7ed"
            accentBorder="#fed7aa"
          >
            <TrailEffortCard effortLevel={effortLevel} metrics={effortMetrics} />
          </StatBlock>
        )}

        {/* Elevation profile chart */}
        {elevationProfilePoints && elevationProfilePoints.length >= 2 && (
          <StatBlock
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            }
            label="Elevation Profile"
            accentColor="#15803d"
            accentBg="#f0fdf4"
            accentBorder="#bbf7d0"
          >
            <ElevationProfileChart
              points={elevationProfilePoints}
              minFt={minFt}
              maxFt={maxFt}
            />
          </StatBlock>
        )}

        {/* Width block */}
        {hasWidth && widthTier != null && (
          <StatBlock
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <path d="M4 12h16M4 12l3-3M4 12l3 3M20 12l-3-3M20 12l-3 3" />
              </svg>
            }
            label="Trail Width"
            accentColor="#15803d"
            accentBg="#f0fdf4"
            accentBorder="#bbf7d0"
          >
            <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#15803d", lineHeight: 1 }}>
              {widthTier.label}
            </span>
            <WidthTrack tier={widthTier} />
          </StatBlock>
        )}

      </div>

      {/* Raw numbers collapsed */}
      <details style={{ marginTop: "0.75rem" }}>
        <summary style={S.detailsSummary} className="collapsible-summary">
          Numbers &amp; data
        </summary>
        <div style={S.detailsInner}>
          <div style={S.dataGrid}>
            {totalGainFt != null && <DataCell label="Total climb" value={formatFeet(totalGainFt)} />}
            {maxFt != null && <DataCell label="Highest point" value={formatFeet(maxFt)} />}
            {minFt != null && <DataCell label="Lowest point" value={formatFeet(minFt)} />}
            {p50Pct != null && <DataCell label="Typical slope" value={`${p50Pct}%`} />}
            {p90Pct != null && <DataCell label="Steepest sections" value={`${p90Pct}%`} />}
            {widthP50 != null && <DataCell label="Typical width" value={`~${Math.round(widthP50)} ft`} />}
          </div>
          <p style={S.detailNote}>Slope % = rise ÷ run × 100. Typical = median across all segments.</p>
        </div>
      </details>
    </section>
  );
}

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "0.3rem 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: "0.78rem", color: "#6b7280" }}>{label}: </span>
      <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#111827" }}>{value}</span>
    </div>
  );
}

const S = {
  section: {
    marginTop: "1.25rem",
    border: "1px solid #e5e7eb",
    borderLeft: "4px solid #16a34a",
    borderRadius: "0.75rem",
    padding: "0.875rem",
    backgroundColor: "#fff",
  } as const,
  detailsSummary: {
    cursor: "pointer",
    fontSize: "0.8rem",
    color: "#94a3b8",
    userSelect: "none" as const,
  } as const,
  detailsInner: {
    marginTop: "0.5rem",
    paddingTop: "0.5rem",
    borderTop: "1px solid #f1f5f9",
  } as const,
  dataGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0 1rem",
  } as const,
  detailNote: {
    marginTop: "0.5rem",
    fontSize: "0.75rem",
    color: "#9ca3af",
    lineHeight: 1.4,
  } as const,
} as const;
