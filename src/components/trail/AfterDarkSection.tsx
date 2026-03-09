import { AlertTriangle, Moon, Waves } from "lucide-react";

type LightingConfidence = "none" | "low" | "medium" | "high";
type SurfaceCategory = "hard" | "mixed_natural" | "soft" | "unknown";
type AccessHoursSummary = {
  label: string;
  isUnknown: boolean;
  closesBefore21: boolean;
  closedAtNight: boolean;
};

type NightReadinessInput = {
  lightingPercent: number | null;
  lightingConfidence: LightingConfidence;
  accessHours: AccessHoursSummary;
  surfaceCategory: SurfaceCategory;
  waterPercent: number | null;
  hazardCount: number;
};

type NightReadinessOutput = {
  status: "excellent" | "good" | "limited" | "not_recommended";
  label: string;
  reasoning: string[];
  tips: string[];
};

type AfterDarkSectionProps = {
  litKnownSamples?: number | null;
  litYesSamples?: number | null;
  litPercentKnown?: number | null;
  totalSampleCount?: number | null;
  accessRules?: unknown;
  surfaceSummary?: unknown;
  surfaceBreakdown?: unknown;
  hazardPoints?: unknown;
  waterNearPercent?: number | null;
  swimLikely?: boolean | string | null;
};

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clampPercent(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function normalizeLighting(props: {
  litKnownSamples?: number | null;
  litYesSamples?: number | null;
  litPercentKnown?: number | null;
  totalSampleCount?: number | null;
}): { lightingPercent: number | null; knownCount: number; confidence: LightingConfidence } {
  const knownCount = Math.max(0, Math.round(asNumber(props.litKnownSamples) ?? 0));
  const yesCount = Math.max(0, Math.round(asNumber(props.litYesSamples) ?? 0));

  let percentKnown: number | null = null;
  const rawPct = asNumber(props.litPercentKnown);
  if (rawPct != null) {
    percentKnown = Math.round(clampPercent(rawPct <= 1 ? rawPct * 100 : rawPct));
  } else if (knownCount > 0) {
    percentKnown = Math.round(clampPercent((yesCount / knownCount) * 100));
  }

  let lightingPercent: number | null = percentKnown;
  const totalCount = asNumber(props.totalSampleCount);
  if (totalCount != null && totalCount > 0) {
    lightingPercent = Math.round(clampPercent((yesCount / totalCount) * 100));
  }

  let confidence: LightingConfidence = "high";
  if (knownCount === 0) confidence = "none";
  else if (knownCount < 10) confidence = "low";
  else if (knownCount < 30) confidence = "medium";

  return { lightingPercent, knownCount, confidence };
}

function parseTimeMinutes(raw: string): number | null {
  const text = raw.trim().toLowerCase();
  if (!text) return null;
  if (text === "24/7") return 23 * 60 + 59;
  const m = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const ap = m[3];
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour === 12) hour = 0;
  if (ap === "pm") hour += 12;
  return hour * 60 + minute;
}

function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const ap = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12} ${ap}` : `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

function summarizeAccessHours(accessRules: unknown): AccessHoursSummary {
  const rules = accessRules && typeof accessRules === "object" ? (accessRules as any) : null;
  const hours = rules?.hours;
  const weekly = Array.isArray(hours?.openingHoursText) ? hours.openingHoursText : [];
  const lines = weekly.map((v: unknown) => String(v ?? "").trim()).filter(Boolean);
  if (hours?.known !== true || lines.length === 0) {
    return {
      label: "Hours unknown",
      isUnknown: true,
      closesBefore21: false,
      closedAtNight: false,
    };
  }

  const allText = lines.join(" ").toLowerCase();
  if (/\bsunset\b/.test(allText)) {
    return {
      label: "Closes around sunset",
      isUnknown: false,
      closesBefore21: true,
      closedAtNight: true,
    };
  }
  if (/\b24\/7\b/.test(allText)) {
    return {
      label: "Open 24/7",
      isUnknown: false,
      closesBefore21: false,
      closedAtNight: false,
    };
  }

  const closingTimes: number[] = [];
  for (const line of lines) {
    const rhs = line.includes(":") ? line.slice(line.indexOf(":") + 1).trim() : line;
    const ranges = rhs.split(/,|;/).map((r: string) => r.trim()).filter(Boolean);
    for (const range of ranges) {
      const normalized = range.replace(/[–—]/g, "-");
      const parts = normalized.split("-").map((p: string) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const close = parseTimeMinutes(parts[parts.length - 1]);
      if (close != null) closingTimes.push(close);
    }
  }

  if (closingTimes.length === 0) {
    return {
      label: "Hours posted",
      isUnknown: false,
      closesBefore21: false,
      closedAtNight: false,
    };
  }

  const latestClose = Math.max(...closingTimes);
  return {
    label: `Open until ${formatMinutes(latestClose)}`,
    isUnknown: false,
    closesBefore21: latestClose < 21 * 60,
    closedAtNight: latestClose < 20 * 60,
  };
}

function normalizePercent(raw: unknown): number | null {
  const n = asNumber(raw);
  if (n == null) return null;
  return Math.round(clampPercent(n <= 1 ? n * 100 : n));
}

function toSurfaceMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = asNumber(value);
    if (n == null) continue;
    out[String(key).toLowerCase()] = n <= 1 ? n * 100 : n;
  }
  return out;
}

