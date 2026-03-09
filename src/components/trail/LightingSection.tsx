import { AlertTriangle, Lamp } from "lucide-react";

type LightingSectionProps = {
  litKnownSamples?: number | null;
  litYesSamples?: number | null;
  litPercentKnown?: number | null;
  totalSampleCount?: number | null;
};

type Confidence = "none" | "low" | "medium" | "high";

type NormalizedLighting = {
  knownCount: number;
  yesCount: number;
  percentKnown: number | null;
  overallPercent: number | null;
  confidence: Confidence;
};

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function normalizeLighting({
  litKnownSamples,
  litYesSamples,
  litPercentKnown,
  totalSampleCount,
}: LightingSectionProps): NormalizedLighting {
  const knownCountRaw = asFiniteNumber(litKnownSamples) ?? 0;
  const yesCountRaw = asFiniteNumber(litYesSamples) ?? 0;
  const knownCount = Math.max(0, Math.round(knownCountRaw));
  const yesCount = Math.max(0, Math.round(yesCountRaw));

  let percentKnown: number | null = null;
  const litPct = asFiniteNumber(litPercentKnown);
  if (litPct != null) {
    const normalized = litPct <= 1 ? litPct * 100 : litPct;
    percentKnown = Math.round(clampPercent(normalized));
  } else if (knownCount > 0) {
    percentKnown = Math.round(clampPercent((yesCount / knownCount) * 100));
  }

  let overallPercent: number | null = null;
  const totalCount = asFiniteNumber(totalSampleCount);
  if (totalCount != null && totalCount > 0) {
    overallPercent = Math.round(clampPercent((yesCount / totalCount) * 100));
  } else {
    overallPercent = percentKnown;
  }

  let confidence: Confidence = "high";
  if (knownCount === 0) confidence = "none";
  else if (knownCount < 10) confidence = "low";
  else if (knownCount < 30) confidence = "medium";

  return { knownCount, yesCount, percentKnown, overallPercent, confidence };
}

function interpretLighting(percentKnown: number | null, overallPercent: number | null): {
  status: string;
  summary: string;
  bestFor: string[];
} {
  if (percentKnown == null || overallPercent == null) {
    return {
      status: "Lighting unknown",
      summary: "No lighting data available.",
      bestFor: [],
    };
  }

  if (overallPercent >= 80) {
    return {
      status: "Well lit",
      summary: "Most of the trail appears to have lighting.",
      bestFor: ["Evening walks", "Early mornings"],
    };
  }
  if (overallPercent >= 40) {
    return {
      status: "Partially lit",
      summary: "Some sections have lighting, others may be dark.",
      bestFor: ["Short evening walks"],
    };
  }
  if (overallPercent >= 1) {
    return {
      status: "Mostly unlit",
      summary: "Lighting is limited along the route.",
      bestFor: ["Daytime use"],
    };
  }
  return {
    status: "No lighting reported",
    summary: "No lit sections detected.",
    bestFor: ["Daytime use only"],
  };
}

export function LightingSection({
  litKnownSamples,
  litYesSamples,
  litPercentKnown,
  totalSampleCount,
}: LightingSectionProps) {
  const normalized = normalizeLighting({
    litKnownSamples,
    litYesSamples,
    litPercentKnown,
    totalSampleCount,
  });
  const { knownCount, yesCount, percentKnown, overallPercent, confidence } = normalized;
  const { status, summary, bestFor } = interpretLighting(percentKnown, overallPercent);
  const displayPercent = overallPercent ?? 0;

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <h2 style={S.title}>Lighting</h2>
        <p style={S.subtitle}>Night visibility</p>
      </div>

      <div style={S.statusRow}>
        <div style={S.statusLeft}>
          <Lamp size={18} style={{ flexShrink: 0, color: "#ca8a04" }} />
          <p style={S.statusText}>{status}</p>
        </div>
        <p style={S.percentText}>{overallPercent == null ? "—" : `${overallPercent}%`}</p>
      </div>

      <div style={S.barOuter} title={`Estimated lit coverage: ${displayPercent}%`}>
        <div
          style={{
            ...S.barInner,
            width: `${displayPercent}%`,
            minWidth: displayPercent > 0 ? "2px" : 0,
          }}
        />
      </div>

      <div style={S.metaRow}>
        <span>Based on {knownCount} sampled segments</span>
        {confidence === "low" ? (
          <span style={S.warnInline}>
            <AlertTriangle size={12} />
            Limited data
          </span>
        ) : null}
      </div>

      <p style={S.summaryText}>{summary}</p>

      {bestFor.length > 0 ? (
        <div style={S.pillsRow}>
          {bestFor.map((item) => (
            <span key={item} style={S.pill}>
              {item}
            </span>
          ))}
        </div>
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
    background: "#f59e0b",
    transition: "width 0.2s",
  } as const,
  metaRow: {
    marginTop: "0.35rem",
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    flexWrap: "wrap" as const,
    fontSize: "0.77rem",
    color: "#6b7280",
  } as const,
  warnInline: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "#b45309",
    fontWeight: 600,
  } as const,
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
    gap: "0.35rem",
    flexWrap: "wrap" as const,
  } as const,
  pill: {
    border: "1px solid #e5e7eb",
    borderRadius: "9999px",
    padding: "0.18rem 0.5rem",
    background: "#fff",
    color: "#374151",
    fontSize: "0.78rem",
    lineHeight: 1.3,
    whiteSpace: "nowrap" as const,
  } as const,
} as const;
