import { AlertTriangle, CloudRain, Footprints, Waves } from "lucide-react";

export type MudRiskStatus = "low" | "medium" | "high" | "unknown";
export type MudRiskConfidence = "none" | "low" | "medium" | "high";

export type MudRiskDriver = {
  icon: "rain" | "footprints" | "waves" | "sample";
  label: string;
  value?: string;
};

export type MudRiskModel = {
  status: MudRiskStatus;
  label: string;
  percent: number | null;
  confidence: MudRiskConfidence;
  drivers: MudRiskDriver[];
  summary: string;
  tips: string[];
};

export type MudRiskSectionProps = {
  mudLastComputedAt?: number | string | null;
  mudRisk?: "low" | "medium" | "high" | string | null;
  mudRiskReason?: string | null;
  mudRiskScore?: number | null;
  mudRiskKnownSamples?: number | null;
  mudRiskReasons?: string[] | string | null;
  surfaceSummary?: unknown;
  surfaceBreakdown?: unknown;
  waterNearPercent?: number | null;
};

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function toSurfacePct(value: number): number {
  return value <= 1 ? value * 100 : Math.max(0, value);
}

function toSurfaceMap(raw: unknown): Record<string, number> {
  const rec = asRecord(raw);
  if (!rec) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = asNumber(v);
    if (n == null) continue;
    const key = String(k).toLowerCase().replace(/[_-]+/g, " ").trim();
    out[key] = toSurfacePct(n);
  }
  return out;
}

function surfaceShares(
  surfaceSummary: unknown,
  surfaceBreakdown: unknown
): { unpavedSoftPct: number; unknownPct: number; hardPct: number } {
  const summary = toSurfaceMap((surfaceSummary as any)?.distribution ?? surfaceSummary);
  const breakdown = toSurfaceMap(surfaceBreakdown);
  const merged = { ...summary };
  for (const [k, v] of Object.entries(breakdown)) {
    merged[k] = Math.max(merged[k] ?? 0, v);
  }
  let unpavedSoft = 0;
  let unknown = 0;
  let hard = 0;
  for (const [key, pct] of Object.entries(merged)) {
    if (/(dirt|grass|sand|woodchips|mud|soft|unpaved)/.test(key)) unpavedSoft += pct;
    else if (/(unknown|unclassified)/.test(key)) unknown += pct;
    else if (/(asphalt|concrete|paved|hard)/.test(key)) hard += pct;
    else unpavedSoft += pct * 0.5;
  }
  return { unpavedSoftPct: unpavedSoft, unknownPct: unknown, hardPct: hard };
}

function normalizeReasons(reasons: string[] | string | null | undefined): string[] {
  if (reasons == null) return [];
  if (Array.isArray(reasons)) {
    return reasons.map((r) => String(r ?? "").trim()).filter(Boolean).slice(0, 2);
  }
  const s = String(reasons).trim();
  if (!s) return [];
  return s.split(/[,;|]/).map((r) => r.trim()).filter(Boolean).slice(0, 2);
}

