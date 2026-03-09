// Design tokens for BarkTrails trail detail pages.
// All values derive from the 4px baseline grid and globals.css CSS vars.
// Import from here — never hardcode these values in components.

// ── Spacing (4px baseline) ────────────────────────────────────────────────────
export const space = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
  8: "32px",
  12: "48px",
} as const;

// ── Border radius ─────────────────────────────────────────────────────────────
export const radius = {
  sm: "6px",
  md: "10px",
  lg: "16px",
  pill: "9999px",
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────
export const shadow = {
  none: "none",
  subtle: "0 1px 3px rgba(0,0,0,0.06)",
  card: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
} as const;

// ── Typography scale ──────────────────────────────────────────────────────────
export const type = {
  pageTitle: {
    fontSize: "1.75rem",
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: "-0.02em",
  },
  sectionTitle: {
    fontSize: "1.125rem",
    fontWeight: 600,
    lineHeight: 1.35,
    letterSpacing: "-0.01em",
  },
  subLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: "0.09em",
    textTransform: "uppercase" as const,
  },
  body: {
    fontSize: "0.9375rem",
    fontWeight: 400,
    lineHeight: 1.6,
  },
  meta: {
    fontSize: "0.8125rem",
    fontWeight: 400,
    lineHeight: 1.45,
  },
  chip: {
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: 1,
  },
} as const;

// ── Color: surface ────────────────────────────────────────────────────────────
export const color = {
  // Page / section backgrounds
  surface:        "#ffffff",
  surfaceSubtle:  "#faf8f5",
  pageBg:         "#f8f5f0",

  // Borders
  border:         "#e5e0d8",
  borderSubtle:   "#f0ece6",

  // Text
  textPrimary:    "#1c1a17",
  textSecondary:  "#6b6457",
  textMuted:      "#a09880",

  // Status — semantic colors mapped to tone names used in components
  good: {
    bg:     "#f0fdf4",
    border: "#bbf7d0",
    text:   "#15803d",
    icon:   "#22c55e",
  },
  warn: {
    bg:     "#fffbeb",
    border: "#fde68a",
    text:   "#b45309",
    icon:   "#f59e0b",
  },
  risk: {
    bg:     "#fef2f2",
    border: "#fecaca",
    text:   "#dc2626",
    icon:   "#ef4444",
  },
  neutral: {
    bg:     "#f8fafc",
    border: "#e2e8f0",
    text:   "#475569",
    icon:   "#94a3b8",
  },

  // Brand greens (mirrors CSS vars)
  green50:  "var(--bark-green-50)",
  green100: "var(--bark-green-100)",
  green200: "var(--bark-green-200)",
  green400: "var(--bark-green-400)",
  green500: "var(--bark-green-500)",
  green600: "var(--bark-green-600)",
  green700: "var(--bark-green-700)",
  green900: "var(--bark-green-900)",
} as const;

// ── Chip height (consistent across all chip variants) ─────────────────────────
export const chipHeight = "28px";

// ── Tone helper — returns bg/border/text/icon for any tone token ──────────────
export type Tone = "good" | "warn" | "risk" | "neutral";

export function toneColors(tone: Tone) {
  return color[tone];
}
