"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  surfaceSignal: string | null;
};

// ── Sort ────────────────────────────────────────────────────────────────────

type SortKey = "recommended" | "longest" | "shortest" | "shade";
const DEFAULT_SORT_KEY: SortKey = "recommended";

const SORT_PARAM_BY_KEY: Record<SortKey, string> = {
  recommended: "recommended",
  longest: "distance-desc",
  shortest: "distance-asc",
  shade: "shade-desc",
};

const SORT_KEY_BY_PARAM = new Map<string, SortKey>(
  Object.entries(SORT_PARAM_BY_KEY).map(([key, value]) => [value, key as SortKey])
);

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recommended", label: "Recommended" },
  { value: "longest",     label: "Distance: Longest first" },
  { value: "shortest",    label: "Distance: Shortest first" },
  { value: "shade",       label: "Shade: Most first" },
];

function sortTrails(trails: TrailCardData[], key: SortKey): TrailCardData[] {
  // "Recommended" is deterministic:
  // 1) trails with more dog-relevant signals first
  // 2) longer trails next
  // 3) alphabetical name tie-breaker
  if (key === "recommended") {
    const score = (trail: TrailCardData): number => {
      let total = 0;
      if (trail.dogsAllowed) total += 1;
      if (trail.leashPolicy) total += 1;
      if (trail.shadePct != null) total += 1;
      if (trail.waterNearPct != null || trail.swimLikely === true) total += 1;
      if (trail.elevationGainFt != null) total += 1;
      return total;
    };
    const copy = [...trails];
    copy.sort((a, b) => {
      const bySignals = score(b) - score(a);
      if (bySignals !== 0) return bySignals;
      const byDistance = (b.distanceMiles ?? 0) - (a.distanceMiles ?? 0);
      if (byDistance !== 0) return byDistance;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }
  const copy = [...trails];
  if (key === "longest")  copy.sort((a, b) => (b.distanceMiles ?? 0) - (a.distanceMiles ?? 0));
  if (key === "shortest") copy.sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));
  if (key === "shade")    copy.sort((a, b) => (b.shadePct ?? -1)     - (a.shadePct ?? -1));
  return copy;
}

// ── Filters ─────────────────────────────────────────────────────────────────

type FilterKey =
  | "leashRequired"
  | "offLeash"
  | "shade"
  | "water"
  | "swim"
  | "easy"
  | "distanceShort"
  | "distanceMedium"
  | "distanceLong"
  | "surfacePaved"
  | "surfaceNatural";

const PRIMARY_FILTER_KEYS: FilterKey[] = [
  "leashRequired",
  "offLeash",
  "shade",
  "water",
  "swim",
  "easy",
];
const DISTANCE_FILTER_KEYS: FilterKey[] = [
  "distanceShort",
  "distanceMedium",
  "distanceLong",
];
const SURFACE_FILTER_KEYS: FilterKey[] = [
  "surfacePaved",
  "surfaceNatural",
];

function normalizeLeashText(input: TrailCardData): string {
  return `${input.leashPolicy ?? ""} ${input.dogsAllowed ?? ""}`.toLowerCase().trim();
}

function isLeashRequiredTrail(input: TrailCardData): boolean {
  const text = normalizeLeashText(input);
  if (!text) return false;
  if (/off[- ]?leash/.test(text)) return false;
  if (!/leash/.test(text)) return false;
  return /required|must be on leash|on leash/.test(text);
}

function isOffLeashFriendlyTrail(input: TrailCardData): boolean {
  const text = normalizeLeashText(input);
  if (!text) return false;
  return /off[- ]?leash|leash optional|leash not required/.test(text);
}

function distanceBand(
  miles: number | null
): "short" | "medium" | "long" | null {
  if (miles == null || !Number.isFinite(miles) || miles <= 0) return null;
  if (miles < 3) return "short";
  if (miles <= 6) return "medium";
  return "long";
}

function surfaceBand(
  signal: string | null
): "paved" | "natural" | null {
  const raw = String(signal ?? "").toLowerCase().trim();
  if (!raw) return null;
  const hasPaved = /\b(paved|asphalt|concrete|boardwalk|sidewalk|hard[- ]?pack)\b/.test(raw);
  const hasNatural = /\b(dirt|gravel|crushed granite|uneven|natural)\b/.test(raw);
  if (hasPaved && hasNatural) return null;
  if (hasPaved) return "paved";
  if (hasNatural) return "natural";
  return null;
}

