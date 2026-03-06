/**
 * BailoutCoverageChart — compact swim-lane chart showing where trail
 * exits and dead-ends are spatially distributed along the route.
 *
 * Two lanes:
 *   1. 🚪 Exits   — entrances + intersections (actionable bailouts), solid dots
 *   2. 🔚 Dead ends — dead-end nodes, hollow gray dots (visually muted)
 *
 * Position is estimated via t = distToStart / (distToStart + distToEnd)
 * using the crow-flies anchor distances stored in each BailoutPointRaw.
 * This is approximate but sufficient for spatial clustering.
 *
 * Click any dot to see the info strip with per-anchor distances.
 * No external library. All inline styles. Pure SVG + React state.
 */
"use client";

import { useMemo, useState } from "react";
import type { BailoutPointRaw, BailoutSpot } from "@/lib/bailouts/bailouts.utils";
import {
  anchorLabel,
  formatDistanceShort,
  isActionableExit,
  isDeadEndOnly,
  normalizeBailoutPoints,
} from "@/lib/bailouts/bailouts.utils";

type Props = {
  points: BailoutPointRaw[];
  totalMiles?: number | null;
};

// ── layout ────────────────────────────────────────────────────────────────────
const W        = 600;
const PAD_LEFT = 90;    // emoji + label column
const PAD_RIGHT = 8;
const PAD_TOP  = 4;
const ROW_H    = 26;
const AXIS_H   = 20;
const CHART_W  = W - PAD_LEFT - PAD_RIGHT;
const HIT_R    = 12;    // invisible hit target (easier tapping on mobile)

// Dot radii by kind
const R_ENTRANCE     = 6;
const R_INTERSECTION = 5;
const R_DEAD_END     = 4;

// Colors
const COLOR_ENTRANCE     = "#059669"; // green-600
const COLOR_INTERSECTION = "#4f46e5"; // indigo-600
const COLOR_DEAD_END     = "#9ca3af"; // gray-400

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Estimate fractional position [0, 1] along the trail.
 * Primary: t = distToStart / (distToStart + distToEnd)
 * Fallback: nearest anchor zone (0.15 / 0.5 / 0.85)
 */
function computeT(spot: BailoutSpot): number {
  const s = spot.anchors["start"];
  const e = spot.anchors["end"];
  if (
    typeof s === "number" && Number.isFinite(s) &&
    typeof e === "number" && Number.isFinite(e)
  ) {
    const total = s + e;
    if (total > 0) return Math.max(0.01, Math.min(0.99, s / total));
  }
  // Fallback: use whichever anchor was nearest
  const rawAnchor = spot.rawPoints[0]?.anchor ?? "start";
  if (rawAnchor === "end") return 0.85;
  if (rawAnchor === "centroid") return 0.5;
  return 0.15;
}

function toSvgX(t: number): number {
  return PAD_LEFT + Math.max(0, Math.min(1, t)) * CHART_W;
}

function formatMi(v: number): string {
  if (v === 0) return "0 mi";
  return v % 1 === 0 ? `${v} mi` : `${v.toFixed(1)} mi`;
}

function spotColor(spot: BailoutSpot): string {
  if (spot.kinds.includes("entrance")) return COLOR_ENTRANCE;
  if (spot.kinds.includes("intersection")) return COLOR_INTERSECTION;
  return COLOR_DEAD_END;
}

function spotR(spot: BailoutSpot): number {
  if (spot.kinds.includes("entrance")) return R_ENTRANCE;
  if (spot.kinds.includes("intersection")) return R_INTERSECTION;
  return R_DEAD_END;
}

function spotEmoji(spot: BailoutSpot): string {
  if (spot.kinds.includes("entrance")) return "🚪";
  if (spot.kinds.includes("intersection")) return "🔀";
  return "🔚";
}

