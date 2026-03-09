import type { CSSProperties, ReactNode } from "react";
import { space, type as t, color } from "@/design/tokens";

export type LegendItem = {
  label: string;
  color: string;
};

export type ChartFrameProps = {
  title: string;
  subtitle?: string;
  legend?: LegendItem[];
  children: ReactNode;
};

const frameStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space[3],
};

const headerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space[1],
};

const titleStyle: CSSProperties = {
  ...t.subLabel,
  color: color.textMuted,
  margin: 0,
};

const subtitleStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  margin: 0,
};

const chartBodyStyle: CSSProperties = {
  width: "100%",
};

const legendStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: `${space[1]} ${space[4]}`,
};

const legendItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: space[2],
  ...t.meta,
  color: color.textSecondary,
};

const legendSwatchStyle = (swatchColor: string): CSSProperties => ({
  width: "10px",
  height: "10px",
  borderRadius: "2px",
  backgroundColor: swatchColor,
  flexShrink: 0,
});

export function ChartFrame({ title, subtitle, legend, children }: ChartFrameProps) {
  return (
    <div style={frameStyle}>
      <div style={headerStyle}>
        <p style={titleStyle}>{title}</p>
        {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      </div>
      <div style={chartBodyStyle}>{children}</div>
      {legend && legend.length > 0 ? (
        <div style={legendStyle}>
          {legend.map((item) => (
            <span key={item.label} style={legendItemStyle}>
              <span style={legendSwatchStyle(item.color)} aria-hidden="true" />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
