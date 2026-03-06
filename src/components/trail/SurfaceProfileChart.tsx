/**
 * SurfaceProfileChart — positional horizontal bar showing surface type along a trail.
 *
 * Each block is colored by surface category:
 *   hard          → slate  (#64748b)  asphalt, concrete, paved
 *   mixed_natural → stone  (#78716c)  gravel, crushed stone, compacted
 *   soft          → green  (#10b981)  dirt, grass, sand, woodchips
 *   slippery      → amber  (#f59e0b)  boardwalk, cobblestone
 *   unknown       → gray   (#cbd5e1)
 *
 * Props:
 *   points      – change-point array: [{d, surface}] where d = start distance in miles
 *   totalMiles  – total trail length (the last surface continues to this distance)
 *
 * No external library. All inline styles.
 */

export type SurfaceProfilePoint = { d: number; surface: string };

type Props = {
  points: SurfaceProfilePoint[];
  totalMiles?: number | null;
};

// Mirrors SurfaceSection.tsx constants — keep in sync
const CATEGORY_LOOKUP: Record<string, "hard" | "mixed_natural" | "soft" | "slippery" | "unknown"> = {
  asphalt: "hard",
  concrete: "hard",
  paved: "hard",
  "hard other": "hard",
  "hard surface (other)": "hard",
  "crushed stone": "mixed_natural",
  gravel: "mixed_natural",
  "fine gravel": "mixed_natural",
  compacted: "mixed_natural",
  unpaved: "mixed_natural",
  dirt: "soft",
  grass: "soft",
  sand: "soft",
  woodchips: "soft",
  "boards wood": "slippery",
  "boardwalk (wood)": "slippery",
  cobblestone: "slippery",
  unknown: "unknown",
};

const CATEGORY_COLOR: Record<string, string> = {
  hard: "#64748b",
  mixed_natural: "#78716c",
  soft: "#10b981",
  slippery: "#f59e0b",
  unknown: "#cbd5e1",
};

const CATEGORY_LABEL: Record<string, string> = {
  hard: "Hard",
  mixed_natural: "Gravel/Compacted",
  soft: "Natural/Soft",
  slippery: "Boardwalk",
  unknown: "Unknown",
};

const LABEL_OVERRIDES: Record<string, string> = {
  asphalt: "Asphalt",
  concrete: "Concrete",
  paved: "Paved",
  "hard other": "Hard (other)",
  "crushed stone": "Crushed stone",
  gravel: "Gravel",
  "fine gravel": "Fine gravel",
  compacted: "Compacted",
  unpaved: "Unpaved",
  dirt: "Dirt",
  grass: "Grass",
  sand: "Sand",
  woodchips: "Woodchips",
  "boards wood": "Boardwalk",
  cobblestone: "Cobblestone",
  unknown: "Unknown",
};

function getCategory(surface: string): string {
  return CATEGORY_LOOKUP[surface] ?? "mixed_natural";
}

function getColor(surface: string): string {
  return CATEGORY_COLOR[getCategory(surface)] ?? "#cbd5e1";
}

function getLabel(surface: string): string {
  return LABEL_OVERRIDES[surface] ?? (surface ? surface.charAt(0).toUpperCase() + surface.slice(1) : "Unknown");
}

function formatMi(v: number): string {
  if (v === 0) return "0 mi";
  return v % 1 === 0 ? `${v} mi` : `${v.toFixed(1)} mi`;
}

const W = 600;
const PAD_LEFT = 4;
const PAD_RIGHT = 4;
const PAD_TOP = 8;
const BAR_H = 36;
const CHART_W = W - PAD_LEFT - PAD_RIGHT;

function toSvgX(d: number, maxD: number): number {
  return PAD_LEFT + (maxD > 0 ? Math.min(1, d / maxD) * CHART_W : 0);
}

export function SurfaceProfileChart({ points, totalMiles }: Props) {
  if (points.length === 0) return null;

  const maxD = (totalMiles != null && Number.isFinite(totalMiles) && totalMiles > 0)
    ? totalMiles
    : points[points.length - 1].d + 0.1;

  const labelY = PAD_TOP + BAR_H + 14;
  const legendY = labelY + 18;

  // Build surface segments: [{x1, x2, surface}]
  const segments = points.map((p, i) => {
    const x1 = toSvgX(p.d, maxD);
    const endD = i < points.length - 1 ? points[i + 1].d : maxD;
    const x2 = toSvgX(endD, maxD);
    return { x1, x2, surface: p.surface };
  });

  // Collect unique categories present (for legend)
  const categoriesPresent = [...new Set(
    points.map(p => getCategory(p.surface))
  )];

  // Mile ticks
  const mileTicks: number[] = [];
  if (maxD > 1) {
    const maxTicks = 6;
    const mileStep = Math.max(1, Math.ceil(Math.floor(maxD) / maxTicks));
    for (let m = mileStep; m < maxD; m += mileStep) mileTicks.push(m);
  }

  // Legend row
  const legendItemW = 130;
  const legendTotalW = categoriesPresent.length * legendItemW;
  const legendStartX = Math.max(PAD_LEFT, (W - legendTotalW) / 2);
  const SVG_H = legendY + 16;

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <svg
        viewBox={`0 0 ${W} ${SVG_H}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label="Trail surface profile chart"
      >
        {/* Surface segments */}
        {segments.map((seg, i) => {
          const w = Math.max(0.5, seg.x2 - seg.x1);
          return (
            <g key={i}>
              <title>{getLabel(seg.surface)}</title>
              <rect
                x={seg.x1}
                y={PAD_TOP}
                width={w}
                height={BAR_H}
                fill={getColor(seg.surface)}
              />
            </g>
          );
        })}

        {/* Border */}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
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

        {/* Intermediate ticks */}
        {mileTicks.map((m) => {
          const x = toSvgX(m, maxD);
          return (
            <g key={m}>
              <line x1={x} y1={PAD_TOP + BAR_H} x2={x} y2={PAD_TOP + BAR_H + 4} stroke="#d1d5db" strokeWidth="1" />
              <text x={x} y={labelY} textAnchor="middle" fontSize="9" fill="#d1d5db" fontFamily="inherit">
                {m}
              </text>
            </g>
          );
        })}

        {/* Legend */}
        {categoriesPresent.map((cat, i) => {
          const x = legendStartX + i * legendItemW;
          return (
            <g key={cat}>
              <rect
                x={x}
                y={legendY}
                width={12}
                height={12}
                fill={CATEGORY_COLOR[cat]}
                stroke="#e5e7eb"
                strokeWidth="1"
                rx="2"
              />
              <text
                x={x + 16}
                y={legendY + 9}
                fontSize="9"
                fill="#6b7280"
                fontFamily="inherit"
              >
                {CATEGORY_LABEL[cat] ?? cat}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