// ── component ─────────────────────────────────────────────────────────────────
export function BailoutCoverageChart({ points, totalMiles }: Props) {
  const [activeId, setActiveId]     = useState<string | null>(null);
  const [activeSpot, setActiveSpot] = useState<BailoutSpot | null>(null);

  const spots = useMemo(() => normalizeBailoutPoints(points), [points]);

  const actionable = spots.filter(s => isActionableExit(s));
  const deadEnds   = spots.filter(s => isDeadEndOnly(s));

  type Row = { key: string; label: string; emoji: string; items: BailoutSpot[]; isActionable: boolean };
  const rows: Row[] = [];
  if (actionable.length > 0) rows.push({ key: "exits",    label: "Exits",     emoji: "🚪", items: actionable, isActionable: true });
  if (deadEnds.length > 0)   rows.push({ key: "deadends", label: "Dead ends", emoji: "🔚", items: deadEnds,   isActionable: false });

  if (rows.length === 0) return null;

  const SVG_H      = PAD_TOP + rows.length * ROW_H + AXIS_H + 4;
  const axisBaseY  = PAD_TOP + rows.length * ROW_H + 4;
  const axisLabelY = axisBaseY + 14;

  function handleClick(spot: BailoutSpot) {
    if (activeId === spot.id) {
      setActiveId(null);
      setActiveSpot(null);
    } else {
      setActiveId(spot.id);
      setActiveSpot(spot);
    }
  }

  // Closest actionable exit from start (for tooltip context)
  const closestFromStart = actionable.reduce<number | null>((best, s) => {
    const d = s.anchors["start"];
    if (typeof d !== "number" || !Number.isFinite(d)) return best;
    return best == null || d < best ? d : best;
  }, null);

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${W} ${SVG_H}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label="Bailout exit coverage chart"
      >
        {rows.map(({ key, label, emoji, items, isActionable }, rowIdx) => {
          const rowCy = PAD_TOP + rowIdx * ROW_H + ROW_H / 2;
          return (
            <g key={key}>
              {/* Lane label */}
              <text
                x={PAD_LEFT - 6}
                y={rowCy + 4}
                textAnchor="end"
                fontSize="11"
                fill="#6b7280"
                fontFamily="inherit"
              >
                {emoji} {label}
              </text>

              {/* Track line */}
              <line
                x1={PAD_LEFT} y1={rowCy}
                x2={PAD_LEFT + CHART_W} y2={rowCy}
                stroke="#e5e7eb" strokeWidth="1.5"
              />

              {/* Dots */}
              {items.map((spot) => {
                const t        = computeT(spot);
                const cx       = toSvgX(t);
                const isActive = activeId === spot.id;
                const color    = spotColor(spot);
                const r        = spotR(spot);
                const nearestD = spot.anchors["start"] != null
                  ? `${formatDistanceShort(spot.anchors["start"])} from start`
                  : spot.title;

                return (
                  <g
                    key={spot.id}
                    onClick={() => handleClick(spot)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={`${spot.title} · ${nearestD}`}
                  >
                    {/* Invisible hit target */}
                    <circle cx={cx} cy={rowCy} r={HIT_R} fill="transparent" />

                    {/* Active selection ring */}
                    {isActive && (
                      <circle cx={cx} cy={rowCy} r={r + 5}
                        fill="none" stroke={color} strokeWidth="1.5" opacity="0.4" />
                    )}

                    {/* Glow */}
                    <circle cx={cx} cy={rowCy} r={r + 2.5}
                      fill={color} opacity={isActive ? "0.28" : "0.13"} />

                    {/* Main dot — filled for actionable, hollow for dead ends */}
                    {isActionable ? (
                      <circle cx={cx} cy={rowCy} r={r}
                        fill={color} stroke="white" strokeWidth="1.5" />
                    ) : (
                      <circle cx={cx} cy={rowCy} r={r}
                        fill="white" stroke={color} strokeWidth="1.5" />
                    )}

                    <title>{spot.title} · {nearestD}</title>
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

        {/* Axis labels */}
        <text x={PAD_LEFT} y={axisLabelY}
          textAnchor="start" fontSize="10" fill="#9ca3af" fontFamily="inherit">
          {totalMiles != null ? "0 mi" : "← Start"}
        </text>
        <text x={PAD_LEFT + CHART_W} y={axisLabelY}
          textAnchor="end" fontSize="10" fill="#9ca3af" fontFamily="inherit">
          {totalMiles != null ? formatMi(totalMiles) : "End →"}
        </text>

        {/* Mid tick */}
        <line
          x1={PAD_LEFT + CHART_W / 2} y1={axisBaseY}
          x2={PAD_LEFT + CHART_W / 2} y2={axisBaseY + 4}
          stroke="#e5e7eb" strokeWidth="1"
        />
        <text x={PAD_LEFT + CHART_W / 2} y={axisLabelY}
          textAnchor="middle" fontSize="9" fill="#e5e7eb" fontFamily="inherit">
          {totalMiles != null ? formatMi(totalMiles / 2) : "mid"}
        </text>
      </svg>

      {/* Legend + summary stat */}
      <div style={{
        marginTop: "0.3rem",
        display: "flex",
        flexWrap: "wrap" as const,
        gap: "0.3rem 0.75rem",
        fontSize: "0.75rem",
        color: "#6b7280",
      }}>
        {actionable.length > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{
              display: "inline-block", width: 8, height: 8,
              borderRadius: "50%", background: COLOR_ENTRANCE,
              flexShrink: 0,
            }} />
            {actionable.length} actionable exit{actionable.length !== 1 ? "s" : ""}
            {closestFromStart != null && (
              <span style={{ color: "#9ca3af" }}>
                · closest {formatDistanceShort(closestFromStart)} from start
              </span>
            )}
          </span>
        )}
        {deadEnds.length > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{
              display: "inline-block", width: 8, height: 8,
              borderRadius: "50%", background: "white",
              border: `1.5px solid ${COLOR_DEAD_END}`,
              flexShrink: 0,
            }} />
            {deadEnds.length} dead end{deadEnds.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Info strip — shown on click */}
      {activeSpot && (() => {
        const color = spotColor(activeSpot);
        const emoji = spotEmoji(activeSpot);
        const ANCHORS: Array<"start" | "centroid" | "end"> = ["start", "centroid", "end"];
        return (
          <div style={{
            marginTop: "0.45rem",
            padding: "0.4rem 0.65rem",
            background: color + "0f",
            border: `1px solid ${color}30`,
            borderRadius: "0.45rem",
            fontSize: "0.8rem",
            color: "#374151",
            display: "flex",
            flexWrap: "wrap" as const,
            alignItems: "center",
            gap: "0.25rem 0.5rem",
          }}>
            <span style={{ fontSize: "1rem" }}>{emoji}</span>
            <span style={{ fontWeight: 600, color: "#111827" }}>{activeSpot.title}</span>

            {/* Per-anchor distances */}
            <div style={{
              width: "100%",
              display: "flex",
              flexWrap: "wrap" as const,
              gap: "0.15rem 1rem",
              marginTop: "0.1rem",
            }}>
              {ANCHORS.map(anchor => {
                const d = activeSpot.anchors[anchor];
                if (typeof d !== "number" || !Number.isFinite(d)) return null;
                return (
                  <span key={anchor} style={{ color: "#6b7280", fontSize: "0.75rem" }}>
                    <span style={{ fontWeight: 500, color: "#374151" }}>
                      {formatDistanceShort(d)}
                    </span>
                    {" "}from {anchorLabel(anchor).toLowerCase()}
                  </span>
                );
              })}
            </div>

            {/* Dismiss */}
            <button
              onClick={() => { setActiveId(null); setActiveSpot(null); }}
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
                alignSelf: "flex-start",
              }}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })()}
    </div>
  );
}
