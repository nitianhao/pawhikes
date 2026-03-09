import type { CSSProperties } from "react";
import { space, radius, type as t, color } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { Callout } from "@/components/ui/Callout";
import { Chip } from "@/components/ui/Chip";
import { computeSuitability, type SuitabilityOutput, type VerdictLevel } from "@/lib/trails/suitabilityEngine";
import type { TrailSystemForPage } from "@/lib/data/trailSystem";

export type DogSuitabilitySummaryProps = {
  system: TrailSystemForPage | null;
};

// ── Verdict → Callout variant ────────────────────────────────────────────────

function verdictVariant(level: VerdictLevel): "info" | "caution" | "risk" {
  if (level === "excellent" || level === "good") return "info";
  if (level === "limited") return "risk";
  if (level === "unknown") return "info";
  return "caution"; // moderate
}

// ── Styles ────────────────────────────────────────────────────────────────────

const stackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space[4],
};

const rowLabelStyle: CSSProperties = {
  ...t.subLabel,
  color: color.textMuted,
  margin: 0,
  marginBottom: space[2],
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: space[2],
};

const warningItemStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "2px",
};

const warningLabelStyle: CSSProperties = {
  ...t.meta,
  fontWeight: 600,
  color: color.textPrimary,
  margin: 0,
};

const warningReasonStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  margin: 0,
};

const warningListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space[3],
  padding: `${space[3]} ${space[4]}`,
  backgroundColor: color.warn.bg,
  border: `1px solid ${color.warn.border}`,
  borderLeft: `3px solid ${color.warn.icon}`,
  borderRadius: radius.md,
};

const riskItemBorderStyle: CSSProperties = {
  borderLeftColor: color.risk.icon,
  backgroundColor: color.risk.bg,
  borderColor: color.risk.border,
};

const windowRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space[2],
};

const windowItemStyle: CSSProperties = {
  display: "flex",
  gap: space[2],
  alignItems: "baseline",
};

const windowLabelStyle: CSSProperties = {
  ...t.meta,
  fontWeight: 600,
  color: color.textPrimary,
  margin: 0,
  minWidth: 0,
};

const windowReasonStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  margin: 0,
};

const bulletListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: space[2],
};

const bulletItemStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  display: "flex",
  gap: space[2],
  alignItems: "baseline",
  margin: 0,
};

const bulletDotStyle: CSSProperties = {
  flexShrink: 0,
  width: "5px",
  height: "5px",
  borderRadius: "50%",
  backgroundColor: color.green500,
  marginTop: "5px",
};

const dividerStyle: CSSProperties = {
  borderTop: `1px solid ${color.borderSubtle}`,
  paddingTop: space[4],
};

// ── Component ─────────────────────────────────────────────────────────────────

export function DogSuitabilitySummary({ system }: DogSuitabilitySummaryProps) {
  const result: SuitabilityOutput = computeSuitability(system);

  // If no data at all — nothing useful to show
  if (!result.hasEnoughData && result.bestFor.length === 0 && result.avoidIf.length === 0) {
    return null;
  }

  const { verdict, bestFor, avoidIf, bestTimeWindows, comfortHighlights } = result;

  // Partition avoidIf by severity so we can style them distinctly
  const risks = avoidIf.filter((w) => w.severity === "risk");
  const cautions = avoidIf.filter((w) => w.severity === "caution");
  const allWarnings = [...risks, ...cautions];

  return (
    <Section
      id="suitability"
      title="Trail Suitability"
      subtitle="Who this trail works best for — and what to watch"
    >
      <div style={stackStyle}>
        {/* ── Overall verdict callout ── */}
        <Callout variant={verdictVariant(verdict.level)}>
          {verdict.headline}
        </Callout>

        {/* ── Best for ── */}
        {bestFor.length > 0 && (
          <div>
            <p style={rowLabelStyle}>Best for</p>
            <div style={chipRowStyle}>
              {bestFor.map((item) => (
                <Chip key={item.category} variant="status" tone="good">
                  {item.label}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* ── Use caution if ── */}
        {allWarnings.length > 0 && (
          <div>
            <p style={rowLabelStyle}>Use caution if</p>
            <div
              style={
                risks.length > 0
                  ? { ...warningListStyle, ...riskItemBorderStyle }
                  : warningListStyle
              }
            >
              {allWarnings.map((w, idx) => (
                <div key={idx} style={warningItemStyle}>
                  <p style={warningLabelStyle}>{w.label}</p>
                  <p style={warningReasonStyle}>{w.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Most comfortable when ── */}
        {bestTimeWindows.length > 0 && (
          <div style={dividerStyle}>
            <p style={rowLabelStyle}>Most comfortable when</p>
            <div style={windowRowStyle}>
              {bestTimeWindows.map((w, idx) => (
                <div key={idx} style={windowItemStyle}>
                  <p style={windowLabelStyle}>{w.label}</p>
                  <span style={windowReasonStyle}>— {w.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Why this trail works ── */}
        {comfortHighlights.length > 0 && (
          <div style={bestTimeWindows.length > 0 ? {} : dividerStyle}>
            <p style={rowLabelStyle}>Why this trail works</p>
            <ul style={bulletListStyle}>
              {comfortHighlights.map((h, idx) => (
                <li key={idx} style={bulletItemStyle}>
                  <span style={bulletDotStyle} aria-hidden="true" />
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