const FILTER_DEFS: { key: FilterKey; label: string; fn: (t: TrailCardData) => boolean }[] = [
  {
    key: "leashRequired",
    label: "Leash required",
    fn: (t) => isLeashRequiredTrail(t),
  },
  {
    key: "offLeash",
    label: "Off-leash friendly",
    fn: (t) => isOffLeashFriendlyTrail(t),
  },
  {
    key: "shade",
    label: "Shade",
    // shadeProxyPercent is 0–1; 0.10 = trails with ≥10% shaded coverage
    fn: (t) => (t.shadePct ?? 0) >= 0.10,
  },
  {
    key: "water",
    label: "Water",
    // waterNearPercent is 0–1; swimLikely is a boolean flag
    fn: (t) => (t.waterNearPct ?? 0) >= 0.20 || t.swimLikely === true,
  },
  {
    key: "swim",
    label: "Swim",
    fn: (t) => t.swimLikely === true,
  },
  {
    key: "easy",
    label: "Easy walk",
    // Short trail (≤5 mi) with modest elevation gain (≤300 ft or unknown)
    fn: (t) => (t.distanceMiles ?? 99) <= 5 && (t.elevationGainFt ?? 0) <= 300,
  },
  {
    key: "distanceShort",
    label: "Short",
    fn: (t) => distanceBand(t.distanceMiles) === "short",
  },
  {
    key: "distanceMedium",
    label: "Medium",
    fn: (t) => distanceBand(t.distanceMiles) === "medium",
  },
  {
    key: "distanceLong",
    label: "Long",
    fn: (t) => distanceBand(t.distanceMiles) === "long",
  },
  {
    key: "surfacePaved",
    label: "Paved / smoother",
    fn: (t) => surfaceBand(t.surfaceSignal) === "paved",
  },
  {
    key: "surfaceNatural",
    label: "Natural / rougher",
    fn: (t) => surfaceBand(t.surfaceSignal) === "natural",
  },
];

const FILTER_PARAM_BY_KEY: Record<FilterKey, string> = {
  leashRequired: "leash-required",
  offLeash: "off-leash",
  shade: "shade",
  water: "water",
  swim: "swim",
  easy: "easy",
  distanceShort: "short",
  distanceMedium: "medium",
  distanceLong: "long",
  surfacePaved: "paved",
  surfaceNatural: "natural",
};

const FILTER_KEY_BY_PARAM = new Map<string, FilterKey>(
  Object.entries(FILTER_PARAM_BY_KEY).map(([key, value]) => [value, key as FilterKey])
);

// ── Static styles ────────────────────────────────────────────────────────────

const sortRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.625rem" };
const sortLabelStyle: CSSProperties = { fontSize: "0.8125rem", color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap" };
const sortHelpStyle: CSSProperties = { fontSize: "0.75rem", color: "#6b7280", margin: "0 0 0.7rem 0" };
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
const filterGroupsWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.55rem",
  flexWrap: "wrap",
};
const filterSubgroupStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  flexWrap: "wrap",
};
const filterSubgroupSpacedStyle: CSSProperties = {
  ...filterSubgroupStyle,
  marginLeft: "0.3rem",
};
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
const summaryRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
  flexWrap: "wrap",
  marginBottom: "0.6rem",
};
const summaryTextStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: "#4b5563",
  fontWeight: 500,
};
const activeSummaryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  flexWrap: "wrap",
  marginBottom: "0.75rem",
};
const activeSummaryLabelStyle: CSSProperties = {
  fontSize: "0.78rem",
  color: "#6b7280",
  fontWeight: 500,
};
const activeChipBtnStyle: CSSProperties = {
  fontSize: "0.75rem",
  color: "#14532d",
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: "999px",
  padding: "0.2rem 0.55rem",
  cursor: "pointer",
  lineHeight: 1.3,
};
const subgroupClearBtnStyle: CSSProperties = {
  fontSize: "0.75rem",
  padding: "0.15rem 0.45rem",
  borderRadius: "999px",
  border: "1px solid #e5e7eb",
  background: "#ffffff",
  color: "#6b7280",
  cursor: "pointer",
  lineHeight: 1.3,
};
const zeroStateWrapStyle: CSSProperties = {
  border: "1px dashed #d1d5db",
  borderRadius: "10px",
  padding: "0.9rem 1rem",
  marginBottom: "0.9rem",
  background: "#fafafa",
};
const zeroStateTitleStyle: CSSProperties = {
  fontSize: "0.875rem",
  color: "#374151",
  fontWeight: 600,
  margin: 0,
};
const zeroStateBodyStyle: CSSProperties = {
  fontSize: "0.8125rem",
  color: "#6b7280",
  margin: "0.3rem 0 0.55rem",
};
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

