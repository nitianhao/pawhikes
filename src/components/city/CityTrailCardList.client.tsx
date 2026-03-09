"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { trailGuideAriaLabel } from "@/lib/seo/anchors";

export type TrailCardData = {
  id: string;
  name: string;
  href: string;
  cityName: string;
  stateName: string;
  distance: string;
  distanceMiles: number | null;
  dogsAllowed: string | null;
  leashPolicy: string | null;
  shade: string | null;
  shadePct: number | null;
  heat: string | null;
  waterNearPct: number | null;
  swimLikely: boolean | null;
  elevationGainFt: number | null;
};

// ── Sort ────────────────────────────────────────────────────────────────────

type SortKey = "default" | "longest" | "shortest" | "shade";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "default",  label: "Default" },
  { value: "longest",  label: "Longest first" },
  { value: "shortest", label: "Shortest first" },
  { value: "shade",    label: "Most shade" },
];

function sortTrails(trails: TrailCardData[], key: SortKey): TrailCardData[] {
  if (key === "default") return trails;
  const copy = [...trails];
  if (key === "longest")  copy.sort((a, b) => (b.distanceMiles ?? 0) - (a.distanceMiles ?? 0));
  if (key === "shortest") copy.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
  if (key === "shade")    copy.sort((a, b) => (b.shadePct ?? -1)     - (a.shadePct ?? -1));
  return copy;
}

// ── Filters ─────────────────────────────────────────────────────────────────

type FilterKey = "shade" | "water" | "easy";

const FILTER_DEFS: { key: FilterKey; label: string; fn: (t: TrailCardData) => boolean }[] = [
  {
    key: "shade",
    label: "Shade",
    // shadeProxyPercent is 0–1; 0.10 = trails with ≥10% shaded coverage
    fn: (t) => (t.shadePct ?? 0) >= 0.10,
  },
  {
    key: "water",
    label: "Water access",
    // waterNearPercent is 0–1; swimLikely is a boolean flag
    fn: (t) => (t.waterNearPct ?? 0) >= 0.20 || t.swimLikely === true,
  },
  {
    key: "easy",
    label: "Easy walk",
    // Short trail (≤5 mi) with modest elevation gain (≤300 ft or unknown)
    fn: (t) => (t.distanceMiles ?? 99) <= 5 && (t.elevationGainFt ?? 0) <= 300,
  },
];

// ── Static styles ────────────────────────────────────────────────────────────

const sortRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" };
const sortLabelStyle: CSSProperties = { fontSize: "0.8125rem", color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap" };
const selectStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: "#111827",
  background: "#ffffff",
  border: "1px solid #d1d5db",
  borderRadius: "6px",
  padding: "0.25rem 0.5rem",
  cursor: "pointer",
  outline: "none",
};
const filterGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.875rem", flexWrap: "wrap" };
const filterLabelStyle: CSSProperties = { fontSize: "0.8125rem", color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap" };
const clearBtnStyle: CSSProperties = {
  fontSize: "0.8125rem",
  padding: "0.2rem 0.5rem",
  borderRadius: "999px",
  border: "1px solid transparent",
  background: "transparent",
  color: "#6b7280",
  cursor: "pointer",
  textDecoration: "underline",
  textDecorationColor: "#d1d5db",
};
const emptyStateStyle: CSSProperties = { fontSize: "0.875rem", color: "#6b7280", padding: "1.5rem 0" };
const gridStyle: CSSProperties = {
  listStyle: "none",
  padding: 0,
  margin: 0,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
  gap: "0.75rem",
};
const cardLinkStyle: CSSProperties = {
  display: "block",
  padding: "0.875rem 1rem",
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  textDecoration: "none",
  color: "inherit",
  transition: "box-shadow 0.15s, border-color 0.15s",
};
const cardHeaderStyle: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.55rem" };
const cardNameStyle: CSSProperties = { fontWeight: 600, fontSize: "0.9375rem", color: "#111827", lineHeight: 1.3, minWidth: 0 };
const cardDistStyle: CSSProperties = { fontWeight: 700, fontSize: "0.9375rem", color: "#14532d", whiteSpace: "nowrap", flexShrink: 0 };
const chipRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.25rem", marginBottom: "0.3rem" };
const envChipRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.25rem" };
const policyChipStyle: CSSProperties = {
  fontSize: "0.72rem",
  color: "#166534",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "5px",
  padding: "1px 6px",
  whiteSpace: "nowrap",
};
const envChipStyle: CSSProperties = {
  fontSize: "0.72rem",
  color: "#6b7280",
  background: "#f9fafb",
  border: "1px solid #e5e7eb",
  borderRadius: "5px",
  padding: "1px 6px",
  whiteSpace: "nowrap",
};

// ── Component ────────────────────────────────────────────────────────────────

export function CityTrailCardList({ trails }: { trails: TrailCardData[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  // Filter → sort pipeline
  const filtered = useMemo(() => {
    if (activeFilters.size === 0) return trails;
    return trails.filter((t) =>
      [...activeFilters].every((key) => FILTER_DEFS.find((f) => f.key === key)!.fn(t))
    );
  }, [trails, activeFilters]);

  const sorted = useMemo(() => sortTrails(filtered, sortKey), [filtered, sortKey]);

  // Notify map of visible trail IDs whenever filter changes
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("trail:filter", {
        detail: { ids: activeFilters.size > 0 ? filtered.map((t) => t.id) : null },
      })
    );
  }, [filtered, activeFilters.size]);

  // Map pin hover → highlight matching card
  useEffect(() => {
    function onHover(e: Event) {
      const { id } = (e as CustomEvent<{ id: string | null }>).detail;
      document.querySelectorAll<HTMLElement>("[data-trail-id]").forEach((el) => {
        const card = el.querySelector<HTMLElement>(".city-trail-card");
        if (!card) return;
        if (id && el.dataset.trailId === id) {
          card.classList.add("city-trail-card--highlighted");
        } else {
          card.classList.remove("city-trail-card--highlighted");
        }
      });
    }
    window.addEventListener("trail:hover", onHover);
    return () => window.removeEventListener("trail:hover", onHover);
  }, []);

  // Map pin click → scroll matching card into view
  useEffect(() => {
    function onFocus(e: Event) {
      const { id } = (e as CustomEvent<{ id: string }>).detail;
      const li = document.querySelector<HTMLElement>(`[data-trail-id="${CSS.escape(id)}"]`);
      if (!li) return;
      li.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const card = li.querySelector<HTMLElement>(".city-trail-card");
      if (!card) return;
      card.classList.add("city-trail-card--highlighted");
      setTimeout(() => card.classList.remove("city-trail-card--highlighted"), 1200);
    }
    window.addEventListener("trail:focus", onFocus);
    return () => window.removeEventListener("trail:focus", onFocus);
  }, []);

  return (
    <div>
      {/* Sort control */}
      <div style={sortRowStyle}>
        <label htmlFor="trail-sort" style={sortLabelStyle}>
          Sort by:
        </label>
        <select
          id="trail-sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={selectStyle}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Filter chips */}
      <div role="group" aria-label="Filter by dog needs" style={filterGroupStyle}>
        <span style={filterLabelStyle}>Dog needs:</span>
        {FILTER_DEFS.map((f) => {
          const active = activeFilters.has(f.key);
          return (
            <button
              key={f.key}
              onClick={() => toggleFilter(f.key)}
              aria-pressed={active}
              style={{
                fontSize: "0.8125rem",
                padding: "0.2rem 0.625rem",
                borderRadius: "999px",
                border: `1px solid ${active ? "#86efac" : "#d1d5db"}`,
                background: active ? "#f0fdf4" : "#ffffff",
                color: active ? "#15803d" : "#374151",
                fontWeight: active ? 600 : 400,
                cursor: "pointer",
                transition: "border-color 0.12s, background 0.12s, color 0.12s",
                lineHeight: 1.4,
              }}
            >
              {f.label}
            </button>
          );
        })}
        {activeFilters.size > 0 && (
          <button
            onClick={() => setActiveFilters(new Set())}
            aria-label="Clear all filters"
            style={clearBtnStyle}
          >
            Clear
          </button>
        )}
      </div>

      {/* Empty state */}
      {sorted.length === 0 && (
        <p style={emptyStateStyle}>No trails match the selected filters.</p>
      )}

      {/* Trail grid */}
      <ul style={gridStyle}>
        {sorted.map((trail) => {
          const trailAriaLabel = trailGuideAriaLabel({
            trailName: trail.name,
            cityName: trail.cityName,
            stateName: trail.stateName,
          });
          return (
          <li key={trail.id} data-trail-id={trail.id}>
            <Link
              href={trail.href}
              aria-label={trailAriaLabel}
              title={trailAriaLabel}
              style={cardLinkStyle}
              className="city-trail-card"
              onMouseEnter={() =>
                window.dispatchEvent(new CustomEvent("trail:hover", { detail: { id: trail.id } }))
              }
              onMouseLeave={() =>
                window.dispatchEvent(new CustomEvent("trail:hover", { detail: { id: null } }))
              }
            >
              <div style={cardHeaderStyle}>
                <div style={cardNameStyle}>{trail.name}</div>
                <div style={cardDistStyle}>{trail.distance}</div>
              </div>

              {(trail.dogsAllowed || trail.leashPolicy) && (
                <div style={chipRowStyle}>
                  {trail.dogsAllowed && <PolicyChip label={`🐾 ${trail.dogsAllowed}`} />}
                  {trail.leashPolicy && <PolicyChip label={`Leash: ${trail.leashPolicy}`} />}
                </div>
              )}

              {(trail.shade || trail.heat) && (
                <div style={envChipRowStyle}>
                  {trail.shade && <EnvChip label={`${trail.shade} shade`} />}
                  {trail.heat && <EnvChip label={`${trail.heat} heat`} />}
                </div>
              )}
            </Link>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function PolicyChip({ label }: { label: string }) {
  return <span style={policyChipStyle}>{label}</span>;
}

function EnvChip({ label }: { label: string }) {
  return <span style={envChipStyle}>{label}</span>;
}
