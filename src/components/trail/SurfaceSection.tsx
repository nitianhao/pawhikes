import { SurfaceProfileChart, type SurfaceProfilePoint } from "./SurfaceProfileChart";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Footprints, HelpCircle, Leaf, Mountain, Route } from "lucide-react";

type SurfaceMap = Record<string, number>;

type SurfaceEntry = {
  key: string;
  label: string;
  pctRaw: number;
  pctNormalized: number;
  pctDisplay: string;
  category: "hard" | "mixed_natural" | "soft" | "slippery" | "unknown";
  tag: "hard" | "grippy" | "soft-ish" | "slick" | "varies";
};

const LABEL_OVERRIDES: Record<string, string> = {
  "crushed stone": "Crushed stone",
  "fine gravel": "Fine gravel",
  "boards wood": "Boardwalk (wood)",
  "hard other": "Hard surface (other)",
  unknown: "Not mapped",
};

const CATEGORY_LOOKUP: Record<string, SurfaceEntry["category"]> = {
  asphalt: "hard",
  concrete: "hard",
  paved: "hard",
  "hard other": "hard",
  "hard surface (other)": "hard",
  "crushed stone": "mixed_natural",
  gravel: "mixed_natural",
  "fine gravel": "mixed_natural",
  compacted: "mixed_natural",
  unpaved: "mixed_natural",
  dirt: "soft",
  grass: "soft",
  sand: "soft",
  woodchips: "soft",
  "boards wood": "slippery",
  "boardwalk (wood)": "slippery",
  cobblestone: "slippery",
  unknown: "unknown",
};

const CATEGORY_TAG: Record<SurfaceEntry["category"], SurfaceEntry["tag"]> = {
  hard: "hard",
  mixed_natural: "grippy",
  soft: "soft-ish",
  slippery: "slick",
  unknown: "varies",
};

const CATEGORY_BAR_COLOR: Record<SurfaceEntry["category"], string> = {
  hard: "#64748b",
  mixed_natural: "#78716c",
  soft: "#10b981",
  slippery: "#f59e0b",
  unknown: "#cbd5e1",
};

const CATEGORY_BADGE_BG: Record<SurfaceEntry["category"], string> = {
  hard: "#f1f5f9",
  mixed_natural: "#f5f5f4",
  soft: "#ecfdf5",
  slippery: "#fffbeb",
  unknown: "#f1f5f9",
};

const CATEGORY_BADGE_BORDER: Record<SurfaceEntry["category"], string> = {
  hard: "#cbd5e1",
  mixed_natural: "#d6d3d1",
  soft: "#a7f3d0",
  slippery: "#fde68a",
  unknown: "#cbd5e1",
};

