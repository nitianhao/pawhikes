/**
 * ShadeProfileChart — horizontal segmented bar showing shade level along a trail.
 *
 * Each segment is colored by its shade intensity:
 *   Full sun  → light amber  (#fef3c7)
 *   Partial   → light green  (#bbf7d0)
 *   Shade     → medium green (#4ade80)
 *   Dense     → dark green   (#166534)
 *
 * No external charting library. Inline styles throughout.
 */

export type ShadeProfilePoint = { d: number; shade: number };

type Props = {
  points: ShadeProfilePoint[];
  totalMiles?: number | null;
};

const W = 600;
const H = 110;
const PAD_LEFT   = 4;
const PAD_RIGHT  = 4;
const PAD_TOP    = 8;
const BAR_H      = 40;
const PAD_BOTTOM = 28; // x-axis labels + legend

const CHART_W = W - PAD_LEFT - PAD_RIGHT;

function toSvgX(d: number, maxD: number): number {
  return PAD_LEFT + (maxD > 0 ? (d / maxD) * CHART_W : 0);
}

function shadeToColor(shade: number): string {
  if (shade >= 0.8) return "#166534"; // dense canopy: dark green
  if (shade >= 0.4) return "#4ade80"; // good shade: medium green
  if (shade >= 0.1) return "#bbf7d0"; // partial shade: light mint
  return "#fef3c7";                    // full sun: light amber
}

function formatMi(v: number): string {
  if (v === 0) return "0 mi";
  return v % 1 === 0 ? `${v} mi` : `${v.toFixed(1)} mi`;
}

const LEGEND_ITEMS = [
  { label: "Sun",     color: "#fef3c7", border: "#fde68a" },
  { label: "Partial", color: "#bbf7d0", border: "#86efac" },
  { label: "Shade",   color: "#4ade80", border: "#22c55e" },
  { label: "Dense",   color: "#166534", border: "#14532d" },
] as const;

export function ShadeProfileChart({ points, totalMiles }: Props) {
  if (points.length < 2) return null;

  const maxD = (totalMiles != null && Number.isFinite(totalMiles) && totalMiles > 0)
    ? totalMiles
    : points[points.length - 1].d;

  const barY = PAD_TOP;
  const labelY = barY + BAR_H + 14;
  const legendY = labelY + 16;

  // Mile ticks: every whole mile, up to 6
  const mileTicks: number[] = [];
  if (maxD > 1) {
    const maxTicks = 6;
    const mileStep = Math.max(1, Math.ceil(Math.floor(maxD) / maxTicks));
    for (let m = mileStep; m < maxD; m += mileStep) {
      mileTicks.push(m);
    }
  }

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label="Trail shade profile chart"
      >
        {/* Shade segments */}
        {points.map((p, i) => {
          const x1 = toSvgX(p.d, maxD);
          const x2 = i < points.length - 1
            ? toSvgX(points[i + 1].d, maxD)
            : toSvgX(maxD, maxD);
          const w = Math.max(0.5, x2 - x1);
          return (
            <rect
              key={i}
              x={x1}
              y={barY}
              width={w}
              height={BAR_H}
              fill={shadeToColor(p.shade)}
            />
          );
        })}

        {/* Border overlay */}
        <rect
          x={PAD_LEFT}
          y={barY}
          width={CHART_W}
          height={BAR_H}
          fill="none"
          stroke="#d1d5db"
          strokeWidth="1"
          rx="3"
        />

        {/* X-axis: start */}
        <text
          x={PAD_LEFT}
          y={labelY}
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
          y={labelY}
          textAnchor="end"
          fontSize="10"
          fill="#9ca3af"
          fontFamily="inherit"
        >
          {formatMi(maxD)}
        </text>

        {/* X-axis: intermediate mile ticks */}
        {mileTicks.map((m) => {
          const x = toSvgX(m, maxD);
          return (
            <g key={m}>
              <line x1={x} y1={barY + BAR_H} x2={x} y2={barY + BAR_H + 4} stroke="#d1d5db" strokeWidth="1" />
              <text x={x} y={labelY} textAnchor="middle" fontSize="9" fill="#d1d5db" fontFamily="inherit">
                {m}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        {LEGEND_ITEMS.map((item, i) => {
          const totalLegendW = LEGEND_ITEMS.length * 90;
          const startX = (W - totalLegendW) / 2 + i * 90;
          return (
            <g key={item.label}>
              <rect
                x={startX}
                y={legendY}
                width={12}
                height={12}
                fill={item.color}
                stroke={item.border}
                strokeWidth="1"
                rx="2"
              />
              <text
                x={startX + 16}
                y={legendY + 9}
                fontSize="9"
                fill="#6b7280"
                fontFamily="inherit"
              >
                {item.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