function summarizeSurface(surfaceSummary: unknown, surfaceBreakdown: unknown): {
  category: SurfaceCategory;
  label: string;
} {
  const merged = { ...toSurfaceMap((surfaceSummary as any)?.distribution), ...toSurfaceMap(surfaceBreakdown) };
  let hard = 0;
  let mixed = 0;
  let soft = 0;

  for (const [k, v] of Object.entries(merged)) {
    const key = k.replace(/[_-]+/g, " ").trim();
    if (/(asphalt|concrete|paved|hard)/.test(key)) hard += v;
    else if (/(crushed stone|gravel|compacted|mixed|unpaved)/.test(key)) mixed += v;
    else if (/(dirt|grass|sand|woodchips|mud|soft)/.test(key)) soft += v;
    else mixed += v * 0.5;
  }

  if (hard <= 0 && mixed <= 0 && soft <= 0) return { category: "unknown", label: "Surface unknown" };
  if (hard >= mixed && hard >= soft) return { category: "hard", label: "Mostly hard surface" };
  if (soft > hard && soft >= mixed) return { category: "soft", label: "Mostly natural/soft surface" };
  return { category: "mixed_natural", label: "Mixed-natural surface" };
}

function summarizeHazards(hazardPoints: unknown): { total: number; bikeConflictCount: number } {
  if (!Array.isArray(hazardPoints)) return { total: 0, bikeConflictCount: 0 };
  let bikeConflictCount = 0;
  for (const p of hazardPoints) {
    const kind = String((p as any)?.kind ?? "").toLowerCase();
    const tags = JSON.stringify((p as any)?.tags ?? {}).toLowerCase();
    if (kind.includes("bike_conflict") || kind.includes("bike") || tags.includes("bike")) {
      bikeConflictCount++;
    }
  }
  return { total: hazardPoints.length, bikeConflictCount };
}

function computeNightReadiness({
  lightingPercent,
  lightingConfidence,
  accessHours,
  surfaceCategory,
  waterPercent,
  hazardCount,
}: NightReadinessInput): NightReadinessOutput {
  const reasoning: string[] = [];
  const tips: string[] = [];

  if (accessHours.closedAtNight) {
    reasoning.push("Access appears closed around sunset or before late evening.");
    return {
      status: "not_recommended",
      label: "Not recommended after dark",
      reasoning,
      tips: ["Verify park hours before heading out."],
    };
  }

  let score = 0;
  if (lightingPercent != null && lightingPercent >= 80) {
    score += 2;
    reasoning.push(`Lighting appears strong (${lightingPercent}% coverage).`);
  } else if (lightingPercent != null && lightingPercent >= 40) {
    score += 1;
    reasoning.push(`Lighting is partial (${lightingPercent}% coverage).`);
  } else if (lightingPercent != null && lightingPercent >= 10) {
    reasoning.push(`Lighting is limited (${lightingPercent}% coverage).`);
  } else if (lightingPercent === 0) {
    score -= 2;
    reasoning.push("No lit segments are reported.");
  } else {
    reasoning.push("Lighting coverage is unknown.");
  }

  if (accessHours.isUnknown) {
    score -= 1;
    reasoning.push("Access hours are unconfirmed.");
  } else {
    reasoning.push(accessHours.label.replace(/^Open /, "Open "));
  }

  if (surfaceCategory === "hard") {
    score += 1;
    reasoning.push("Hard surfaces can be easier to read under limited light.");
  } else if (surfaceCategory === "soft") {
    score -= 1;
    reasoning.push("Softer natural surfaces can be harder to read at night.");
  }

  if (hazardCount > 20) {
    score -= 1;
    reasoning.push(`Higher nearby hazard volume (${hazardCount} flagged points).`);
  } else if (hazardCount > 0) {
    reasoning.push(`${hazardCount} hazard points are flagged nearby.`);
  }

  if (waterPercent != null && waterPercent >= 70) {
    reasoning.push(`Water is frequently nearby (${waterPercent}%), reducing edge visibility in the dark.`);
  }

  const levels: NightReadinessOutput["status"][] = [
    "not_recommended",
    "limited",
    "good",
    "excellent",
  ];
  const toIndex = (status: NightReadinessOutput["status"]): number => levels.indexOf(status);
  const fromIndex = (idx: number): NightReadinessOutput["status"] =>
    levels[Math.max(0, Math.min(levels.length - 1, idx))];

  let status: NightReadinessOutput["status"] =
    score >= 3 ? "excellent" : score >= 1 ? "good" : score >= 0 ? "limited" : "not_recommended";

  if (lightingConfidence === "none") {
    status = fromIndex(toIndex(status) - 1);
    reasoning.push("Lighting confidence is low due to missing samples.");
  } else if (lightingConfidence === "low") {
    status = fromIndex(toIndex(status) - 1);
    reasoning.push("Lighting confidence is limited (small sample size).");
  }

  if (hazardCount > 20) {
    status = fromIndex(toIndex(status) - 1);
  }

  if (lightingPercent != null && lightingPercent < 50) {
    tips.push("Bring a headlamp for darker stretches.");
  }
  if (waterPercent != null && waterPercent >= 70) {
    tips.push("Watch footing near water edges.");
  }
  if (accessHours.closesBefore21) {
    tips.push("Verify closing times before heading out.");
  }

  const labelMap: Record<NightReadinessOutput["status"], string> = {
    excellent: "Excellent for evening walks",
    good: "Good for evening walks",
    limited: "Limited after dark",
    not_recommended: "Not recommended after dark",
  };

  return {
    status,
    label: labelMap[status],
    reasoning: reasoning.slice(0, 4),
    tips: tips.slice(0, 2),
  };
}

