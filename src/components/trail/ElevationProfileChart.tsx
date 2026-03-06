/**
 * ElevationProfileChart — pure SVG area chart for trail elevation profiles.
 *
 * No external charting library. Inline styles throughout (no Tailwind).
 */

export type ElevationProfilePoint = { d: number; e: number };

type Props = {
  points: ElevationProfilePoint[];
  minFt?: number | null;
  maxFt?: number | null;
};

const W = 600;
const H = 140;
const PAD_LEFT = 44;  // room for y-labels
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 28; // room for x-labels

const CHART_W = W - PAD_LEFT - PAD_RIGHT;
const CHART_H = H - PAD_TOP - PAD_BOTTOM;

function toSvgX(d: number, maxD: number): number {
  return PAD_LEFT + (maxD > 0 ? (d / maxD) * CHART_W : 0);
}

function toSvgY(e: number, minE: number, maxE: number): number {
  const range = maxE - minE;
  if (range <= 0) return PAD_TOP + CHART_H / 2;
  return PAD_TOP + (1 - (e - minE) / range) * CHART_H;
}

function formatFt(v: number): string {
  return `${Math.round(v).toLocaleString()} ft`;
}

function formatMi(v: number): string {
  if (v === 0) return "0 mi";
  return v % 1 === 0 ? `${v} mi` : `${v.toFixed(1)} mi`;
}

export function ElevationProfileChart({ points, minFt, maxFt }: Props) {
  if (points.length < 2) return null;

  const maxD = points[points.length - 1].d;

  // Use provided min/max if available (more accurate than point extremes since
  // profile is downsampled). Fall back to computed values.
  const eMin = minFt != null && Number.isFinite(minFt) ? minFt : Math.min(...points.map((p) => p.e));
  const eMax = maxFt != null && Number.isFinite(maxFt) ? maxFt : Math.max(...points.map((p) => p.e));

  // Add 5% vertical padding so the line doesn't hug the edges
  const ePad = Math.max((eMax - eMin) * 0.05, 5);
  const yMin = eMin - ePad;
  const yMax = eMax + ePad;

  // Build SVG path
  const lineParts = points.map((p, i) => {
    const x = toSvgX(p.d, maxD);
    const y = toSvgY(p.e, yMin, yMax);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  // Close path down to bottom-left for filled area
  const lastX = toSvgX(maxD, maxD);
  const firstX = toSvgX(0, maxD);
  const bottomY = PAD_TOP + CHART_H;
  const areaPath = [...lineParts, `L${lastX.toFixed(1)},${bottomY}`, `L${firstX.toFixed(1)},${bottomY}`, "Z"].join(" ");
  const linePath = lineParts.join(" ");

  // X-axis mile markers (every whole mile, up to 6 markers)
  const mileTicks: number[] = [];
  if (maxD > 0) {
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
        aria-label="Trail elevation profile chart"
      >
        {/* Grid line at top and bottom of chart area */}
        <line
          x1={PAD_LEFT} y1={PAD_TOP}
          x2={PAD_LEFT + CHART_W} y2={PAD_TOP}
          stroke="#e5e7eb" strokeWidth="1"
        />
        <line
          x1={PAD_LEFT} y1={PAD_TOP + CHART_H}
          x2={PAD_LEFT + CHART_W} y2={PAD_TOP + CHART_H}
          stroke="#e5e7eb" strokeWidth="1"
        />

        {/* Filled area */}
        <path d={areaPath} fill="rgba(21,128,61,0.10)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke="#15803d" strokeWidth="1.5" strokeLinejoin="round" />

        {/* Y-axis labels */}
        <text
          x={PAD_LEFT - 4}
          y={PAD_TOP + 4}
          textAnchor="end"
          fontSize="10"
          fill="#9ca3af"
          fontFamily="inherit"
        >
          {formatFt(eMax)}
        </text>
        <text
          x={PAD_LEFT - 4}
          y={PAD_TOP + CHART_H}
          textAnchor="end"
          dominantBaseline="auto"
          fontSize="10"
          fill="#9ca3af"
          fontFamily="inherit"
        >
          {formatFt(eMin)}
        </text>

        {/* X-axis: start and end */}
        <text
          x={PAD_LEFT}
          y={H - 4}
          textAnchor="start"
          fontSize="10"
          fill="#9ca3af"
          fontFamily="inherit"
        >
          0 mi
        </text>
        <text
          x={PAD_LEFT + CHART_W}
          y={H - 4}
          textAnchor="end"
          fontSize="10"
          fill="#9ca3af"
          fontFamily="inherit"
        >
          {formatMi(maxD)}
        </text>

        {/* X-axis intermediate mile ticks */}
        {mileTicks.map((m) => {
          const x = toSvgX(m, maxD);
          return (
            <g key={m}>
              <line x1={x} y1={PAD_TOP + CHART_H} x2={x} y2={PAD_TOP + CHART_H + 3} stroke="#d1d5db" strokeWidth="1" />
              <text x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="#d1d5db" fontFamily="inherit">
                {m}
              </text>
            </g>
          );
        })}

        {/* Left border */}
        <line
          x1={PAD_LEFT} y1={PAD_TOP}
          x2={PAD_LEFT} y2={PAD_TOP + CHART_H}
          stroke="#e5e7eb" strokeWidth="1"
        />
      </svg>
    </div>
  );
}