function buildMudRiskModel(props: MudRiskSectionProps): MudRiskModel {
  const {
    mudRisk,
    mudRiskScore,
    mudRiskKnownSamples,
    mudRiskReasons,
    mudRiskReason,
    surfaceSummary,
    surfaceBreakdown,
    waterNearPercent,
  } = props;

  const score = asNumber(mudRiskScore);
  let percent: number | null = null;
  if (score != null) {
    if (score <= 1) percent = Math.round(Math.max(0, Math.min(100, score * 100)));
    else if (score <= 100) percent = Math.round(Math.max(0, Math.min(100, score)));
  }

  const riskStr = String(mudRisk ?? "").trim().toLowerCase();
  let status: MudRiskStatus = "unknown";
  if (riskStr === "low" || riskStr === "medium" || riskStr === "high") {
    status = riskStr as MudRiskStatus;
  } else if (percent != null) {
    if (percent >= 70) status = "high";
    else if (percent >= 35) status = "medium";
    else status = "low";
  }

  if (process.env.NODE_ENV === "development" && riskStr && status === "unknown") {
    console.warn("[mud] status mismatch", { mudRisk: riskStr, mudRiskScore });
  }

  const samples = asNumber(mudRiskKnownSamples) ?? 0;
  let confidence: MudRiskConfidence = "low";
  if (typeof mudRiskKnownSamples === "number" || mudRiskKnownSamples != null) {
    if (samples === 0) confidence = "none";
    else if (samples < 10) confidence = "low";
    else if (samples < 30) confidence = "medium";
    else confidence = "high";
  } else {
    if (status === "unknown") confidence = "none";
    else confidence = "low";
  }

  const surface = surfaceShares(surfaceSummary, surfaceBreakdown);
  const waterPct = asNumber(waterNearPercent);
  const waterPctNorm = waterPct != null ? (waterPct <= 1 ? waterPct * 100 : waterPct) : null;

  const drivers: MudRiskDriver[] = [];
  if (surface.unpavedSoftPct >= 30) {
    drivers.push({ icon: "footprints", label: "More unpaved surface", value: `${Math.round(surface.unpavedSoftPct)}%` });
  }
  if (surface.unknownPct >= 40) {
    drivers.push({ icon: "footprints", label: "Surface uncertain", value: `${Math.round(surface.unknownPct)}%` });
  }
  if (waterPctNorm != null && waterPctNorm >= 70) {
    drivers.push({ icon: "waves", label: "Water nearby (wetter areas)", value: `${Math.round(waterPctNorm)}%` });
  }
  const reasonStrings = normalizeReasons(mudRiskReasons ?? mudRiskReason ?? null);
  for (const r of reasonStrings) {
    if (drivers.length >= 3) break;
    drivers.push({ icon: "rain", label: r });
  }
  if (samples > 0 && drivers.length < 3) {
    drivers.push({ icon: "sample", label: `Based on ${samples} samples` });
  }

  let summary: string;
  if (status === "low") {
    summary = "Usually firm footing. Mud is unlikely except after heavy rain.";
  } else if (status === "medium") {
    summary = "Some sections may get muddy, especially after rain.";
  } else if (status === "high") {
    summary = "Expect muddy stretches after rain. Paw wiping recommended.";
  } else {
    summary = "Not enough data to estimate mud risk yet.";
  }
  if (confidence === "low") summary += " (Limited data)";
  else if (confidence === "none") summary += " (No data yet)";

  const tips: string[] = [];
  if (status === "medium" || status === "high") {
    tips.push("Avoid right after rain.");
    tips.push("Bring a towel/paw wipes.");
  }
  if (surface.hardPct >= 50 && (waterPctNorm == null || waterPctNorm < 40) && status !== "high") {
    if (tips.length < 2) tips.push("Good choice after rain.");
  }
  if (status === "unknown" && tips.length === 0) {
    tips.push("Check recent conditions from local reviews.");
  }
  const finalTips = tips.slice(0, 2);

  const labelMap: Record<MudRiskStatus, string> = {
    low: "Low mud risk",
    medium: "Medium mud risk",
    high: "High mud risk",
    unknown: "Mud risk unknown",
  };

  return {
    status,
    label: labelMap[status],
    percent,
    confidence,
    drivers,
    summary,
    tips: finalTips,
  };
}

function DriverIcon({ driver }: { driver: MudRiskDriver }) {
  if (driver.icon === "rain") return <CloudRain size={12} style={{ flexShrink: 0, color: "#78716c" }} />;
  if (driver.icon === "waves") return <Waves size={12} style={{ flexShrink: 0, color: "#0ea5e9" }} />;
  if (driver.icon === "sample") return <Footprints size={12} style={{ flexShrink: 0, color: "#6b7280" }} />;
  return <Footprints size={12} style={{ flexShrink: 0, color: "#78716c" }} />;
}

