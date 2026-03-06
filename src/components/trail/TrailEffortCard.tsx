"use client";

/**
 * TrailEffortCard — compact "Difficulty Scale Bar" rating module.
 *
 * Single horizontal scale bar with four checkpoints (Easy → Strenuous), filled track
 * to the active level, and metric chips. Uses minimal vertical space while showing
 * current difficulty, full scale, and justifying metrics.
 */

import type { CSSProperties } from "react";
import { useState, useRef, useEffect } from "react";

export type EffortLevel = "easy" | "moderate" | "challenging" | "strenuous";

export type TrailEffortMetrics = {
  gainFt?: number | null;
  gainPerMileFt?: number | null;
  /** Steep sections: Low | Med | High — only set when not contradicting main label */
  steepSectionsLabel?: "Low" | "Med" | "High" | null;
  steepnessLabel?: string | null;
  longestClimbMi?: number | null;
};

const LEVEL_ORDER: EffortLevel[] = ["easy", "moderate", "challenging", "strenuous"];

const DEFAULT_LABELS: Record<EffortLevel, string> = {
  easy: "Easy",
  moderate: "Moderate",
  challenging: "Challenging",
  strenuous: "Strenuous",
};

export function levelIndex(level: EffortLevel): 1 | 2 | 3 | 4 {
  const i = LEVEL_ORDER.indexOf(level);
  return (i >= 0 ? i + 1 : 1) as 1 | 2 | 3 | 4;
}

export function indexToLabel(index: 1 | 2 | 3 | 4): string {
  const level = LEVEL_ORDER[index - 1];
  return level ? DEFAULT_LABELS[level] : "Moderate";
}

export function levelCopy(level: EffortLevel): { label: string; description: string } {
  switch (level) {
    case "easy":
      return { label: "Easy", description: "Flat or gently rolling. Comfortable for almost all dogs." };
    case "moderate":
      return { label: "Moderate", description: "Gentle hills. Most healthy adult dogs will enjoy this." };
    case "challenging":
      return { label: "Challenging", description: "Noticeable climbs. Better for fit, active dogs." };
    case "strenuous":
      return { label: "Strenuous", description: "Steep sections throughout. Best for athletic dogs." };
    default:
      return { label: "Moderate", description: "Gentle hills. Most healthy adult dogs will enjoy this." };
  }
}

function formatFeet(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString()} ft`;
}

function formatGainPerMile(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v)} ft/mi`;
}

const ORANGE = "#ea580c";
const TRACK_NEUTRAL = "#e5e7eb";
const SLATE_500 = "#64748b";
const SLATE_900 = "#0f172a";
const MARKER_INACTIVE = "#9ca3af";

function labelStyle(value: EffortLevel, level: EffortLevel): CSSProperties {
  const isActive = level === value;
  return {
    fontSize: "0.6875rem",
    fontWeight: isActive ? 600 : 500,
    color: isActive ? SLATE_900 : SLATE_500,
  };
}

// ---------------------------------------------------------------------------
// DifficultyScale — horizontal track with 4 checkpoints, fill to active
// ---------------------------------------------------------------------------
export type DifficultyScaleProps = {
  value: EffortLevel;
};

