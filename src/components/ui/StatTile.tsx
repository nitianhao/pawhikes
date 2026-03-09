import type { CSSProperties } from "react";
import { space, radius, shadow, type as t, color, toneColors, type Tone } from "@/design/tokens";

export type StatTileProps = {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
};

export function StatTile({ label, value, note, tone = "neutral" }: StatTileProps) {
  const tc = toneColors(tone);

  const tileStyle: CSSProperties = {
    backgroundColor: tc.bg,
    border: `1px solid ${tc.border}`,
    borderRadius: radius.md,
    boxShadow: shadow.subtle,
    padding: `${space[3]} ${space[4]}`,
    display: "flex",
    flexDirection: "column",
    gap: space[1],
    minWidth: 0,
  };

  const labelStyle: CSSProperties = {
    ...t.subLabel,
    color: color.textMuted,
  };

  const valueStyle: CSSProperties = {
    fontWeight: 700,
    lineHeight: 1.15,
    letterSpacing: "-0.02em",
    color: tc.text,
  };

  const noteStyle: CSSProperties = {
    ...t.meta,
    color: color.textSecondary,
  };

  return (
    <div style={tileStyle} className="stat-tile">
      <span style={labelStyle}>{label}</span>
      <span className="stat-tile__value" style={valueStyle}>{value}</span>
      {note ? <span style={noteStyle}>{note}</span> : null}
    </div>
  );
}