export function MudRiskSection(props: MudRiskSectionProps) {
  const model = buildMudRiskModel(props);
  const displayPercent = model.percent ?? 0;
  const isUnknown = model.status === "unknown";

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <h2 style={S.title}>Mud Risk</h2>
        <p style={S.subtitle}>Footing after rain</p>
      </div>

      <div style={S.statusRow}>
        <div style={S.statusLeft}>
          <CloudRain size={18} style={{ flexShrink: 0, color: "#78716c" }} />
          <p style={S.statusText}>{model.status.charAt(0).toUpperCase() + model.status.slice(1)}</p>
        </div>
        <p style={S.percentText}>{model.percent != null ? `${model.percent}%` : "—"}</p>
      </div>

      <div style={S.barOuter} title={isUnknown ? "Mud risk unknown" : `Risk: ${displayPercent}%`}>
        <div
          style={{
            ...S.barInner,
            width: isUnknown ? "0%" : `${displayPercent}%`,
            minWidth: displayPercent > 0 ? "2px" : 0,
            background: isUnknown ? "#e5e7eb" : model.status === "high" ? "#b45309" : model.status === "medium" ? "#ca8a04" : "#22c55e",
          }}
        />
      </div>

      {model.drivers.length > 0 ? (
        <div style={S.chipsRow}>
          {model.drivers.map((d, i) => (
            <span key={i} style={S.chip}>
              <DriverIcon driver={d} />
              <span style={S.chipText}>{d.label}{d.value != null ? ` ${d.value}` : ""}</span>
            </span>
          ))}
        </div>
      ) : null}

      <p style={S.summaryText}>{model.summary}</p>

      {model.tips.length > 0 ? (
        <div style={S.pillsRow}>
          {model.tips.map((tip) => (
            <span key={tip} style={S.pill}>
              <AlertTriangle size={11} style={{ flexShrink: 0 }} />
              {tip}
            </span>
          ))}
        </div>
      ) : null}

      {model.confidence === "low" || model.confidence === "none" ? (
        <p style={S.confidenceNote}>
          {model.confidence === "none" ? "No mud risk data yet." : "Limited sample size for mud risk."}
        </p>
      ) : null}

    </section>
  );
}

const S = {
  section: {
    marginTop: 0,
    border: "1px solid #e5e7eb",
    borderRadius: "0.7rem",
    padding: "0.75rem",
  } as const,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  } as const,
  title: { margin: 0, fontSize: "1.1rem", fontWeight: 600, color: "#111827" } as const,
  subtitle: { margin: 0, fontSize: "0.78rem", color: "#6b7280" } as const,
  statusRow: {
    marginTop: "0.4rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  } as const,
  statusLeft: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
    minWidth: 0,
  } as const,
  statusText: {
    margin: 0,
    color: "#111827",
    fontWeight: 700,
    fontSize: "0.97rem",
    lineHeight: 1.2,
  } as const,
  percentText: {
    margin: 0,
    color: "#111827",
    fontWeight: 700,
    fontSize: "0.92rem",
    fontVariantNumeric: "tabular-nums" as const,
    flexShrink: 0,
  } as const,
  barOuter: {
    marginTop: "0.3rem",
    height: "8px",
    width: "100%",
    borderRadius: "9999px",
    overflow: "hidden",
    background: "#e5e7eb",
  } as const,
  barInner: {
    height: "100%",
    borderRadius: "9999px",
    transition: "width 0.2s",
  } as const,
  chipsRow: {
    marginTop: "0.35rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
  } as const,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "white",
    padding: "0.25rem 0.5rem",
    fontSize: "0.8rem",
    color: "#374151",
  } as const,
  chipText: { whiteSpace: "nowrap" as const } as const,
  summaryText: {
    margin: "0.35rem 0 0",
    fontSize: "0.82rem",
    lineHeight: 1.45,
    color: "#374151",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  } as const,
  pillsRow: {
    marginTop: "0.35rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
  } as const,
  pill: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    border: "1px solid #fcd34d",
    background: "#fffbeb",
    color: "#92400e",
    borderRadius: "0.5rem",
    padding: "0.2rem 0.45rem",
    fontSize: "0.77rem",
    lineHeight: 1.25,
  } as const,
  confidenceNote: {
    margin: "0.35rem 0 0",
    fontSize: "0.8rem",
    color: "#6b7280",
  } as const,
} as const;
