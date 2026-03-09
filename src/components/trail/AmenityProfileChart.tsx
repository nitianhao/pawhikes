"use client";

/**
 * AmenityProfileChart — swim-lane horizontal chart showing where amenities
 * are located along a trail.
 *
 * One row per amenity kind, with dots at each occurrence's d position.
 * Prevents label / dot overlap by giving each kind its own lane.
 *
 * Props:
 *   points     – [{d, kind}] sorted by d ascending
 *   totalMiles – total trail length (end of x-axis)
 *
 * No external library. All inline styles.
 */

import { useState } from "react";

export type AmenityPoint = {
  d: number;
  kind: string;
  name?: string | null;
  source?: string | null;
  osmId?: string | null;
  osmType?: string | null;
  lat?: number | null;
  lon?: number | null;
  distanceToTrailMeters?: number | null;
};

type Props = {
  points: AmenityPoint[];
  totalMiles?: number | null;
};

// ── kind metadata ─────────────────────────────────────────────────────────────
const KIND_META: Record<string, { emoji: string; label: string; color: string }> = {
  bench:         { emoji: "🪑", label: "Benches",       color: "#6b7280" },
  shelter:       { emoji: "🛖", label: "Shelters",      color: "#92400e" },
  toilets:       { emoji: "🚻", label: "Restrooms",     color: "#1d4ed8" },
  drinking_water:{ emoji: "💧", label: "Water",         color: "#0369a1" },
  picnic_table:  { emoji: "🍽️", label: "Picnic tables", color: "#65a30d" },
  waste_basket:  { emoji: "🗑️", label: "Waste bins",    color: "#9f1239" },
  information:   { emoji: "ℹ️", label: "Info boards",   color: "#7c3aed" },
  dog_waste:     { emoji: "🐶", label: "Dog waste",     color: "#b45309" },
};

// Display order — most practically relevant first
const KIND_ORDER = [
  "toilets",
  "drinking_water",
  "shelter",
  "bench",
  "picnic_table",
  "waste_basket",
  "dog_waste",
  "information",
];

function getMeta(kind: string) {
  return KIND_META[kind] ?? { emoji: "📍", label: kind, color: "#6b7280" };
}

function formatMi(v: number): string {
  if (v === 0) return "0 mi";
  return v % 1 === 0 ? `${v} mi` : `${v.toFixed(1)} mi`;
}

// ── layout constants ──────────────────────────────────────────────────────────
const W          = 600;
const PAD_LEFT   = 86; // room for compact emoji + label
const PAD_RIGHT  = 8;
const PAD_TOP    = 4;
const ROW_H      = 22;  // compact lane height
const AXIS_H     = 18;  // x-axis labels
const CHART_W    = W - PAD_LEFT - PAD_RIGHT;
const DOT_R      = 4;
const TRACK_H    = 2;   // thin horizontal track line per lane
const CLUSTER_GAP_PX = 9;

function toSvgX(d: number, maxD: number): number {
  return PAD_LEFT + (maxD > 0 ? Math.min(1, d / maxD) * CHART_W : 0);
}

type ClusteredPoint = {
  x: number;
  count: number;
  minD: number;
  maxD: number;
  members: AmenityPoint[];
};

function clusterAmenityPoints(points: AmenityPoint[], maxD: number): ClusteredPoint[] {
  const sorted = [...points].sort((a, b) => a.d - b.d);
  if (sorted.length === 0) return [];

  const clusters: ClusteredPoint[] = [];
  for (const pt of sorted) {
    const x = toSvgX(pt.d, maxD);
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(x - last.x) <= CLUSTER_GAP_PX) {
      const nextCount = last.count + 1;
      last.x = (last.x * last.count + x) / nextCount;
      last.count = nextCount;
      last.maxD = pt.d;
      last.members.push(pt);
      continue;
    }
    clusters.push({ x, count: 1, minD: pt.d, maxD: pt.d, members: [pt] });
  }
  return clusters;
}

function formatMilesSpan(minD: number, maxD: number): string {
  if (Math.abs(maxD - minD) < 0.05) return `${minD.toFixed(2)} mi`;
  return `${minD.toFixed(2)}-${maxD.toFixed(2)} mi`;
}

function formatPercentOfTrail(minD: number, maxD: number, total: number): string {
  if (!(total > 0)) return "n/a";
  const center = (minD + maxD) / 2;
  const pct = Math.max(0, Math.min(100, (center / total) * 100));
  return `${Math.round(pct)}%`;
}