function normalizeExclusiveFilters(filters: Set<FilterKey>): Set<FilterKey> {
  const next = new Set(filters);
  const activeDistance = DISTANCE_FILTER_KEYS.filter((key) => next.has(key));
  if (activeDistance.length > 1) {
    for (const key of activeDistance.slice(1)) {
      next.delete(key);
    }
  }
  const activeSurface = SURFACE_FILTER_KEYS.filter((key) => next.has(key));
  if (activeSurface.length > 1) {
    for (const key of activeSurface.slice(1)) {
      next.delete(key);
    }
  }
  return next;
}

function parseSortFromUrl(rawSort: string | null): SortKey {
  if (!rawSort) return DEFAULT_SORT_KEY;
  return SORT_KEY_BY_PARAM.get(rawSort) ?? DEFAULT_SORT_KEY;
}

function parseFiltersFromUrl(rawFilters: string | null): Set<FilterKey> {
  if (!rawFilters) return new Set<FilterKey>();
  const parsed = new Set<FilterKey>();
  for (const token of rawFilters.split(",")) {
    const slug = token.trim().toLowerCase();
    if (!slug) continue;
    const key = FILTER_KEY_BY_PARAM.get(slug);
    if (key) parsed.add(key);
  }
  return normalizeExclusiveFilters(parsed);
}

function serializeFiltersForUrl(filters: Set<FilterKey>): string {
  const ordered = FILTER_DEFS
    .map((entry) => entry.key)
    .filter((key) => filters.has(key))
    .map((key) => FILTER_PARAM_BY_KEY[key]);
  return ordered.join(",");
}

