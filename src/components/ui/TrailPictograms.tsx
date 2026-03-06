import type { ReactNode } from "react";
import {
  Mountain,
  Sun,
  TreePine,
  Droplets,
  Footprints,
  Route,
  Users,
  CloudRain,
  Lamp,
  Snowflake,
  Flag,
  Car,
  Navigation,
  Package,
  PawPrint,
  AlertTriangle,
  HeartPulse,
  Bone,
  ShieldCheck,
} from "lucide-react";

export type Tone = "good" | "warn" | "bad" | "neutral";

const toneBg: Record<Tone, string> = {
  good:    "#dcfce7", // green-100
  warn:    "#fef3c7", // amber-100
  bad:     "#fee2e2", // red-100
  neutral: "#f1f5f9", // slate-100
};
const toneValue: Record<Tone, string> = {
  good:    "#15803d", // green-700
  warn:    "#d97706", // amber-600
  bad:     "#dc2626", // red-600
  neutral: "#0f172a", // slate-900
};

const pillStyle: React.CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid #e2e8f0",
  backgroundColor: "#f8fafc",
  padding: "0.5rem 0.75rem",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  minHeight: "2.5rem",
};

const iconBadgeStyle = (tone: Tone): React.CSSProperties => ({
  width: "1.75rem",
  height: "1.75rem",
  borderRadius: "50%",
  backgroundColor: toneBg[tone],
  color: toneValue[tone],
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#64748b",
  flex: 1,
  minWidth: 0,
};
const valueStyle = (tone: Tone): React.CSSProperties => ({
  fontSize: "0.875rem",
  fontWeight: 600,
  color: toneValue[tone],
  flexShrink: 0,
});
const hintStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  color: "#94a3b8",
  marginTop: "0.125rem",
};

export type MetricPillProps = {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: Tone;
  hint?: string;
};

export function MetricPill({
  icon,
  label,
  value,
  tone = "neutral",
  hint,
}: MetricPillProps) {
  return (
    <div style={pillStyle} role="listitem" aria-label={`${label}: ${value}`}>
      <div style={iconBadgeStyle(tone)} aria-hidden>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={labelStyle} aria-hidden>
          {label}
        </div>
        <div style={valueStyle(tone)}>{value}</div>
        {hint ? <div style={hintStyle}>{hint}</div> : null}
      </div>
    </div>
  );
}

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, 1fr)",
  gap: "0.75rem",
  marginTop: "0.75rem",
};

const gridStyleWide: React.CSSProperties = {
  ...gridStyle,
  // gridTemplateColumns stays at repeat(2, 1fr) on mobile;
  // the .metric-grid--wide CSS class bumps to 3 columns at >= 1024px
};

export type MetricGridProps = {
  items: Array<Omit<MetricPillProps, "icon"> & { icon: ReactNode }>;
  wide?: boolean;
};

export function MetricGrid({ items, wide }: MetricGridProps) {
  return (
    <div
      className={wide ? "metric-grid metric-grid--wide" : "metric-grid"}
      style={wide ? gridStyleWide : gridStyle}
      role="list"
    >
      {items.map((item, i) => (
        <MetricPill key={i} {...item} />
      ))}
    </div>
  );
}

const meterWrapStyle: React.CSSProperties = {
  marginTop: "0.5rem",
};
const meterRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.5rem",
  fontSize: "0.8125rem",
};
const meterBarWrapStyle: React.CSSProperties = {
  height: "4px",
  borderRadius: "9999px",
  backgroundColor: "#e2e8f0",
  overflow: "hidden",
  marginTop: "0.25rem",
};
const meterBarStyle = (pct: number, tone: Tone): React.CSSProperties => ({
  height: "100%",
  width: `${Math.min(100, Math.max(0, pct))}%`,
  borderRadius: "9999px",
  backgroundColor: toneValue[tone],
});

export type MiniMeterProps = {
  label: string;
  icon: ReactNode;
  valueLabel: string;
  pct: number;
  tone?: Tone;
};

