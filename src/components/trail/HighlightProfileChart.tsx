/**
 * HighlightProfileChart — compact swim-lane chart showing where trail
 * highlights (waterfalls, viewpoints, peaks, etc.) are located along the route.
 *
 * One row per highlight kind present on this trail.
 * Each dot is one occurrence; clicking shows name + distance along + distance off trail.
 *
 * No external library. All inline styles. Pure SVG + React state.
 */
"use client";

import { useState } from "react";

export type HighlightPoint = {
  d: number;
  kind: string;
  name: string | null;
  distM?: number | null; // meters from feature to nearest trail point
};

type Props = {
  points: HighlightPoint[];
  totalMiles?: number | null;
};

// ── kind metadata — emoji, label, color ───────────────────────────────────────
const KIND_META: Record<string, { emoji: string; label: string; color: string }> = {
  waterfall:     { emoji: "💦", label: "Waterfall",   color: "#0ea5e9" },
  viewpoint:     { emoji: "👁️", label: "Viewpoint",   color: "#7c3aed" },
  peak:          { emoji: "⛰️", label: "Peak",        color: "#92400e" },
  cliff:         { emoji: "🪨", label: "Cliff",       color: "#6b7280" },
  cave_entrance: { emoji: "🕳️", label: "Cave",        color: "#374151" },
  spring:        { emoji: "💧", label: "Spring",      color: "#0369a1" },
  hot_spring:    { emoji: "♨️", label: "Hot Spring",  color: "#dc2626" },
  attraction:    { emoji: "⭐", label: "Attraction",  color: "#d97706" },
  historic:      { emoji: "🏛️", label: "Historic",    color: "#6b7280" },
  ruins:         { emoji: "🏚️", label: "Ruins",       color: "#78716c" },
  arch:          { emoji: "🌉", label: "Arch",        color: "#b45309" },
  gorge:         { emoji: "🏔️", label: "Gorge",       color: "#57534e" },
  beach:         { emoji: "🏖️", label: "Beach",       color: "#f59e0b" },
  rock:          { emoji: "🪨", label: "Rock",        color: "#9ca3af" },
};

// Display priority order — most visually interesting first
const KIND_ORDER = [
  "waterfall",
  "viewpoint",
  "peak",
  "cliff",
  "cave_entrance",
  "gorge",
  "arch",
  "spring",
  "hot_spring",
  "beach",
  "attraction",
  "historic",
  "ruins",
  "rock",
];

function getMeta(kind: string) {
  return KIND_META[kind] ?? { emoji: "📍", label: kind, color: "#6b7280" };
}

function formatMi(v: number): string {
  if (v === 0) return "0 mi";
  return v % 1 === 0 ? `${v} mi` : `${v.toFixed(1)} mi`;
}

/** Format meters as feet (under 1000 ft) or miles, for distance-from-trail display. */
function formatOffTrail(distM: number): string {
  const ft = Math.round(distM * 3.28084);
  if (ft < 1000) return `${ft} ft from trail`;
  const mi = distM / 1609.344;
  return `${mi.toFixed(2)} mi from trail`;
}

// ── layout ────────────────────────────────────────────────────────────────────
const W         = 600;
const PAD_LEFT  = 88;   // emoji + label column
const PAD_RIGHT = 8;
const PAD_TOP   = 4;
const ROW_H     = 20;   // height per lane
const AXIS_H    = 16;
const CHART_W   = W - PAD_LEFT - PAD_RIGHT;
const DOT_R     = 4.5;
const HIT_R     = 10;   // invisible larger hit target for easier tapping

function toSvgX(d: number, maxD: number): number {
  return PAD_LEFT + (maxD > 0 ? Math.min(1, d / maxD) * CHART_W : 0);
}

/** Stable key for a point — used to track which dot is active. */
function ptKey(pt: HighlightPoint, i: number) {
  return `${pt.kind}:${pt.d}:${i}`;
}