function joinPhraseParts(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function readableFilterDescriptor(activeKeys: FilterKey[]): string {
  const byKey: Partial<Record<FilterKey, string>> = {
    leashRequired: "leash-required",
    offLeash: "off-leash friendly",
    shade: "shaded",
    water: "water-friendly",
    swim: "swim-friendly",
    distanceShort: "short",
    distanceMedium: "medium-length",
    distanceLong: "long",
    surfacePaved: "paved / smoother",
    surfaceNatural: "natural / rougher",
  };
  const descriptors = activeKeys
    .filter((key) => key !== "easy")
    .map((key) => byKey[key])
    .filter((value): value is string => Boolean(value));
  if (descriptors.length <= 3) {
    return joinPhraseParts(descriptors);
  }
  const shown = descriptors.slice(0, 3);
  const extraCount = descriptors.length - shown.length;
  return `${joinPhraseParts(shown)} +${extraCount} more`;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CityTrailCardList({ trails }: { trails: TrailCardData[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sortKey = useMemo(
    () => parseSortFromUrl(searchParams.get("sort")),
    [searchParams]
  );
  const activeFilters = useMemo(
    () => parseFiltersFromUrl(searchParams.get("filters")),
    [searchParams]
  );

  const updateUrlState = useCallback(
    (nextSort: SortKey, nextFiltersInput: Set<FilterKey>) => {
      const nextFilters = normalizeExclusiveFilters(nextFiltersInput);
      const params = new URLSearchParams(searchParams.toString());
      if (nextSort === DEFAULT_SORT_KEY) {
        params.delete("sort");
      } else {
        params.set("sort", SORT_PARAM_BY_KEY[nextSort]);
      }
      const serializedFilters = serializeFiltersForUrl(nextFilters);
      if (!serializedFilters) {
        params.delete("filters");
      } else {
        params.set("filters", serializedFilters);
      }

      const currentQuery = searchParams.toString();
      const nextQuery = params.toString();
      const currentUrl = currentQuery ? `${pathname}?${currentQuery}` : pathname;
      const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      if (nextUrl !== currentUrl) {
        router.push(nextUrl, { scroll: false });
      }
    },
    [pathname, router, searchParams]
  );

  const toggleFilter = useCallback((key: FilterKey) => {
    const isDistanceFilter = DISTANCE_FILTER_KEYS.includes(key);
    const isSurfaceFilter = SURFACE_FILTER_KEYS.includes(key);
    const wasActive = activeFilters.has(key);
    const next = new Set(activeFilters);

    if (isDistanceFilter) {
      for (const distanceKey of DISTANCE_FILTER_KEYS) {
        next.delete(distanceKey);
      }
      if (!wasActive) next.add(key);
      updateUrlState(sortKey, next);
      return;
    }

    if (isSurfaceFilter) {
      for (const surfaceKey of SURFACE_FILTER_KEYS) {
        next.delete(surfaceKey);
      }
      if (!wasActive) next.add(key);
      updateUrlState(sortKey, next);
      return;
    }

    next.has(key) ? next.delete(key) : next.add(key);
    updateUrlState(sortKey, next);
  }, [activeFilters, sortKey, updateUrlState]);

  // Filter → sort pipeline
  const filtered = useMemo(() => {
    if (activeFilters.size === 0) return trails;
    return trails.filter((t) =>
      [...activeFilters].every((key) => FILTER_DEFS.find((f) => f.key === key)!.fn(t))
    );
  }, [trails, activeFilters]);

  const sorted = useMemo(() => sortTrails(filtered, sortKey), [filtered, sortKey]);
  const filterLabelByKey = useMemo(
    () => new Map(FILTER_DEFS.map((entry) => [entry.key, entry.label])),
    []
  );
  const filterDefByKey = useMemo(
    () => new Map(FILTER_DEFS.map((entry) => [entry.key, entry])),
    []
  );
  const activeFilterKeys = useMemo(
    () => FILTER_DEFS.map((entry) => entry.key).filter((key) => activeFilters.has(key)),
    [activeFilters]
  );
  const hasActiveDistanceFilter = useMemo(
    () => DISTANCE_FILTER_KEYS.some((key) => activeFilters.has(key)),
    [activeFilters]
  );
  const hasActiveSurfaceFilter = useMemo(
    () => SURFACE_FILTER_KEYS.some((key) => activeFilters.has(key)),
    [activeFilters]
  );
  const cityName = trails[0]?.cityName ?? "this city";
  const activeSummaryLine = useMemo(() => {
    if (activeFilterKeys.length === 0) {
      return `Showing ${sorted.length} of ${trails.length} ${trails.length === 1 ? "trail" : "trails"}`;
    }
    const descriptor = readableFilterDescriptor(activeFilterKeys);
    const hasEasy = activeFilterKeys.includes("easy");
    const noun =
      sorted.length === 1
        ? hasEasy ? "easy walk" : "trail"
        : hasEasy ? "easy walks" : "trails";
    if (!descriptor) {
      return `Showing ${sorted.length} ${noun} in ${cityName}`;
    }
    return `Showing ${sorted.length} ${descriptor} ${noun} in ${cityName}`;
  }, [activeFilterKeys, cityName, sorted.length, trails.length]);

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
          onChange={(e) => updateUrlState(e.target.value as SortKey, activeFilters)}
          aria-describedby="trail-sort-help"
          style={selectStyle}
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      <p id="trail-sort-help" style={sortHelpStyle}>
        Sort trails by recommendation, distance, or shade.
      </p>

      {/* Filter chips */}
      <div role="group" aria-label="Filter by dog needs" style={filterGroupStyle}>
        <span style={filterLabelStyle}>Dog needs:</span>
        <div style={filterGroupsWrapStyle}>
          {[PRIMARY_FILTER_KEYS, DISTANCE_FILTER_KEYS, SURFACE_FILTER_KEYS].map((group, index) => (
            <div
              key={`filter-group-${index}`}
              style={index === 0 ? filterSubgroupStyle : filterSubgroupSpacedStyle}
            >
              {group.map((key) => {
                const f = filterDefByKey.get(key);
                if (!f) return null;
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
            </div>
          ))}
        </div>
      </div>

      <div style={summaryRowStyle} aria-live="polite">
        <p style={summaryTextStyle}>{activeSummaryLine}</p>
      </div>

      {activeFilters.size > 0 && (
        <div style={activeSummaryStyle}>
          <span style={activeSummaryLabelStyle}>Active filters:</span>
          {activeFilterKeys.map((key) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              aria-label={`Remove ${filterLabelByKey.get(key) ?? key} filter`}
              style={activeChipBtnStyle}
            >
              {filterLabelByKey.get(key) ?? key} ×
            </button>
          ))}
          {hasActiveDistanceFilter && (
            <button
              onClick={() => {
                const next = new Set(activeFilters);
                for (const key of DISTANCE_FILTER_KEYS) next.delete(key);
                updateUrlState(sortKey, next);
              }}
              aria-label="Clear active distance filter"
              style={subgroupClearBtnStyle}
            >
              Clear distance
            </button>
          )}
          {hasActiveSurfaceFilter && (
            <button
              onClick={() => {
                const next = new Set(activeFilters);
                for (const key of SURFACE_FILTER_KEYS) next.delete(key);
                updateUrlState(sortKey, next);
              }}
              aria-label="Clear active surface filter"
              style={subgroupClearBtnStyle}
            >
              Clear surface
            </button>
          )}
          <button
            onClick={() => updateUrlState(sortKey, new Set())}
            aria-label="Clear all filters"
            style={clearBtnStyle}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Empty state */}
      {sorted.length === 0 && (
        <div style={zeroStateWrapStyle} role="status">
          <p style={zeroStateTitleStyle}>No trails match these filters.</p>
          <p style={zeroStateBodyStyle}>Try removing one or more filters.</p>
          {activeFilters.size > 0 && (
            <button
              onClick={() => updateUrlState(sortKey, new Set())}
              aria-label="Clear all filters and show all trails"
              style={clearBtnStyle}
            >
              Clear all filters
            </button>
          )}
        </div>
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
