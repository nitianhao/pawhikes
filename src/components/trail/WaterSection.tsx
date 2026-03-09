import { Droplet, Waves } from "lucide-react";
import { WaterProfileChart, type WaterProfilePoint } from "./WaterProfileChart";

const TYPE_LABELS: Record<string, string> = {
  stream: "Stream",
  river: "River",
  lake_or_pond: "Lake/Pond",
  canal: "Canal",
  reservoir: "Reservoir",
  wetland: "Wetland",
  coastline: "Coast",
  unknown: "Unknown",
};

function normalizePercent(opts: {
  waterNearPercent?: number | null;
  waterNearScore?: number | null;
}): number | null {
  const { waterNearPercent, waterNearScore } = opts;
  let pct: number;

  if (typeof waterNearPercent === "number" && Number.isFinite(waterNearPercent)) {
    if (waterNearPercent <= 1) pct = waterNearPercent * 100;
    else if (waterNearPercent <= 100) pct = waterNearPercent;
    else pct = 100;
  } else if (typeof waterNearScore === "number" && Number.isFinite(waterNearScore)) {
    if (waterNearScore <= 1) pct = waterNearScore * 100;
    else if (waterNearScore <= 100) pct = waterNearScore;
    else pct = 100;
  } else {
    return null;
  }

  pct = Math.round(pct);
  pct = Math.max(0, Math.min(100, pct));
  return pct;
}

if (process.env.NODE_ENV === "development") {
  const a = normalizePercent({ waterNearPercent: 86 });
  const b = normalizePercent({ waterNearPercent: 0.86 });
  const c = normalizePercent({ waterNearScore: 0.86 });
  if (a !== 86 || b !== 86 || c !== 86) {
    console.warn(
      "[WaterSection] normalizePercent dev assertion failed:",
      { "86 =>": a, "0.86 (pct) =>": b, "0.86 (score) =>": c },
    );
  }
}

function normalizeTypes(raw: unknown): string[] {
  let items: string[] = [];
  if (Array.isArray(raw)) {
    items = raw.map((v) => String(v ?? "").trim()).filter(Boolean);
  } else if (typeof raw === "string" && raw.trim()) {
    items = raw.split(/[,;|]+/).map((s) => s.trim()).filter(Boolean);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/[\s_-]+/g, "_");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(TYPE_LABELS[key] ?? item.charAt(0).toUpperCase() + item.slice(1));
  }
  return out;
}

function normalizeSwim(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "yes" || s === "true" || s === "1") return true;
    if (s === "no" || s === "false" || s === "0") return false;
  }
  if (typeof raw === "number") return raw > 0;
  return null;
}

function swimLabel(v: boolean | null): string {
  if (v === true) return "Likely";
  if (v === false) return "Unlikely";
  return "Unknown";
}

function buildSummary(
  pct: number,
  swim: boolean | null,
  types: string[],
): string {
  const parts: string[] = [];
  if (pct >= 80) {
    parts.push("Water is frequently near the route\u2014great for cooling breaks. Bring a bowl anyway.");
  } else if (pct >= 40) {
    parts.push("You\u2019ll likely pass some water. Carry water for longer stretches.");
  } else {
    parts.push("Water is limited near the trail\u2014bring enough for you and your dog.");
  }
  if (swim === true) parts.push("Swimming spots may be available.");
  else if (swim === false) parts.push("Swimming spots are unlikely.");

  const hasFlowing = types.some((t) => /river|stream/i.test(t));
  if (swim === true && hasFlowing) parts.push("Check current/flow after rain.");

  return parts.join(" ");
}

type WaterSectionProps = {
  waterNearScore?: number | null;
  waterNearPercent?: number | null;
  waterTypesNearby?: string[] | string | null;
  swimLikely?: boolean | "Yes" | "No" | null;
  waterProfilePoints?: WaterProfilePoint[] | null;
  lengthMilesTotal?: number | null;
};