function formatCoord(lat: number, lon: number): string {
  return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

export function AmenityProfileChart({ points, totalMiles }: Props) {
  const [activeDot, setActiveDot] = useState<{
    id: string;
    x: number;
    y: number;
    title: string;
    rows: string[];
  } | null>(null);

  if (points.length === 0) return null;

  const maxD = (totalMiles != null && Number.isFinite(totalMiles) && totalMiles > 0)
    ? totalMiles
    : (points[points.length - 1]?.d ?? 0) + 0.5;

  // Collect unique kinds present, in display order
  const kindsPresent = KIND_ORDER.filter(k => points.some(p => p.kind === k));
  // Append any unknown kinds at the end
  const extraKinds = [...new Set(points.map(p => p.kind))].filter(k => !KIND_ORDER.includes(k));
  const allKinds = [...kindsPresent, ...extraKinds];

  if (allKinds.length === 0) return null;

  const SVG_H = PAD_TOP + allKinds.length * ROW_H + AXIS_H + 4;

  // Mile ticks
  const mileTicks: number[] = [];
  if (maxD > 1) {
    const maxTicks = 5;
    const mileStep = Math.max(1, Math.ceil(Math.floor(maxD) / maxTicks));
    for (let m = mileStep; m < maxD; m += mileStep) mileTicks.push(m);
  }

  const axisY = PAD_TOP + allKinds.length * ROW_H + 12;

  return (
    <div style={{ width: "100%", overflow: "hidden", position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${SVG_H}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label="Trail amenity profile chart"
      >
        {allKinds.map((kind, rowIdx) => {
          const meta = getMeta(kind);
          const rowCy = PAD_TOP + rowIdx * ROW_H + ROW_H / 2;
          const dotsForKind = points.filter(p => p.kind === kind);
          const clusters = clusterAmenityPoints(dotsForKind, maxD);

          return (
            <g key={kind}>
              {/* Emoji label */}
              <text
                x={PAD_LEFT - 6}
                y={rowCy + 4}
                textAnchor="end"
                fontSize="10"
                fill="#6b7280"
                fontFamily="inherit"
              >
                {meta.emoji} {meta.label} {dotsForKind.length > 0 ? `(${dotsForKind.length})` : ""}
              </text>

              {/* Track line */}
              <line
                x1={PAD_LEFT}
                y1={rowCy}
                x2={PAD_LEFT + CHART_W}
                y2={rowCy}
                stroke="#e5e7eb"
                strokeWidth={TRACK_H}
              />

              {/* Dots */}
              {clusters.map((cluster, i) => {
                const cx = cluster.x;
                const radius = cluster.count >= 10 ? DOT_R + 2 : cluster.count >= 2 ? DOT_R + 1.5 : DOT_R;
                const dotId = `${kind}-${rowIdx}-${i}`;
                const names = Array.from(
                  new Set(
                    cluster.members
                      .map((m) => (typeof m.name === "string" ? m.name.trim() : ""))
                      .filter(Boolean)
                  )
                );
                const sources = Array.from(
                  new Set(
                    cluster.members
                      .map((m) => (typeof m.source === "string" ? m.source.trim() : ""))
                      .filter(Boolean)
                  )
                );
                const osmIds = Array.from(
                  new Set(
                    cluster.members
                      .map((m) => (typeof m.osmId === "string" ? m.osmId.trim() : ""))
                      .filter(Boolean)
                  )
                );
                const singleMember = cluster.count === 1 ? cluster.members[0] : null;
                const rows = [
                  cluster.count === 1 ? "1 mapped point" : `${cluster.count} mapped points`,
                  `Trail position: ${formatMilesSpan(cluster.minD, cluster.maxD)} (${formatPercentOfTrail(cluster.minD, cluster.maxD, maxD)})`,
                  names.length > 0 ? `Names: ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}` : null,
                  sources.length > 0 ? `Source type: ${sources.join(", ")}` : null,
                  osmIds.length > 0
                    ? `OSM ID${osmIds.length === 1 ? "" : "s"}: ${osmIds.slice(0, 2).join(", ")}${osmIds.length > 2 ? "…" : ""}`
                    : null,
                  singleMember &&
                  typeof singleMember.distanceToTrailMeters === "number" &&
                  Number.isFinite(singleMember.distanceToTrailMeters)
                    ? `Distance to trail: ${Math.round(singleMember.distanceToTrailMeters)} m`
                    : null,
                  singleMember &&
                  typeof singleMember.lat === "number" &&
                  Number.isFinite(singleMember.lat) &&
                  typeof singleMember.lon === "number" &&
                  Number.isFinite(singleMember.lon)
                    ? `Coordinates: ${formatCoord(singleMember.lat, singleMember.lon)}`
                    : null,
                ].filter((value): value is string => Boolean(value));
                return (
                  <g key={i}>
                    <circle
                      cx={cx}
                      cy={rowCy}
                      r={radius}
                      fill={meta.color}
                      stroke="white"
                      strokeWidth={cluster.count >= 2 ? "1.75" : "1.25"}
                      style={{ cursor: "pointer" }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${meta.label}: ${rows[1] ?? "amenity point"}`}
                      onClick={() =>
                        setActiveDot((prev) =>
                          prev?.id === dotId
                            ? null
                            : {
                                id: dotId,
                                x: cx,
                                y: rowCy,
                                title: meta.label,
                                rows,
                              }
                        )
                      }
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setActiveDot((prev) =>
                          prev?.id === dotId
                            ? null
                            : {
                                id: dotId,
                                x: cx,
                                y: rowCy,
                                title: meta.label,
                                rows,
                              }
                        );
                      }}
                    />
                    {cluster.count >= 2 ? (
                      <text
                        x={cx}
                        y={rowCy + 2}
                        textAnchor="middle"
                        fontSize={cluster.count >= 10 ? "6.2" : "6.8"}
                        fill="#ffffff"
                        fontWeight={700}
                        fontFamily="inherit"
                      >
                        {cluster.count}
                      </text>
                    ) : null}
                    <title>
                      {cluster.count === 1
                        ? `${meta.label} at ${cluster.minD.toFixed(1)} mi`
                        : `${cluster.count} ${meta.label.toLowerCase()} near ${cluster.minD.toFixed(1)}-${cluster.maxD.toFixed(1)} mi`}
                    </title>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* X-axis track */}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + allKinds.length * ROW_H + 4}
          x2={PAD_LEFT + CHART_W}
          y2={PAD_TOP + allKinds.length * ROW_H + 4}
          stroke="#d1d5db"
          strokeWidth="1"
        />

        {/* X-axis: start */}
        <text
          x={PAD_LEFT}
          y={axisY}
          textAnchor="start"
          fontSize="10"
          fill="#9ca3af"
          fontFamily="inherit"
        >
          0 mi
        </text>

        {/* X-axis: end */}
        <text
          x={PAD_LEFT + CHART_W}
          y={axisY}
          textAnchor="end"
          fontSize="10"
          fill="#9ca3af"
          fontFamily="inherit"
        >
          {formatMi(maxD)}
        </text>

        {/* Intermediate ticks */}
        {mileTicks.map((m) => {
          const x = toSvgX(m, maxD);
          return (
            <g key={m}>
              <line
                x1={x}
                y1={PAD_TOP + allKinds.length * ROW_H + 4}
                x2={x}
                y2={PAD_TOP + allKinds.length * ROW_H + 8}
                stroke="#d1d5db"
                strokeWidth="1"
              />
              <text
                x={x}
                y={axisY}
                textAnchor="middle"
                fontSize="8.5"
                fill="#d1d5db"
                fontFamily="inherit"
              >
                {m}
              </text>
            </g>
          );
        })}
      </svg>
      {activeDot ? (
        <div
          style={{
            position: "absolute",
            left: `${(activeDot.x / W) * 100}%`,
            top: `${(activeDot.y / SVG_H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 8px))",
            border: "1px solid #d1d5db",
            borderRadius: "0.5rem",
            background: "#ffffff",
            padding: "0.25rem 0.45rem",
            fontSize: "0.72rem",
            lineHeight: 1.25,
            color: "#111827",
            boxShadow: "0 6px 20px rgba(15, 23, 42, 0.12)",
            textAlign: "left",
            maxWidth: "240px",
            zIndex: 2,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.35rem" }}>
            <strong style={{ display: "block" }}>{activeDot.title}</strong>
            <button
              type="button"
              onClick={() => setActiveDot(null)}
              aria-label="Hide amenity point details"
              style={{
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                color: "#64748b",
                borderRadius: "0.35rem",
                fontSize: "0.65rem",
                lineHeight: 1,
                padding: "0.15rem 0.25rem",
                cursor: "pointer",
              }}
            >
              x
            </button>
          </div>
          <div style={{ marginTop: "0.2rem", display: "grid", gap: "0.15rem" }}>
            {activeDot.rows.map((row, idx) => (
              <div key={idx} style={{ color: idx === 0 ? "#111827" : "#6b7280" }}>
                {row}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
