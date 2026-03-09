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

type ShadeBand = "sun" | "partial" | "shade" | "dense";

function toShadeBand(shade: number): ShadeBand {
  if (shade >= 0.8) return "dense";
  if (shade >= 0.4) return "shade";
  if (shade >= 0.1) return "partial";
  return "sun";
}

function computeShadeMix(points: ShadeProfilePoint[] | null | undefined, totalMiles: number | null | undefined): Record<ShadeBand, number> {
  const out: Record<ShadeBand, number> = { sun: 0, partial: 0, shade: 0, dense: 0 };
  if (!points || points.length < 2) return out;
  const maxD = totalMiles != null && Number.isFinite(totalMiles) && totalMiles > 0 ? totalMiles : points[points.length - 1].d;
  if (!(maxD > 0)) return out;

  let covered = 0;
  for (let i = 0; i < points.length; i += 1) {
    const start = points[i].d;
    const end = i < points.length - 1 ? points[i + 1].d : maxD;
    const span = Math.max(0, end - start);
    if (span <= 0) continue;
    out[toShadeBand(points[i].shade)] += span;
    covered += span;
  }

  if (covered <= 0) return out;
  return {
    sun: (out.sun / covered) * 100,
    partial: (out.partial / covered) * 100,
    shade: (out.shade / covered) * 100,
    dense: (out.dense / covered) * 100,
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
  shadeProxyPercent,
  shadeProfilePoints,
  lengthMilesTotal,
}: ShadeSectionProps) {
  const tier = asShadeTier(shadeClass, shadeProxyPercent);
  const colors = THEME[tier];
  const percent = normalizePercent(shadeProxyPercent);
  const shadeMix = computeShadeMix(shadeProfilePoints, lengthMilesTotal);
  const shadeMixRows: Array<{ key: ShadeBand; label: string; value: number; color: string; border: string }> = [
    { key: "sun", label: "Sun", value: shadeMix.sun, color: "#fef3c7", border: "#fde68a" },
    { key: "partial", label: "Partial", value: shadeMix.partial, color: "#bbf7d0", border: "#86efac" },
    { key: "shade", label: "Shade", value: shadeMix.shade, color: "#4ade80", border: "#22c55e" },
    { key: "dense", label: "Dense", value: shadeMix.dense, color: "#166534", border: "#14532d" },
  ];

  return (
    <section style={S.section} className="shade-section-root">
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

      <div className="shade-compact-wrap" style={S.compactWrap}>
        <div style={S.compactCard} className="shade-compact-card">
          <p style={S.compactTitle}>Exposure mix</p>
          <div style={S.mixList}>
            {shadeMixRows.map((row) => (
              <div key={row.key} style={S.mixRow}>
                <span style={S.mixLabel}>{row.label}</span>
                <div style={S.mixBarTrack}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.max(2, row.value)}%`,
                      background: row.color,
                      borderRight: `1px solid ${row.border}`,
                    }}
                  />
                </div>
                <span style={S.mixPct}>{row.value.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ ...S.compactCard, background: colors.soft }} className="shade-compact-card">
          <p style={S.compactTitle}>Quick read</p>
          <p style={S.compactBody}>{interpretShade(shadeClass, shadeProxyPercent)}</p>
        </div>
      </div>
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
  compactWrap: {
    marginTop: "0.6rem",
    gap: "0.6rem",
  } as const,
  compactCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "0.55rem",
    background: "#fff",
    padding: "0.5rem 0.6rem",
  } as const,
  compactTitle: {
    margin: 0,
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "#64748b",
  } as const,
  compactBody: {
    margin: "0.35rem 0 0",
    fontSize: "0.8rem",
    color: "#1e293b",
    lineHeight: 1.4,
  } as const,
  mixList: {
    marginTop: "0.35rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.3rem",
  } as const,
  mixRow: {
    display: "grid",
    gridTemplateColumns: "minmax(55px, auto) minmax(110px, 1fr) auto",
    alignItems: "center",
    gap: "0.35rem",
  } as const,
  mixLabel: {
    fontSize: "0.78rem",
    color: "#334155",
  } as const,
  mixBarTrack: {
    height: "0.34rem",
    borderRadius: "9999px",
    background: "#e5e7eb",
    overflow: "hidden",
  } as const,
  mixPct: {
    fontSize: "0.77rem",
    color: "#334155",
    fontWeight: 700,
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
} as const;
