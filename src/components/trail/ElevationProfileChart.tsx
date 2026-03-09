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
const SMOOTH_TENSION = 0.65;
const SMOOTH_PASSES = 3;
const IMPERCEPTIBLE_DELTA_FT = 6;

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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothingRadius(count: number): number {
  if (count < 20) return 2;
  return clamp(Math.round(count / 22), 2, 8);
}

function weightedSmoothElevation(points: ElevationProfilePoint[]): ElevationProfilePoint[] {
  const radius = smoothingRadius(points.length);
  if (radius <= 0) return points;

  return points.map((p, i) => {
    let weightedSum = 0;
    let weightTotal = 0;
    for (let o = -radius; o <= radius; o += 1) {
      const idx = clamp(i + o, 0, points.length - 1);
      const weight = radius + 1 - Math.abs(o); // triangular weights
      weightedSum += points[idx].e * weight;
      weightTotal += weight;
    }
    return { d: p.d, e: weightedSum / weightTotal };
  });
}

function applyImperceptibleDeadband(points: ElevationProfilePoint[]): ElevationProfilePoint[] {
  if (points.length < 2) return points;
  const out: ElevationProfilePoint[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = out[i - 1];
    const current = points[i];
    if (Math.abs(current.e - prev.e) < IMPERCEPTIBLE_DELTA_FT) {
      out.push({ d: current.d, e: prev.e });
    } else {
      out.push(current);
    }
  }
  return out;
}

type SvgPoint = { x: number; y: number };

function buildSmoothLinePath(points: SvgPoint[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  if (points.length === 2) {
    return [
      `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`,
      `L${points[1].x.toFixed(1)},${points[1].y.toFixed(1)}`,
    ].join(" ");
  }

  const pathParts: string[] = [`M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`];
  const t = SMOOTH_TENSION / 6;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * t;
    const cp1y = p1.y + (p2.y - p0.y) * t;
    const cp2x = p2.x - (p3.x - p1.x) * t;
    const cp2y = p2.y - (p3.y - p1.y) * t;

    pathParts.push(
      `C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
    );
  }

  return pathParts.join(" ");
}

export function ElevationProfileChart({ points, minFt, maxFt }: Props) {
  if (points.length < 2) return null;

  let smoothedPoints = points;
  for (let i = 0; i < SMOOTH_PASSES; i += 1) {
    smoothedPoints = weightedSmoothElevation(smoothedPoints);
  }
  smoothedPoints = applyImperceptibleDeadband(smoothedPoints);
  // Blend deadband plateaus so they read as smooth terrain, not stair-steps.
  smoothedPoints = weightedSmoothElevation(smoothedPoints);
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
  const svgPoints = smoothedPoints.map((p) => {
    const x = toSvgX(p.d, maxD);
    const y = toSvgY(p.e, yMin, yMax);
    return { x, y };
  });
  const linePath = buildSmoothLinePath(svgPoints);

  // Close path down to bottom-left for filled area
  const lastX = svgPoints[svgPoints.length - 1]?.x ?? toSvgX(maxD, maxD);
  const firstX = svgPoints[0]?.x ?? toSvgX(0, maxD);
  const bottomY = PAD_TOP + CHART_H;
  const areaPath = `${linePath} L${lastX.toFixed(1)},${bottomY} L${firstX.toFixed(1)},${bottomY} Z`;

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
        <path
          d={linePath}
          fill="none"
          stroke="#15803d"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

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