export function HighlightProfileChart({ points, totalMiles }: Props) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activePt, setActivePt]   = useState<HighlightPoint | null>(null);

  if (!points || points.length === 0) return null;

  const maxD =
    totalMiles != null && Number.isFinite(totalMiles) && totalMiles > 0
      ? totalMiles
      : (points[points.length - 1]?.d ?? 0) + 0.5;

  // Ordered kinds present
  const kindsPresent = KIND_ORDER.filter(k => points.some(p => p.kind === k));
  const extraKinds   = [...new Set(points.map(p => p.kind))].filter(k => !KIND_ORDER.includes(k));
  const allKinds     = [...kindsPresent, ...extraKinds];

  if (allKinds.length === 0) return null;

  const SVG_H = PAD_TOP + allKinds.length * ROW_H + AXIS_H + 4;

  // Mile ticks
  const mileTicks: number[] = [];
  if (maxD > 1) {
    const step = Math.max(1, Math.ceil(Math.floor(maxD) / 5));
    for (let m = step; m < maxD; m += step) mileTicks.push(m);
  }

  const axisBaseY  = PAD_TOP + allKinds.length * ROW_H + 4;
  const axisLabelY = axisBaseY + 14;

  function handleDotClick(key: string, pt: HighlightPoint) {
    if (activeKey === key) {
      setActiveKey(null);
      setActivePt(null);
    } else {
      setActiveKey(key);
      setActivePt(pt);
    }
  }

  const activeMeta = activePt ? getMeta(activePt.kind) : null;

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${W} ${SVG_H}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label="Trail highlights profile chart"
      >
        {allKinds.map((kind, rowIdx) => {
          const meta        = getMeta(kind);
          const rowCy       = PAD_TOP + rowIdx * ROW_H + ROW_H / 2;
          const dotsForKind = points.filter(p => p.kind === kind);

          return (
            <g key={kind}>
              {/* Lane label */}
              <text
                x={PAD_LEFT - 6}
                y={rowCy + 4}
                textAnchor="end"
                fontSize="11"
                fill="#6b7280"
                fontFamily="inherit"
              >
                {meta.emoji} {meta.label}
              </text>

              {/* Track line */}
              <line
                x1={PAD_LEFT} y1={rowCy}
                x2={PAD_LEFT + CHART_W} y2={rowCy}
                stroke="#e5e7eb" strokeWidth="1.5"
              />

              {/* Dots */}
              {dotsForKind.map((pt, i) => {
                const cx  = toSvgX(pt.d, maxD);
                const key = ptKey(pt, i);
                const isActive = activeKey === key;
                const tooltip  = pt.name
                  ? `${pt.name} · ${pt.d.toFixed(1)} mi`
                  : `${meta.label} · ${pt.d.toFixed(1)} mi`;

                return (
                  <g
                    key={key}
                    onClick={() => handleDotClick(key, pt)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={tooltip}
                  >
                    {/* Larger invisible hit target for easy tapping */}
                    <circle cx={cx} cy={rowCy} r={HIT_R} fill="transparent" />

                    {/* Active selection ring */}
                    {isActive && (
                      <circle cx={cx} cy={rowCy} r={DOT_R + 5}
                        fill="none" stroke={meta.color} strokeWidth="1.5" opacity="0.5" />
                    )}

                    {/* Outer glow ring */}
                    <circle cx={cx} cy={rowCy} r={DOT_R + 2.5}
                      fill={meta.color} opacity={isActive ? "0.35" : "0.18"} />

                    {/* Main dot */}
                    <circle cx={cx} cy={rowCy} r={DOT_R}
                      fill={meta.color}
                      stroke={isActive ? "white" : "white"}
                      strokeWidth={isActive ? "2" : "1.5"}
                    />

                    <title>{tooltip}</title>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* X-axis line */}
        <line
          x1={PAD_LEFT} y1={axisBaseY}
          x2={PAD_LEFT + CHART_W} y2={axisBaseY}
          stroke="#d1d5db" strokeWidth="1"
        />

        {/* Start label */}
        <text x={PAD_LEFT} y={axisLabelY}
          textAnchor="start" fontSize="10" fill="#9ca3af" fontFamily="inherit">
          0 mi
        </text>
        {/* End label */}
        <text x={PAD_LEFT + CHART_W} y={axisLabelY}
          textAnchor="end" fontSize="10" fill="#9ca3af" fontFamily="inherit">
          {formatMi(maxD)}
        </text>

        {/* Intermediate ticks */}
        {mileTicks.map(m => {
          const x = toSvgX(m, maxD);
          return (
            <g key={m}>
              <line x1={x} y1={axisBaseY} x2={x} y2={axisBaseY + 4}
                stroke="#d1d5db" strokeWidth="1" />
              <text x={x} y={axisLabelY}
                textAnchor="middle" fontSize="9" fill="#d1d5db" fontFamily="inherit">
                {m}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Info strip — shown when a dot is selected */}
      {activePt && activeMeta && (
        <div style={{
          marginTop: "0.28rem",
          padding: "0.28rem 0.5rem",
          background: activeMeta.color + "12",
          border: `1px solid ${activeMeta.color}35`,
          borderRadius: "0.45rem",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap" as const,
          gap: "0.3rem 0.5rem",
          fontSize: "0.72rem",
          color: "#374151",
          lineHeight: 1.4,
        }}>
          <span style={{ fontSize: "0.9rem" }}>{activeMeta.emoji}</span>
          <span style={{ fontWeight: 600, color: "#111827" }}>
            {activePt.name ?? activeMeta.label}
          </span>
          <span style={{ color: "#d1d5db" }}>·</span>
          <span style={{ color: "#6b7280" }}>{activePt.d.toFixed(1)} mi along trail</span>
          {typeof activePt.distM === "number" && activePt.distM > 0 && (
            <>
              <span style={{ color: "#d1d5db" }}>·</span>
              <span style={{ color: "#6b7280" }}>{formatOffTrail(activePt.distM)}</span>
            </>
          )}
          {/* Dismiss button */}
          <button
            onClick={() => { setActiveKey(null); setActivePt(null); }}
            aria-label="Dismiss"
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "0 0.15rem",
              color: "#9ca3af",
              fontSize: "0.75rem",
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