export function WaterSection({
  waterNearScore,
  waterNearPercent,
  waterTypesNearby,
  swimLikely,
  waterProfilePoints,
  lengthMilesTotal,
}: WaterSectionProps) {
  const pct = normalizePercent({ waterNearPercent, waterNearScore });
  const pctDisplay = pct ?? 0;

  if (process.env.PERF_LOG === "1") {
    console.log("[water] inputs", {
      waterNearPercent,
      waterNearScore,
      normalizedPercent: pct,
    });
  }

  const types = normalizeTypes(waterTypesNearby);
  const swim = normalizeSwim(swimLikely);
  const summary = buildSummary(pctDisplay, swim, types);
  const typesDisplay = types.slice(0, 3).join(" \u2022 ") || "Unknown";
  const typesList = types.length > 0 ? types.slice(0, 4) : ["Unknown"];

  return (
    <section style={S.section}>
      {/* Header */}
      <div className="section-header-row">
        <h2 style={S.title}>Water</h2>
        <p style={S.subtitle}>Hydration &amp; splash potential</p>
      </div>

      {/* Chips row */}
      <div style={S.chipsRow}>
        <div style={S.chip} className="water-stat-chip">
          <Droplet size={14} style={{ flexShrink: 0, color: "#0ea5e9" }} />
          <span style={S.chipText}>Near water: <strong>{pctDisplay}%</strong></span>
        </div>
        <div style={S.chip} className="water-stat-chip">
          <Waves size={14} style={{ flexShrink: 0, color: "#0ea5e9" }} />
          <span style={S.chipText}>Swim: <strong>{swimLabel(swim)}</strong></span>
        </div>
      </div>

      {/* Gauge bar */}
      <div style={S.gaugeRow}>
        <span style={S.gaugeMuted}>Water nearby</span>
        <span style={S.gaugePct}>{pctDisplay}%</span>
      </div>
      <div style={S.barOuter} title={`Water near: ${pctDisplay}%`}>
        <div
          style={{
            height: "100%",
            width: `${pctDisplay}%`,
            minWidth: pctDisplay > 0 ? "2px" : 0,
            borderRadius: "9999px",
            background: "#0ea5e9",
            transition: "width 0.2s",
          }}
        />
      </div>

      {/* Water profile chart */}
      {waterProfilePoints && waterProfilePoints.length >= 2 && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            color: "#6b7280",
            marginBottom: "0.35rem",
          }}>
            Water along the trail
          </div>
          <WaterProfileChart points={waterProfilePoints} totalMiles={lengthMilesTotal} />
        </div>
      )}

      {/* Compact summary */}
      <div className="water-compact-wrap" style={S.compactWrap}>
        <div style={S.compactCard} className="water-compact-card">
          <p style={S.compactTitle}>Water types nearby</p>
          <div style={S.typesWrap}>
            {typesList.map((type) => (
              <span key={type} style={S.typePill}>
                {type}
              </span>
            ))}
            {types.length > typesList.length ? (
              <span style={S.typePillMuted}>+{types.length - typesList.length} more</span>
            ) : null}
          </div>
          <p style={S.typesInline}>{typesDisplay}</p>
        </div>
        <div style={S.compactCard} className="water-compact-card">
          <p style={S.compactTitle}>Quick read</p>
          <p style={S.summaryText}>{summary}</p>
        </div>
      </div>
    </section>
  );
}

const S = {
  section: {
    marginTop: "1.25rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    padding: "0.9rem",
  } as const,
  title: { margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#111827" } as const,
  subtitle: { margin: 0, fontSize: "0.85rem", color: "#6b7280" } as const,
  chipsRow: {
    marginTop: "0.55rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.4rem",
  } as const,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "white",
    padding: "0.3rem 0.55rem",
    fontSize: "0.82rem",
    color: "#374151",
  } as const,
  chipText: {
    fontSize: "0.82rem",
    color: "#374151",
    whiteSpace: "nowrap" as const,
  } as const,
  gaugeRow: {
    marginTop: "0.55rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
  } as const,
  gaugeMuted: { fontSize: "0.75rem", color: "#6b7280" } as const,
  gaugePct: { fontSize: "0.75rem", fontWeight: 600, color: "#111827", fontVariantNumeric: "tabular-nums" as const } as const,
  barOuter: {
    marginTop: "0.2rem",
    height: "8px",
    width: "100%",
    borderRadius: "9999px",
    overflow: "hidden",
    background: "#e5e7eb",
  } as const,
  summaryText: {
    margin: "0.32rem 0 0",
    fontSize: "0.82rem",
    lineHeight: 1.5,
    color: "#374151",
  } as const,
  compactWrap: {
    marginTop: "0.6rem",
    gap: "0.55rem",
  } as const,
  compactCard: {
    border: "1px solid #e5e7eb",
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
    color: "#6b7280",
  } as const,
  typesWrap: {
    marginTop: "0.32rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.3rem",
  } as const,
  typePill: {
    display: "inline-block",
    borderRadius: "9999px",
    border: "1px solid #bae6fd",
    background: "#f0f9ff",
    padding: "0.15rem 0.45rem",
    fontSize: "0.74rem",
    fontWeight: 600,
    color: "#0c4a6e",
  } as const,
  typePillMuted: {
    display: "inline-block",
    borderRadius: "9999px",
    border: "1px solid #e2e8f0",
    background: "#f8fafc",
    padding: "0.15rem 0.45rem",
    fontSize: "0.74rem",
    fontWeight: 600,
    color: "#64748b",
  } as const,
  typesInline: {
    margin: "0.32rem 0 0",
    fontSize: "0.76rem",
    color: "#374151",
  } as const,
} as const;
