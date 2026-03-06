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

export type AmenityPoint = { d: number; kind: string };

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
const PAD_LEFT   = 100; // room for emoji + label
const PAD_RIGHT  = 8;
const PAD_TOP    = 6;
const ROW_H      = 26;  // height per amenity lane
const AXIS_H     = 18;  // x-axis labels
const CHART_W    = W - PAD_LEFT - PAD_RIGHT;
const DOT_R      = 5;
const TRACK_H    = 2;   // thin horizontal track line per lane

function toSvgX(d: number, maxD: number): number {
  return PAD_LEFT + (maxD > 0 ? Math.min(1, d / maxD) * CHART_W : 0);
}

export function AmenityProfileChart({ points, totalMiles }: Props) {
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
    <div style={{ width: "100%", overflow: "hidden" }}>
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

          return (
            <g key={kind}>
              {/* Emoji label */}
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
                x1={PAD_LEFT}
                y1={rowCy}
                x2={PAD_LEFT + CHART_W}
                y2={rowCy}
                stroke="#e5e7eb"
                strokeWidth={TRACK_H}
              />

              {/* Dots */}
              {dotsForKind.map((pt, i) => {
                const cx = toSvgX(pt.d, maxD);
                return (
                  <g key={i}>
                    <circle
                      cx={cx}
                      cy={rowCy}
                      r={DOT_R}
                      fill={meta.color}
                      stroke="white"
                      strokeWidth="1.5"
                    />
                    <title>{`${meta.label} at ${pt.d.toFixed(1)} mi`}</title>
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
                fontSize="9"
                fill="#d1d5db"
                fontFamily="inherit"
              >
                {m}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