const CATEGORY_BADGE_TEXT: Record<SurfaceEntry["category"], string> = {
  hard: "#334155",
  mixed_natural: "#44403c",
  soft: "#065f46",
  slippery: "#92400e",
  unknown: "#475569",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function normalizeSurfaceKey(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "unknown";
  if (cleaned === "hard other" || cleaned === "hardother") return "hard other";
  if (cleaned === "boards wood" || cleaned === "wood boards" || cleaned === "boardwalk wood") {
    return "boards wood";
  }
  if (cleaned === "fine gravel" || cleaned === "finegravel") return "fine gravel";
  if (cleaned === "crushed stone" || cleaned === "crushedstone") return "crushed stone";
  return cleaned;
}

function toPercent(value: number): number {
  const pct = value <= 1 ? value * 100 : value;
  return Math.max(0, pct);
}

function formatPercent(pct: number): string {
  if (pct < 10) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

function toSurfaceMap(value: unknown): SurfaceMap {
  const rec = asRecord(value) ?? {};
  const out: SurfaceMap = {};
  for (const [k, v] of Object.entries(rec)) {
    const n = asNumber(v);
    if (n == null) continue;
    const key = normalizeSurfaceKey(k);
    const pct = toPercent(n);
    if (pct <= 0) continue;
    out[key] = Math.max(out[key] ?? 0, pct);
  }
  return out;
}

function mergeBreakdowns(summaryDistribution: SurfaceMap, breakdown: SurfaceMap): SurfaceMap {
  const merged: SurfaceMap = { ...summaryDistribution };
  for (const [k, v] of Object.entries(breakdown)) {
    merged[k] = Math.max(merged[k] ?? 0, v);
  }
  return merged;
}

function getLabel(key: string): string {
  const known = LABEL_OVERRIDES[key];
  if (known) return known;
  return key
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function getCategory(key: string): SurfaceEntry["category"] {
  return CATEGORY_LOOKUP[key] ?? "mixed_natural";
}

function createEntries(map: SurfaceMap): SurfaceEntry[] {
  const raw = Object.entries(map);
  const total = raw.reduce((sum, [, pctRaw]) => sum + Math.max(0, pctRaw), 0);
  return raw
    .map(([key, pctRaw]) => {
      const category = getCategory(key);
      const pctNormalized = total > 0 ? (pctRaw / total) * 100 : 0;
      return {
        key,
        label: getLabel(key),
        pctRaw,
        pctNormalized,
        pctDisplay: formatPercent(pctNormalized),
        category,
        tag: CATEGORY_TAG[category],
      };
    })
    .sort((a, b) => b.pctNormalized - a.pctNormalized);
}

function getSummaryText(entries: SurfaceEntry[]): { interpretation: string; whatThisMeans: string; bestFor: string } {
  const primary = entries[0];
  const second = entries[1];
  const third = entries[2];
  const byCategory = entries.reduce<Record<SurfaceEntry["category"], number>>(
    (acc, entry) => {
      acc[entry.category] += entry.pctNormalized;
      return acc;
    },
    { hard: 0, mixed_natural: 0, soft: 0, slippery: 0, unknown: 0 }
  );

  let interpretation = "Surface conditions vary across the route.";
  if (primary?.category === "hard") interpretation = "Firm, consistent footing with less natural cushioning.";
  if (primary?.category === "mixed_natural") interpretation = "Good grip and generally paw-friendly on most stretches.";
  if (primary?.category === "soft") interpretation = "Softer footing that can feel easier on paws and joints.";
  if (primary?.category === "slippery") interpretation = "Watch footing on wood/stone sections, especially after rain.";
  if (primary?.category === "unknown") interpretation = "Surface data is limited, so expect changing conditions.";

  const lines: string[] = [];
  lines.push(`This trail is mostly ${primary?.label ?? "mixed surfaces"}.`);
  if (second && second.pctNormalized >= 10) {
    lines.push(`A notable share is ${second.label.toLowerCase()} (${second.pctDisplay}).`);
  }
  if (third && third.pctNormalized >= 10) {
    lines.push(`You will also encounter ${third.label.toLowerCase()} (${third.pctDisplay}).`);
  }
  if (byCategory.unknown >= 15) {
    lines.push("Surface data is incomplete for some sections—expect variety.");
  }
  if (byCategory.hard >= 40) {
    lines.push("Expect harder footing\u2014paws may heat up in summer.");
  }
  if (byCategory.mixed_natural >= 40) {
    lines.push("Generally paw-friendly with decent grip.");
  }
  if (byCategory.slippery >= 10) {
    lines.push("Boardwalk/wood sections can be slick after rain.");
  }
  if (byCategory.soft >= 40) {
    lines.push("Softer footing\u2014can get muddy after rain.");
  }

  let bestFor = "dogs, runners, casual hikes";
  const dominantCategory = (Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "mixed_natural") as SurfaceEntry["category"];
  if (dominantCategory === "hard") {
    bestFor = "strollers, road bikes, quick walks";
  } else if (dominantCategory === "soft") {
    bestFor = "relaxed walks, expect mud after rain";
  }

  return {
    interpretation,
    whatThisMeans: lines.slice(0, 3).join(" "),
    bestFor,
  };
}

function iconForCategory(category: SurfaceEntry["category"]): LucideIcon {
  if (category === "mixed_natural") return Mountain;
  if (category === "hard") return Route;
  if (category === "soft" || category === "slippery") return Leaf;
  return HelpCircle;
}

function heroBadges(entries: SurfaceEntry[]): string[] {
  const totals = entries.reduce<Record<SurfaceEntry["category"], number>>(
    (acc, entry) => {
      acc[entry.category] += entry.pctNormalized;
      return acc;
    },
    { hard: 0, mixed_natural: 0, soft: 0, slippery: 0, unknown: 0 }
  );
  const badges: string[] = [];
  if (totals.mixed_natural >= 40) badges.push("Paw-friendly");
  if (totals.hard >= 40) badges.push("Hard surface risk");
  if (totals.slippery >= 10 && badges.length < 2) badges.push("Can get slick");
  if (badges.length === 0 && totals.soft >= 40) badges.push("Soft footing");
  return badges.slice(0, 2);
}

type RoughnessStatus = "low" | "medium" | "high" | "unknown";

function normalizeRoughness({
  roughnessRisk,
  roughnessRiskScore,
}: {
  roughnessRisk?: string | null;
  roughnessRiskScore?: number | null;
}): { status: RoughnessStatus; percent: number | null } {
  let percent: number | null = null;
  const score = typeof roughnessRiskScore === "number" && Number.isFinite(roughnessRiskScore)
    ? roughnessRiskScore
    : null;
  if (score != null) {
    percent = score <= 1 ? Math.round(Math.max(0, Math.min(100, score * 100))) : Math.round(Math.max(0, Math.min(100, score)));
  }

  const riskStr = typeof roughnessRisk === "string" ? roughnessRisk.trim().toLowerCase() : "";
  let status: RoughnessStatus = "unknown";
  if (riskStr === "low" || riskStr === "medium" || riskStr === "high") {
    status = riskStr as RoughnessStatus;
  } else if (percent != null) {
    if (percent >= 70) status = "high";
    else if (percent >= 35) status = "medium";
    else status = "low";
  }

  return { status, percent };
}

function roughnessPillLabel(status: RoughnessStatus): { icon: "footprints" | "alert"; text: string } {
  switch (status) {
    case "low":
      return { icon: "footprints", text: "Smooth / Paw-friendly" };
    case "medium":
      return { icon: "footprints", text: "Some rough stretches" };
    case "high":
      return { icon: "alert", text: "Rough / Paw caution" };
    default:
      return { icon: "footprints", text: "Roughness unknown" };
  }
}

function roughnessChipLabel(status: RoughnessStatus): string {
  if (status === "unknown") return "Roughness: Unknown";
  return `Roughness: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
}

function roughnessSummarySuffix(status: RoughnessStatus): string | null {
  switch (status) {
    case "high":
      return "Expect uneven or coarse sections that may be tough on sensitive paws.";
    case "medium":
      return "Some uneven stretches may require attention.";
    case "low":
      return "Generally comfortable for most dogs.";
    default:
      return null;
  }
}

type SurfaceSectionProps = {
  surfaceSummary: any;
  surfaceBreakdown: any;
  roughnessRisk?: string | null;
  roughnessRiskScore?: number | null;
  roughnessRiskKnownSamples?: number | null;
  surfaceProfilePoints?: SurfaceProfilePoint[] | null;
  lengthMilesTotal?: number | null;
};

const SECTION_BORDER = {
  default: "#e5e7eb",
  low: "#a7f3d0",
  high: "#fcd34d",
} as const;

const S = {
  section: (roughnessHigh: boolean, roughnessLow: boolean) => ({
    marginTop: "1.25rem",
    border: `1px solid ${roughnessHigh ? SECTION_BORDER.high : roughnessLow ? SECTION_BORDER.low : SECTION_BORDER.default}`,
    borderRadius: "0.75rem",
    padding: "0.9rem",
  }) as const,
  title: { margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#111827" } as const,
  subtitle: { margin: 0, fontSize: "0.85rem", color: "#6b7280" } as const,
  heroCard: {
    marginTop: "0.65rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.6rem",
    background: "#f9fafb",
    padding: "0.6rem 0.75rem",
  } as const,
  iconBadge: (cat: SurfaceEntry["category"]) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "2rem",
    height: "2rem",
    flexShrink: 0,
    borderRadius: "50%",
    border: `1px solid ${CATEGORY_BADGE_BORDER[cat]}`,
    background: CATEGORY_BADGE_BG[cat],
    color: CATEGORY_BADGE_TEXT[cat],
  }) as const,
  heroText: {
    flex: 1,
    minWidth: 0,
  } as const,
  heroLabel: {
    margin: 0,
    fontSize: "1rem",
    fontWeight: 600,
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as const,
  heroHelper: {
    margin: "0.15rem 0 0",
    fontSize: "0.82rem",
    color: "#6b7280",
  } as const,
  pillRow: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
    flexShrink: 0,
  } as const,
  pill: (cat: SurfaceEntry["category"]) => ({
    display: "inline-block",
    borderRadius: "9999px",
    border: `1px solid ${CATEGORY_BADGE_BORDER[cat]}`,
    background: CATEGORY_BADGE_BG[cat],
    color: CATEGORY_BADGE_TEXT[cat],
    padding: "0.15rem 0.5rem",
    fontSize: "0.72rem",
    fontWeight: 600,
  }) as const,
  pillNeutral: {
    display: "inline-block",
    borderRadius: "9999px",
    border: "1px solid #cbd5e1",
    background: "white",
    color: "#334155",
    padding: "0.15rem 0.5rem",
    fontSize: "0.72rem",
    fontWeight: 600,
  } as const,
  pillRoughnessNeutral: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "9999px",
    border: "1px solid #a7f3d0",
    background: "#ecfdf5",
    color: "#065f46",
    padding: "0.15rem 0.5rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  } as const,
  pillRoughnessHigh: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "9999px",
    border: "1px solid #fcd34d",
    background: "#fffbeb",
    color: "#92400e",
    padding: "0.15rem 0.5rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  } as const,
  barOuter: {
    marginTop: "0.55rem",
    height: "10px",
    width: "100%",
    borderRadius: "9999px",
    overflow: "hidden",
    background: "#e5e7eb",
    display: "flex",
  } as const,
  barSeg: (cat: SurfaceEntry["category"], pct: number) => ({
    height: "100%",
    background: CATEGORY_BAR_COLOR[cat],
    width: `${pct}%`,
    minWidth: "2px",
    borderRight: "1px solid rgba(255,255,255,0.5)",
  }) as const,
  grid: {
    marginTop: "0.65rem",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
    gap: "0.45rem",
  } as const,
  chip: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.55rem",
    background: "white",
    padding: "0.35rem 0.5rem",
  } as const,
  chipIconWrap: (cat: SurfaceEntry["category"]) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.4rem",
    height: "1.4rem",
    flexShrink: 0,
    borderRadius: "50%",
    border: `1px solid ${CATEGORY_BADGE_BORDER[cat]}`,
    background: CATEGORY_BADGE_BG[cat],
    color: CATEGORY_BADGE_TEXT[cat],
  }) as const,
  chipIconWrapRoughness: (status: RoughnessStatus) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.4rem",
    height: "1.4rem",
    flexShrink: 0,
    borderRadius: "50%",
    border: status === "high" ? "1px solid #fcd34d" : "1px solid #a7f3d0",
    background: status === "high" ? "#fffbeb" : "#ecfdf5",
    color: status === "high" ? "#92400e" : "#065f46",
  }) as const,
  chipLabel: {
    fontSize: "0.85rem",
    fontWeight: 500,
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
    minWidth: 0,
  } as const,
  chipPct: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#111827",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
  } as const,
  callout: {
    marginTop: "0.65rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.55rem",
    background: "#f9fafb",
    padding: "0.5rem 0.65rem",
  } as const,
  calloutText: {
    margin: 0,
    fontSize: "0.85rem",
    color: "#374151",
    lineHeight: 1.5,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  } as const,
  bestForRow: {
    marginTop: "0.35rem",
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: "0.35rem",
  } as const,
  bestForLabel: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#6b7280",
  } as const,
  compactWrap: {
    marginTop: "0.6rem",
    gap: "0.6rem",
  } as const,
  compactCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.55rem",
    background: "#fff",
    padding: "0.55rem 0.65rem",
  } as const,
  compactTitle: {
    margin: 0,
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase" as const,
    color: "#6b7280",
  } as const,
  mixList: {
    marginTop: "0.35rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.3rem",
  } as const,
  mixRow: {
    display: "grid",
    gridTemplateColumns: "minmax(90px, 1fr) minmax(120px, 2fr) auto",
    alignItems: "center",
    gap: "0.35rem",
  } as const,
  mixLabel: {
    fontSize: "0.78rem",
    color: "#1f2937",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
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
    fontVariantNumeric: "tabular-nums",
  } as const,
  compactBody: {
    marginTop: "0.32rem",
    fontSize: "0.8rem",
    lineHeight: 1.4,
    color: "#4b5563",
  } as const,
} as const;

export function SurfaceSection({
  surfaceSummary,
  surfaceBreakdown,
  roughnessRisk,
  roughnessRiskScore,
  roughnessRiskKnownSamples,
  surfaceProfilePoints,
  lengthMilesTotal,
}: SurfaceSectionProps) {
  const summaryObj = asRecord(surfaceSummary);
  const distribution = toSurfaceMap(summaryObj?.distribution);
  const breakdown = toSurfaceMap(surfaceBreakdown);
  const canonical =
    Object.keys(distribution).length > 0
      ? mergeBreakdowns(distribution, breakdown)
      : breakdown;
  const entries = createEntries(canonical);
  const summaryPrimaryKey =
    typeof summaryObj?.primary === "string" && summaryObj.primary.trim()
      ? normalizeSurfaceKey(summaryObj.primary)
      : null;
  const primary = summaryPrimaryKey
    ? entries.find((entry) => entry.key === summaryPrimaryKey) ?? entries[0]
    : entries[0];
  const topThree = entries.slice(0, 3);
  const copy = getSummaryText(entries);
  const badges = heroBadges(entries);
  const PrimaryIcon = iconForCategory(primary?.category ?? "unknown");
  const bestForItems = copy.bestFor.split(/[,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 3);

  const roughness = normalizeRoughness({ roughnessRisk, roughnessRiskScore });
  const roughnessPill = roughnessPillLabel(roughness.status);
  const whatThisMeansWithRoughness = roughnessSummarySuffix(roughness.status)
    ? `${copy.whatThisMeans} ${roughnessSummarySuffix(roughness.status)}`
    : copy.whatThisMeans;

  return (
    <section style={S.section(roughness.status === "high", roughness.status === "low")}>
      {/* Header row */}
      <div className="section-header-row">
        <h2 style={S.title}>Surface</h2>
        <p style={S.subtitle}>What your dog will walk on</p>
      </div>

      {/* Primary surface hero */}
      <div style={S.heroCard} className="surface-hero-card">
        <div className="surface-hero-inner">
          <div style={S.iconBadge(primary?.category ?? "unknown")}>
            <PrimaryIcon size={18} />
          </div>
          <div style={S.heroText}>
            <p style={S.heroLabel}>Mostly: {primary?.label ?? "Mixed"}</p>
            <p style={S.heroHelper}>{copy.interpretation}</p>
          </div>
          <div style={S.pillRow}>
            {badges.map((badge) => (
              <span key={badge} style={S.pillNeutral}>{badge}</span>
            ))}
            <span style={roughness.status === "high" ? S.pillRoughnessHigh : S.pillRoughnessNeutral}>
              {roughnessPill.icon === "alert" ? (
                <AlertTriangle size={12} style={{ flexShrink: 0, marginRight: "0.2rem" }} />
              ) : (
                <Footprints size={12} style={{ flexShrink: 0, marginRight: "0.2rem" }} />
              )}
              {roughnessPill.text}
            </span>
          </div>
        </div>
      </div>

      {/* Positional surface profile chart */}
      {surfaceProfilePoints && surfaceProfilePoints.length >= 2 && (
        <div style={{ marginTop: "0.65rem" }}>
          <div style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            color: "#6b7280",
            marginBottom: "0.35rem",
          }}>
            Surface along the trail
          </div>
          <SurfaceProfileChart points={surfaceProfilePoints} totalMiles={lengthMilesTotal} />
        </div>
      )}

      {/* Compact summary: top surfaces + quick read */}
      <div className="surface-compact-wrap" style={S.compactWrap}>
        <div style={S.compactCard} className="surface-compact-card">
          <p style={S.compactTitle}>Top surfaces</p>
          <div style={S.mixList}>
            {topThree.length === 0 ? (
              <div style={S.mixLabel}>No surface mix data available</div>
            ) : (
              topThree.map((entry) => (
                <div key={entry.key} style={S.mixRow}>
                  <span style={S.mixLabel}>{entry.label}</span>
                  <div style={S.mixBarTrack}>
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.max(3, entry.pctNormalized)}%`,
                        background: CATEGORY_BAR_COLOR[entry.category],
                      }}
                    />
                  </div>
                  <span style={S.mixPct}>{entry.pctDisplay}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={S.compactCard} className="surface-compact-card">
          <p style={S.compactTitle}>Quick read</p>
          <div style={{ marginTop: "0.32rem" }}>
            <span style={roughness.status === "high" ? S.pillRoughnessHigh : S.pillRoughnessNeutral}>
              {roughnessPill.icon === "alert" ? (
                <AlertTriangle size={12} style={{ flexShrink: 0, marginRight: "0.2rem" }} />
              ) : (
                <Footprints size={12} style={{ flexShrink: 0, marginRight: "0.2rem" }} />
              )}
              {roughnessChipLabel(roughness.status)}
            </span>
            <p style={S.compactBody}>{whatThisMeansWithRoughness}</p>
            <div style={S.bestForRow}>
              <span style={S.bestForLabel}>Best for</span>
              {bestForItems.map((item) => (
                <span key={item} style={S.pillNeutral}>{item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

    </section>
  );
}