export function MiniMeter({
  label,
  icon,
  valueLabel,
  pct,
  tone = "neutral",
}: MiniMeterProps) {
  return (
    <div style={meterWrapStyle}>
      <div style={meterRowStyle}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#64748b" }}>
          <span style={{ color: toneValue[tone] }} aria-hidden>
            {icon}
          </span>
          <span>{label}</span>
        </span>
        <span style={{ fontWeight: 600, color: toneValue[tone], fontSize: "0.8125rem" }}>
          {valueLabel}
        </span>
      </div>
      <div style={meterBarWrapStyle}>
        <div style={meterBarStyle(pct, tone)} aria-hidden />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DogScoreBar — progress bar with repeating paw-print SVG texture as fill
// ---------------------------------------------------------------------------

/**
 * Inline SVG paw print encoded for use as a CSS background-image data URI.
 * Single paw at 12×12, semi-transparent white so the green base shows through.
 */
const PAW_DATA_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cellipse cx='6.5' cy='3.5' rx='1.8' ry='2.2' fill='rgba(255,255,255,0.35)'/%3E%3Cellipse cx='11' cy='2.3' rx='1.8' ry='2.2' fill='rgba(255,255,255,0.35)'/%3E%3Cellipse cx='15.5' cy='3.5' rx='1.8' ry='2.2' fill='rgba(255,255,255,0.35)'/%3E%3Cellipse cx='19' cy='7' rx='1.8' ry='2.2' fill='rgba(255,255,255,0.35)'/%3E%3Cpath d='M12 8c-3.5 0-7 2.5-7 6.5 0 2.5 1.5 5 4 5.5.8.2 2 .5 3 .5s2.2-.3 3-.5c2.5-.5 4-3 4-5.5C19 10.5 15.5 8 12 8z' fill='rgba(255,255,255,0.35)'/%3E%3C/svg%3E")`;

export type DogScoreBarProps = {
  label: string;
  emoji?: string;
  score: number | null; // 0–1
  valueLabel: string;
  explanation?: string;
};

export function DogScoreBar({ label, emoji, score, valueLabel, explanation }: DogScoreBarProps) {
  const pct = score != null ? Math.round(score * 100) : 0;
  const hasScore = score != null;

  return (
    <div style={{ marginTop: "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
        <strong style={{ color: "#111827", fontSize: "0.9375rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          {emoji && <span aria-hidden>{emoji}</span>}
          {label}
        </strong>
        <span style={{
          color: "#fff",
          fontWeight: 700,
          fontSize: "0.78rem",
          backgroundColor: "#16a34a",
          padding: "0.15rem 0.55rem",
          borderRadius: "9999px",
          flexShrink: 0,
        }}>
          {valueLabel}
        </span>
      </div>

      {/* Bar track */}
      <div style={{
        marginTop: "0.4rem",
        height: "0.625rem",
        width: "100%",
        overflow: "hidden",
        borderRadius: "9999px",
        backgroundColor: "#e5e7eb",
        position: "relative",
      }}>
        {hasScore && (
          <div
            aria-hidden
            style={{
              height: "100%",
              width: `${pct}%`,
              borderRadius: "9999px",
              backgroundColor: "#16a34a",
              backgroundImage: PAW_DATA_URI,
              backgroundRepeat: "repeat-x",
              backgroundSize: "12px 12px",
              backgroundPosition: "center",
              transition: "width 0.3s ease",
            }}
          />
        )}
      </div>

      {explanation ? (
        <p style={{ marginTop: "0.3rem", color: "#374151", fontSize: "0.84rem", lineHeight: 1.45 }}>
          {explanation}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trail icon set
// ---------------------------------------------------------------------------

const ICON_SIZE = 16;

/** Distance icon: route/path — represents trail length/distance */
export function DistanceIcon({ size = ICON_SIZE }: { size?: number }) {
  return <Route size={size} aria-hidden />;
}

/** Leash icon: collar ring + curved leash line + handle — reads clearly as "leash policy" */
export function LeashIcon({ size = ICON_SIZE }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="7" cy="13" r="2.5" />
      <path d="M9.5 13 Q14 10 18 8 Q20 7 21 6" />
      <circle cx="21" cy="6" r="1.8" />
    </svg>
  );
}

export const TrailIcons = {
  effort:     <Mountain size={ICON_SIZE} aria-hidden />,
  heat:       <Sun size={ICON_SIZE} aria-hidden />,
  shade:      <TreePine size={ICON_SIZE} aria-hidden />,
  water:      <Droplets size={ICON_SIZE} aria-hidden />,
  surface:    <Footprints size={ICON_SIZE} aria-hidden />,
  distance:   <DistanceIcon size={ICON_SIZE} />,
  crowd:      <Users size={ICON_SIZE} aria-hidden />,
  mud:        <CloudRain size={ICON_SIZE} aria-hidden />,
  lighting:   <Lamp size={ICON_SIZE} aria-hidden />,
  winter:     <Snowflake size={ICON_SIZE} aria-hidden />,
  trailheads: <Flag size={ICON_SIZE} aria-hidden />,
  parking:    <Car size={ICON_SIZE} aria-hidden />,
  bestEntry:  <Navigation size={ICON_SIZE} aria-hidden />,
  amenities:  <Package size={ICON_SIZE} aria-hidden />,
  dogs:       <PawPrint size={ICON_SIZE} aria-hidden />,
  leash:      <LeashIcon size={ICON_SIZE} />,
  hazards:    <AlertTriangle size={ICON_SIZE} aria-hidden />,
  emergency:  <HeartPulse size={ICON_SIZE} aria-hidden />,
  bone:       <Bone size={ICON_SIZE} aria-hidden />,
  shield:     <ShieldCheck size={ICON_SIZE} aria-hidden />,
} as const;