function DifficultyScale({ value }: DifficultyScaleProps) {
  const index = levelIndex(value);
  // Fill from start to the segment before the active marker: (index - 1) / 3 gives 0, 0.33, 0.66, 1
  const fillFraction = index <= 1 ? 0 : (index - 1) / 3;

  return (
    <div
      role="img"
      aria-label={`Difficulty: ${DEFAULT_LABELS[value]} (${index} of 4)`}
      style={{ width: "100%", marginTop: "0.5rem" }}
    >
      {/* Labels above markers — 3 segments so labels align with 0%, 33.33%, 66.66%, 100% */}
      <div
        style={{
          display: "flex",
          width: "100%",
          marginBottom: "0.25rem",
        }}
      >
        <div style={{ flex: 1, display: "flex", justifyContent: "space-between", paddingRight: "2px" }}>
          <span style={labelStyle(value, "easy")}>{DEFAULT_LABELS.easy}</span>
          <span style={labelStyle(value, "moderate")}>{DEFAULT_LABELS.moderate}</span>
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", paddingRight: "2px" }}>
          <span style={labelStyle(value, "challenging")}>{DEFAULT_LABELS.challenging}</span>
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <span style={labelStyle(value, "strenuous")}>{DEFAULT_LABELS.strenuous}</span>
        </div>
      </div>
      {/* Track + markers */}
      <div style={{ position: "relative", width: "100%", height: 4, display: "flex", alignItems: "center" }}>
        {/* Background track */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 2,
            backgroundColor: TRACK_NEUTRAL,
          }}
        />
        {/* Filled portion */}
        {fillFraction > 0 && (
          <div
            style={{
              position: "absolute",
              left: 0,
              width: `${fillFraction * 100}%`,
              height: 4,
              borderRadius: "2px 0 0 2px",
              backgroundColor: ORANGE,
            }}
          />
        )}
        {/* 4 markers — evenly spaced (0%, 33.33%, 66.66%, 100%) */}
        {LEVEL_ORDER.map((level, i) => {
          const isActive = level === value;
          const leftPct = i === 0 ? 0 : (i / 3) * 100;
          return (
            <div
              key={level}
              style={{
                position: "absolute",
                left: `${leftPct}%`,
                transform: "translateX(-50%)",
                width: isActive ? 10 : 8,
                height: isActive ? 10 : 8,
                borderRadius: "50%",
                backgroundColor: isActive ? ORANGE : MARKER_INACTIVE,
                border: isActive ? "none" : "2px solid #fff",
                boxSizing: "border-box",
                zIndex: 1,
              }}
              aria-hidden
            />
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricChips — Gain, Gain/mi, Steep sections (display "Medium" for Med)
// ---------------------------------------------------------------------------
function MetricChips({ metrics }: { metrics: TrailEffortMetrics }) {
  const chips: Array<{ label: string; value: string }> = [];
  if (metrics.gainFt != null && Number.isFinite(metrics.gainFt)) {
    chips.push({ label: "Gain", value: formatFeet(metrics.gainFt) });
  }
  if (metrics.gainPerMileFt != null && Number.isFinite(metrics.gainPerMileFt)) {
    chips.push({ label: "Gain/mi", value: formatGainPerMile(metrics.gainPerMileFt) });
  }
  if (metrics.steepSectionsLabel != null) {
    const display =
      metrics.steepSectionsLabel === "Med" ? "Medium" : metrics.steepSectionsLabel;
    chips.push({ label: "Steep sections", value: display });
  } else if (metrics.steepnessLabel != null && metrics.steepnessLabel.trim() !== "") {
    chips.push({ label: "Steepness", value: metrics.steepnessLabel });
  }
  if (metrics.longestClimbMi != null && Number.isFinite(metrics.longestClimbMi)) {
    chips.push({ label: "Longest climb", value: `${metrics.longestClimbMi.toFixed(1)} mi` });
  }

  if (chips.length === 0) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem", alignItems: "center" }}>
      {chips.map((c) => (
        <span
          key={c.label}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            padding: "0.25rem 0.5rem",
            borderRadius: "9999px",
            border: "1px solid #e5e7eb",
            backgroundColor: "#f9fafb",
            fontSize: "0.75rem",
            color: "#374151",
            fontWeight: 500,
          }}
        >
          <span style={{ color: "#6b7280", fontWeight: 600 }}>{c.label}:</span>
          {c.value}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// How we rate effort — button + popover
// ---------------------------------------------------------------------------
function EffortInfoPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onEscape);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onEscape);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.2rem",
          padding: "0.15rem 0",
          fontSize: "0.6875rem",
          color: SLATE_500,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        <InfoIcon />
        <span>How we rate effort</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="How we rate effort"
          style={{
            position: "absolute",
            zIndex: 20,
            top: "100%",
            left: 0,
            marginTop: "0.25rem",
            padding: "0.625rem",
            minWidth: "12rem",
            maxWidth: "16rem",
            borderRadius: "0.5rem",
            border: "1px solid #e5e7eb",
            backgroundColor: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            fontSize: "0.75rem",
            color: SLATE_900,
            lineHeight: 1.45,
          }}
        >
          <ul style={{ margin: 0, paddingLeft: "1rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
            <li>We rate effort mainly from elevation gain and gain per mile.</li>
            <li>Steeper trails feel harder even if they&apos;re short.</li>
            <li>Ratings are for a typical dog on-leash.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function InfoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function ratedFromLine(metrics: TrailEffortMetrics): string {
  const gain = metrics.gainFt != null && Number.isFinite(metrics.gainFt) ? metrics.gainFt : null;
  const gainPerMi =
    metrics.gainPerMileFt != null && Number.isFinite(metrics.gainPerMileFt)
      ? metrics.gainPerMileFt
      : null;
  if (gain != null && gainPerMi != null) {
    return `Rated from ${formatFeet(gain)} gain + ${formatGainPerMile(gainPerMi)}.`;
  }
  if (gain != null) {
    return `Rated from ${formatFeet(gain)} gain and steep sections.`;
  }
  return "Rated from elevation gain and steep sections.";
}

// ---------------------------------------------------------------------------
// TrailEffortCard
// ---------------------------------------------------------------------------
export type TrailEffortCardProps = {
  effortLevel: EffortLevel;
  metrics: TrailEffortMetrics;
};

export function TrailEffortCard({ effortLevel, metrics }: TrailEffortCardProps) {
  const { label, description } = levelCopy(effortLevel);

  return (
    <div className="trail-effort-card-root">
      {/* Content row: left = title + subtitle + scale; right = chips (desktop) */}
      <div className="trail-effort-content-row">
        <div className="trail-effort-left">
          <h3
            style={{
              fontSize: "1.5rem",
              fontWeight: 800,
              lineHeight: 1.2,
              color: "#111827",
              margin: 0,
            }}
            id="trail-effort-label"
          >
            {label}
          </h3>
          <p
            style={{
              margin: "0.2rem 0 0",
              fontSize: "0.875rem",
              color: "#374151",
              lineHeight: 1.45,
            }}
          >
            {description}
          </p>
          <DifficultyScale value={effortLevel} />
        </div>
        <div className="trail-effort-chips-wrap">
          <MetricChips metrics={metrics} />
        </div>
      </div>

      {/* Below scale: rated-from + how we rate */}
      <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.6875rem", color: "#6b7280", lineHeight: 1.4 }}>
          {ratedFromLine(metrics)}
        </span>
        <EffortInfoPopover />
      </div>
    </div>
  );
}
