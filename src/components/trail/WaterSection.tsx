import { Droplet, MapPin, Waves } from "lucide-react";
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

function renderDetailValue(v: unknown): string {
  if (v == null) return "\u2014";
  if (typeof v === "string") return v.trim() || "\u2014";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => String(x)).join(", ") || "\u2014";
  return JSON.stringify(v);
}

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

  return (
    <section style={S.section}>
      {/* Header */}
      <div style={S.headerRow}>
        <h2 style={S.title}>Water</h2>
        <p style={S.subtitle}>Hydration &amp; splash potential</p>
      </div>

      {/* Chips row */}
      <div style={S.chipsRow}>
        <div style={S.chip}>
          <Droplet size={14} style={{ flexShrink: 0, color: "#0ea5e9" }} />
          <span style={S.chipText}>Near water: <strong>{pctDisplay}%</strong></span>
        </div>
        <div style={S.chip}>
          <Waves size={14} style={{ flexShrink: 0, color: "#0ea5e9" }} />
          <span style={S.chipText}>Swim: <strong>{swimLabel(swim)}</strong></span>
        </div>
        <div style={{ ...S.chip, flex: "1 1 auto", minWidth: 0 }}>
          <MapPin size={14} style={{ flexShrink: 0, color: "#6b7280" }} />
          <span style={{ ...S.chipText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {typesDisplay}
          </span>
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

      {/* Summary text */}
      <p style={S.summaryText}>{summary}</p>

      {/* Details disclosure */}
      <details style={S.details}>
        <summary style={S.summaryRow}>
          <span>Data details</span>
          <span style={{ fontSize: "0.7rem", color: "#94a3b8" }}>\u25BC</span>
        </summary>
        <div style={S.detailsList}>
          {([
            ["Water near score", waterNearScore],
            ["Water near percent", waterNearPercent],
            ["Water types nearby", waterTypesNearby],
            ["Swim likely", swimLikely],
          ] as [string, unknown][]).map(([label, value]) => (
            <div key={label} style={S.detailRow}>
              <span>{label}</span>
              <span style={S.detailVal}>{renderDetailValue(value)}</span>
            </div>
          ))}
        </div>
      </details>
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
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
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
    margin: "0.55rem 0 0",
    fontSize: "0.85rem",
    lineHeight: 1.5,
    color: "#374151",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  } as const,
  details: {
    marginTop: "0.55rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "white",
    padding: "0.4rem 0.6rem",
  } as const,
  summaryRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    cursor: "pointer",
    fontSize: "0.82rem",
    fontWeight: 500,
    color: "#374151",
  } as const,
  detailsList: { marginTop: "0.35rem" } as const,
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.15rem 0",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "0.8rem",
    color: "#374151",
  } as const,
  detailVal: {
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums" as const,
    color: "#111827",
  } as const,
} as const;
