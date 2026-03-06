import { ShadeProfileChart, type ShadeProfilePoint } from "./ShadeProfileChart";

type ShadeSectionProps = {
  shadeClass?: string | null;
  shadeLastComputedAt?: number | string | null;
  shadeProxyPercent?: number | null;
  shadeProxyScore?: number | null;
  shadeSources?: unknown;
  shadeProfilePoints?: ShadeProfilePoint[] | null;
  lengthMilesTotal?: number | null;
};

type ShadeTier = "HIGH" | "MEDIUM" | "LOW";

type ShadeSourcesMetrics = {
  treeRowCount?: number | null;
  mediumPolyCount?: number | null;
  strongPolyCount?: number | null;
  treeNodeCountUsed?: number | null;
};

export function asShadeTier(shadeClass: string | null | undefined, shadeProxyPercent: number | null | undefined): ShadeTier {
  const cls = String(shadeClass ?? "").trim().toUpperCase();
  if (cls === "HIGH" || cls === "MEDIUM" || cls === "LOW") return cls;
  const percent = normalizePercent(shadeProxyPercent);
  if (percent == null) return "LOW";
  if (percent >= 66) return "HIGH";
  if (percent >= 33) return "MEDIUM";
  return "LOW";
}

/** Short label for header/verdict: matches dedicated section (Low / Moderate / High). */
export function getShadeShortLabel(shadeClass: string | null | undefined, shadeProxyPercent: number | null | undefined): "low shade" | "moderate shade" | "high shade" {
  const tier = asShadeTier(shadeClass, shadeProxyPercent);
  if (tier === "HIGH") return "high shade";
  if (tier === "MEDIUM") return "moderate shade";
  return "low shade";
}

/** One-word tier for chips/secondary UI: matches dedicated section. */
export function getShadeTierLabel(shadeClass: string | null | undefined, shadeProxyPercent: number | null | undefined): "Low" | "Moderate" | "High" {
  const tier = asShadeTier(shadeClass, shadeProxyPercent);
  if (tier === "HIGH") return "High";
  if (tier === "MEDIUM") return "Moderate";
  return "Low";
}

function normalizePercent(x: number | null | undefined): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const asPercent = x <= 1 ? x * 100 : x;
  return Math.max(0, Math.min(100, asPercent));
}

function formatPct(x: number | null | undefined): string {
  const pct = normalizePercent(x);
  if (pct == null) return "—";
  return `${pct.toFixed(1)}%`;
}

function formatScore(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x <= 1 ? Number(x).toFixed(4) : String(x);
}

function formatDate(value: number | string | null | undefined): string {
  if (value == null) return "—";
  const numeric = typeof value === "string" ? Number(value) : value;
  const parsed = new Date(numeric);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
}

function formatCount(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}

function interpretShade(shadeClass: string | null | undefined, shadeProxyPercent: number | null | undefined): string {
  const tier = asShadeTier(shadeClass, shadeProxyPercent);
  if (tier === "HIGH") {
    return "Most of the trail benefits from consistent tree cover.";
  }
  if (tier === "MEDIUM") {
    return "Roughly half the trail has meaningful tree or canopy coverage. Expect mixed sun and shade.";
  }
  return "Limited natural shade. Expect prolonged sun exposure.";
}

function summaryLabel(tier: ShadeTier): string {
  if (tier === "HIGH") return "High shade coverage";
  if (tier === "MEDIUM") return "Moderate shade coverage";
  return "Low shade coverage";
}

function extractShadeSources(shadeSources: unknown): ShadeSourcesMetrics {
  if (shadeSources == null || typeof shadeSources !== "object") return {};
  const src = shadeSources as Record<string, unknown>;
  return {
    treeRowCount: typeof src.treeRowCount === "number" ? src.treeRowCount : null,
    mediumPolyCount: typeof src.mediumPolyCount === "number" ? src.mediumPolyCount : null,
    strongPolyCount: typeof src.strongPolyCount === "number" ? src.strongPolyCount : null,
    treeNodeCountUsed: typeof src.treeNodeCountUsed === "number" ? src.treeNodeCountUsed : null,
  };
}

const THEME: Record<ShadeTier, { badgeBg: string; badgeText: string; fill: string; soft: string }> = {
  HIGH: {
    badgeBg: "#166534",
    badgeText: "#ecfdf5",
    fill: "#166534",
    soft: "#dcfce7",
  },
  MEDIUM: {
    badgeBg: "#657a2d",
    badgeText: "#fefce8",
    fill: "#657a2d",
    soft: "#eef5d5",
  },
  LOW: {
    badgeBg: "#b45309",
    badgeText: "#fffbeb",
    fill: "#b45309",
    soft: "#fef3c7",
  },
};