function badgeStyle(status: NightReadinessOutput["status"]) {
  if (status === "excellent") return { bg: "#dcfce7", border: "#86efac", text: "#166534" };
  if (status === "good") return { bg: "#ecfeff", border: "#a5f3fc", text: "#155e75" };
  if (status === "limited") return { bg: "#fffbeb", border: "#fde68a", text: "#92400e" };
  return { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" };
}

export function AfterDarkSection(props: AfterDarkSectionProps) {
  const lighting = normalizeLighting(props);
  const hours = summarizeAccessHours(props.accessRules);
  const surface = summarizeSurface(props.surfaceSummary, props.surfaceBreakdown);
  const hazards = summarizeHazards(props.hazardPoints);
  const waterPercent = normalizePercent(props.waterNearPercent);
  const readiness = computeNightReadiness({
    lightingPercent: lighting.lightingPercent,
    lightingConfidence: lighting.confidence,
    accessHours: hours,
    surfaceCategory: surface.category,
    waterPercent,
    hazardCount: hazards.total,
  });

  if (hazards.bikeConflictCount > 0 && readiness.tips.length < 2) {
    readiness.tips.push("Stay alert for cyclists after dark.");
  }
  if (readiness.status !== "excellent" && readiness.tips.length === 0) {
    readiness.tips.push("Carry a light and reflective gear for better visibility.");
  }

  const badge = badgeStyle(readiness.status);
  const explanation = readiness.reasoning.slice(0, 3).join(" ");
  const lightingChip = lighting.lightingPercent == null ? "Lighting unknown" : `Lighting ${lighting.lightingPercent}%`;
  const hazardChip = `${hazards.total} hazard flags`;

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <div style={S.titleWrap}>
          <Moon size={18} style={{ color: "#6366f1", flexShrink: 0 }} />
          <h2 style={S.title}>After Dark</h2>
        </div>
        <span style={{ ...S.badge, background: badge.bg, borderColor: badge.border, color: badge.text }}>
          {readiness.label}
        </span>
      </div>

      <div style={S.chipsRow}>
        <span style={S.chip}>{lightingChip}</span>
        <span style={S.chip}>{hours.label}</span>
        <span style={S.chip}>{surface.label}</span>
        <span style={S.chip}>{hazardChip}</span>
      </div>

      <p style={S.explainer}>{explanation}</p>

      {readiness.tips.length > 0 ? (
        <div style={S.tipsRow}>
          {readiness.tips.map((tip) => (
            <span key={tip} style={S.tip}>
              <AlertTriangle size={12} style={{ flexShrink: 0 }} />
              {tip}
            </span>
          ))}
          {props.swimLikely === true && (waterPercent ?? 0) > 0 && readiness.tips.length < 2 ? (
            <span style={S.tip}>
              <Waves size={12} style={{ flexShrink: 0 }} />
              Extra caution near water at night.
            </span>
          ) : null}
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
    flexWrap: "wrap" as const,
  } as const,
  titleWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
  } as const,
  title: { margin: 0, fontSize: "1.1rem", color: "#111827" } as const,
  badge: {
    border: "1px solid",
    borderRadius: "9999px",
    padding: "0.18rem 0.5rem",
    fontSize: "0.74rem",
    fontWeight: 700,
    whiteSpace: "nowrap" as const,
  } as const,
  chipsRow: {
    marginTop: "0.35rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
  } as const,
  chip: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.55rem",
    padding: "0.18rem 0.45rem",
    fontSize: "0.75rem",
    color: "#374151",
    background: "#fff",
    whiteSpace: "nowrap" as const,
  } as const,
  explainer: {
    margin: "0.35rem 0 0",
    fontSize: "0.8rem",
    lineHeight: 1.45,
    color: "#374151",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  } as const,
  tipsRow: {
    marginTop: "0.3rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
  } as const,
  tip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    border: "1px solid #fcd34d",
    background: "#fffbeb",
    color: "#92400e",
    borderRadius: "0.5rem",
    padding: "0.18rem 0.4rem",
    fontSize: "0.73rem",
    lineHeight: 1.25,
  } as const,
} as const;
