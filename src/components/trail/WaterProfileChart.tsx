/**
 * WaterProfileChart — horizontal segmented bar showing where the trail
 * runs near water vs. dry land.
 *
 * Uses a change-point array [{d, type}] where type is one of:
 *   "river" | "stream" | "lake" | "canal" | "spring" | "dry"
 *
 * Dry sections are rendered in a very light background color so the
 * water sections (blues) stand out clearly.
 *
 * No external library. All inline styles.
 */

export type WaterProfilePoint = { d: number; type: string };

type Props = {
  points: WaterProfilePoint[];
  totalMiles?: number | null;
};

// ── type colors ───────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  river:  "#2563eb", // strong blue
  lake:   "#0891b2", // cyan-blue
  stream: "#60a5fa", // light blue
  canal:  "#38bdf8", // sky blue
  spring: "#67e8f9", // light cyan
  dry:    "#e2e8f0", // barely-there slate
};

const TYPE_LABEL: Record<string, string> = {
  river:  "River",
  lake:   "Lake / Pond",
  stream: "Stream",
  canal:  "Canal",
  spring: "Spring",
};

// ── layout ────────────────────────────────────────────────────────────────────
const W        = 600;
const PAD_H    = 8;
const BAR_H    = 28;
const AXIS_H   = 18;
const LEG_H    = 20;
const PAD_V    = 6;

function formatMi(v: number): string {
  if (v === 0) return "0 mi";
  return v % 1 === 0 ? `${v} mi` : `${v.toFixed(1)} mi`;
}

export function WaterProfileChart({ points, totalMiles }: Props) {
  if (!points || points.length === 0) return null;

  const maxD =
    totalMiles != null && Number.isFinite(totalMiles) && totalMiles > 0
      ? totalMiles
      : (points[points.length - 1]?.d ?? 0) + 0.5;

  // Unique non-dry water types in this trail (for legend)
  const waterTypesPresent = [...new Set(
    points.map(p => p.type).filter(t => t !== "dry")
  )].sort((a, b) =>
    (Object.keys(TYPE_COLOR).indexOf(a)) - (Object.keys(TYPE_COLOR).indexOf(b))
  );

  const hasLegend = waterTypesPresent.length > 0;
  const legendH   = hasLegend ? LEG_H + PAD_V : 0;
  const SVG_H     = PAD_V + BAR_H + AXIS_H + legendH + PAD_V;

  // X helpers
  const barX = PAD_H;
  const barW = W - PAD_H * 2;
  const toX  = (d: number) => barX + Math.min(1, d / maxD) * barW;

  // Build drawable segments from change-point array
  const segments: { x: number; w: number; type: string }[] = [];
  for (let i = 0; i < points.length; i++) {
    const startD = points[i].d;
    const endD   = i + 1 < points.length ? points[i + 1].d : maxD;
    const x      = toX(startD);
    const xEnd   = toX(endD);
    const w      = Math.max(1, xEnd - x);
    segments.push({ x, w, type: points[i].type });
  }

  // Mile tick marks
  const mileTicks: number[] = [];
  if (maxD > 1) {
    const maxTicks = 5;
    const step = Math.max(1, Math.ceil(Math.floor(maxD) / maxTicks));
    for (let m = step; m < maxD; m += step) mileTicks.push(m);
  }

  const barY   = PAD_V;
  const axisY  = barY + BAR_H + 14;
  const legY   = axisY + PAD_V + 2;

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${W} ${SVG_H}`}
        width="100%"
        style={{ display: "block" }}
        aria-label="Trail water profile chart"
      >
        {/* Segments */}
        {segments.map((seg, i) => (
          <g key={i}>
            <rect
              x={seg.x}
              y={barY}
              width={seg.w}
              height={BAR_H}
              fill={TYPE_COLOR[seg.type] ?? TYPE_COLOR.dry}
              rx={i === 0 ? 4 : 0}
              ry={i === 0 ? 4 : 0}
            />
            <title>{seg.type === "dry"
              ? `Dry — no water within 200 m`
              : `${TYPE_LABEL[seg.type] ?? seg.type}`}
            </title>
          </g>
        ))}
        {/* Right-end rounding cap — last segment */}
        {segments.length > 0 && (() => {
          const last = segments[segments.length - 1];
          return (
            <rect
              x={last.x + last.w - 4}
              y={barY}
              width={4}
              height={BAR_H}
              fill={TYPE_COLOR[last.type] ?? TYPE_COLOR.dry}
              rx={4}
              ry={4}
            />
          );
        })()}

        {/* Axis line */}
        <line
          x1={barX} y1={barY + BAR_H + 3}
          x2={barX + barW} y2={barY + BAR_H + 3}
          stroke="#d1d5db" strokeWidth="1"
        />

        {/* Axis: start */}
        <text x={barX} y={axisY} textAnchor="start" fontSize="10" fill="#9ca3af" fontFamily="inherit">
          0 mi
        </text>
        {/* Axis: end */}
        <text x={barX + barW} y={axisY} textAnchor="end" fontSize="10" fill="#9ca3af" fontFamily="inherit">
          {formatMi(maxD)}
        </text>
        {/* Intermediate ticks */}
        {mileTicks.map(m => {
          const x = toX(m);
          return (
            <g key={m}>
              <line x1={x} y1={barY + BAR_H + 3} x2={x} y2={barY + BAR_H + 7}
                stroke="#d1d5db" strokeWidth="1" />
              <text x={x} y={axisY} textAnchor="middle" fontSize="9" fill="#d1d5db" fontFamily="inherit">
                {m}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        {hasLegend && (() => {
          let lx = barX;
          return (
            <g>
              {waterTypesPresent.map(type => {
                const label = TYPE_LABEL[type] ?? type;
                const dotR = 5;
                const textWidth = label.length * 6.5 + dotR * 2 + 8;
                const itemX = lx;
                lx += textWidth;
                return (
                  <g key={type}>
                    <circle cx={itemX + dotR} cy={legY + dotR} r={dotR}
                      fill={TYPE_COLOR[type] ?? "#6b7280"} />
                    <text x={itemX + dotR * 2 + 4} y={legY + dotR + 4}
                      fontSize="10" fill="#6b7280" fontFamily="inherit">
                      {label}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