export function ShadeSection({
  shadeClass,
  shadeLastComputedAt,
  shadeProxyPercent,
  shadeProxyScore,
  shadeSources,
  shadeProfilePoints,
  lengthMilesTotal,
}: ShadeSectionProps) {
  const tier = asShadeTier(shadeClass, shadeProxyPercent);
  const colors = THEME[tier];
  const percent = normalizePercent(shadeProxyPercent);
  const metrics = extractShadeSources(shadeSources);

  return (
    <section style={S.section}>
      <h2 style={S.title}>🌳 Shade</h2>

      <div style={S.topRow}>
        <div style={S.leftSummary}>
          <span style={{ ...S.badge, background: colors.badgeBg, color: colors.badgeText }}>{tier}</span>
          <p style={S.summaryText}>{summaryLabel(tier)}</p>
        </div>

        <div style={S.rightSummary}>
          <div style={S.progressTrack} aria-label="Shade proxy percent">
            <div style={{ ...S.progressFill, width: `${percent ?? 0}%`, background: colors.fill }} />
            <span style={S.progressText}>{formatPct(shadeProxyPercent)}</span>
          </div>
        </div>
      </div>

      <div style={S.metaRow}>
        <span style={S.metaItem}>Proxy score: {formatScore(shadeProxyScore)}</span>
        <span style={S.metaItem}>Last analyzed: {formatDate(shadeLastComputedAt)}</span>
      </div>

      <div style={{ ...S.interpretation, background: colors.soft }}>
        <p style={S.interpretationText}>{interpretShade(shadeClass, shadeProxyPercent)}</p>
      </div>

      {shadeProfilePoints && shadeProfilePoints.length >= 2 && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: "#6b7280",
            marginBottom: "0.35rem",
          }}>
            Shade along the trail
          </div>
          <ShadeProfileChart points={shadeProfilePoints} totalMiles={lengthMilesTotal} />
        </div>
      )}

      <details style={S.details}>
        <summary style={S.detailsSummary}>Data breakdown</summary>

        <div style={S.statsGrid}>
          <div style={S.statTile}>
            <span style={S.statLabel}>Tree rows detected</span>
            <strong style={S.statValue}>{formatCount(metrics.treeRowCount)}</strong>
          </div>
          <div style={S.statTile}>
            <span style={S.statLabel}>Medium canopy polygons</span>
            <strong style={S.statValue}>{formatCount(metrics.mediumPolyCount)}</strong>
          </div>
          <div style={S.statTile}>
            <span style={S.statLabel}>Dense canopy polygons</span>
            <strong style={S.statValue}>{formatCount(metrics.strongPolyCount)}</strong>
          </div>
          <div style={S.statTile}>
            <span style={S.statLabel}>Tree nodes analyzed</span>
            <strong style={S.statValue}>{formatCount(metrics.treeNodeCountUsed)}</strong>
          </div>
        </div>

        <p style={S.note}>
          Shade score derived from mapped tree density and canopy polygons near trail geometry.
        </p>

        <pre style={S.rawPre}>{shadeSources != null ? JSON.stringify(shadeSources, null, 2) : "—"}</pre>
      </details>
    </section>
  );
}

const S = {
  section: {
    marginTop: "1rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.8rem",
    background: "#f8fafc",
    padding: "0.8rem",
  } as const,
  title: {
    margin: 0,
    marginBottom: "0.55rem",
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#0f172a",
  } as const,
  topRow: {
    display: "grid",
    gridTemplateColumns: "minmax(150px, auto) 1fr",
    gap: "0.7rem",
    alignItems: "center",
  } as const,
  leftSummary: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
  } as const,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "fit-content",
    borderRadius: "999px",
    padding: "0.22rem 0.6rem",
    fontSize: "0.78rem",
    fontWeight: 700,
    letterSpacing: "0.02em",
  } as const,
  summaryText: {
    margin: 0,
    fontSize: "0.85rem",
    color: "#334155",
    lineHeight: 1.35,
  } as const,
  rightSummary: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
  } as const,
  progressTrack: {
    position: "relative" as const,
    height: "8px",
    borderRadius: "999px",
    overflow: "hidden",
    background: "#e5e7eb",
  } as const,
  progressFill: {
    position: "absolute" as const,
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: "999px",
    transition: "width 220ms ease",
  } as const,
  progressText: {
    position: "absolute" as const,
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.62rem",
    fontWeight: 700,
    color: "#ffffff",
    textShadow: "0 1px 1px rgba(0,0,0,0.4)",
    letterSpacing: "0.01em",
  } as const,
  metaRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem 0.8rem",
    marginTop: "0.55rem",
  } as const,
  metaItem: {
    fontSize: "0.76rem",
    color: "#475569",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  interpretation: {
    marginTop: "0.55rem",
    borderRadius: "0.55rem",
    padding: "0.45rem 0.55rem",
  } as const,
  interpretationText: {
    margin: 0,
    fontSize: "0.8rem",
    color: "#1e293b",
    lineHeight: 1.38,
  } as const,
  details: {
    marginTop: "0.55rem",
  } as const,
  detailsSummary: {
    cursor: "pointer",
    fontSize: "0.8rem",
    color: "#1f2937",
    fontWeight: 600,
  } as const,
  statsGrid: {
    marginTop: "0.45rem",
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "0.4rem",
  } as const,
  statTile: {
    border: "1px solid #e2e8f0",
    borderRadius: "0.45rem",
    background: "#ffffff",
    padding: "0.45rem 0.5rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.1rem",
  } as const,
  statLabel: {
    fontSize: "0.73rem",
    color: "#64748b",
    lineHeight: 1.25,
  } as const,
  statValue: {
    fontSize: "0.9rem",
    color: "#0f172a",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  note: {
    margin: "0.5rem 0 0",
    fontSize: "0.72rem",
    color: "#64748b",
    lineHeight: 1.3,
  } as const,
  rawPre: {
    margin: "0.45rem 0 0",
    padding: "0.45rem",
    border: "1px solid #e2e8f0",
    borderRadius: "0.45rem",
    background: "#f8fafc",
    color: "#334155",
    fontSize: "0.68rem",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: "160px",
    overflow: "auto",
  } as const,
} as const;
