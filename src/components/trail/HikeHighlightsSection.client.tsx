"use client";

import { useState, useCallback, useId, useMemo, useRef } from "react";
import {
  ExternalLink,
  Landmark,
  MapPin,
  TrainFront,
  Milestone,
  Search,
  Filter,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import type { Highlight, HighlightRaw } from "@/lib/highlights/types";
import {
  getSubtitle,
  matchesHighlightSearch,
  normalizeHighlights,
  sortHighlights,
  type HighlightSort,
} from "@/lib/highlights/highlights.utils";

// ---------------------------------------------------------------------------
// Icon mapping (lucide-react, no new deps)
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
  pin: MapPin,
  landmark: Landmark,
  train: TrainFront,
  memorial: Landmark,
  ruins: Landmark,
};

function HighlightIcon({
  iconKey,
  size = 16,
  style,
}: {
  iconKey: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const Icon = ICON_MAP[iconKey] ?? MapPin;
  return <Icon size={size} style={style} />;
}

const BAND_LABELS: Record<Highlight["distanceBand"], string> = {
  "on-trail": "On-trail",
  "very-close": "Very close",
  close: "Close",
  nearby: "Nearby",
  "off-route": "Off-route",
};

const TOP_TAG_ORDER = ["name", "historic", "ruins", "tourism", "natural", "amenity", "building", "surface", "access"];

function pickTopTags(tags: Record<string, string>, limit = 6): [string, string][] {
  const used = new Set<string>();
  const out: [string, string][] = [];
  for (const key of TOP_TAG_ORDER) {
    if (tags[key]) {
      out.push([key, tags[key]]);
      used.add(key);
    }
    if (out.length >= limit) return out;
  }
  for (const [k, v] of Object.entries(tags)) {
    if (used.has(k)) continue;
    out.push([k, v]);
    if (out.length >= limit) return out;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Clipboard copy button
// ---------------------------------------------------------------------------

function CopyCoords({ lat, lng }: { lat: number; lng: number }) {
  const [copied, setCopied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const handleCopy = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setUnsupported(true);
      return;
    }
    navigator.clipboard
      .writeText(`${lat},${lng}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setUnsupported(true));
  }, [lat, lng]);

  if (unsupported) {
    return <span style={S.unsupported}>Copy not supported</span>;
  }

  return (
    <button
      type="button"
      style={S.iconBtn}
      title="Copy coordinates"
      onClick={(e) => {
        e.stopPropagation();
        handleCopy();
      }}
    >
      {copied ? <Check size={14} style={{ color: "#059669" }} /> : <Copy size={14} />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Accordion row
// ---------------------------------------------------------------------------

const SORT_OPTIONS: Array<{ id: HighlightSort; label: string }> = [
  { id: "closest", label: "Closest first" },
  { id: "farthest", label: "Farthest first" },
  { id: "name", label: "Name A–Z" },
  { id: "category", label: "Category" },
];

function HighlightRow({ h }: { h: Highlight }) {
  const [expanded, setExpanded] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const panelId = useId();
  const topTags = pickTopTags(h.tags);
  const allTags = Object.entries(h.tags);
  const subtitle = getSubtitle(h);

  return (
    <div style={S.rowWrapper}>
      <div style={S.rowBtn}>
        <div style={S.rowLeft}>
          <div style={S.rowIcon}>
            <HighlightIcon iconKey={h.iconKey} size={16} style={{ color: "#6366f1" }} />
          </div>
          <div style={S.rowInfo}>
            <p style={S.rowTitle}>{h.title || "Unknown highlight"}</p>
            <p style={S.rowSubtitle}>{subtitle}</p>
            <span style={S.bandBadge}>{BAND_LABELS[h.distanceBand]}</span>
          </div>
        </div>
        <div style={S.distanceCol}>
          <span style={S.rowDist}>{h.distanceShort}</span>
          <span style={S.distanceSub}>from trail</span>
        </div>
        <div style={S.rowActionsTop}>
          {h.osmUrl ? (
            <a
              href={h.osmUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={S.inlineBtn}
              title="Open in OpenStreetMap"
            >
              Open OSM
            </a>
          ) : null}
          <CopyCoords lat={h.lat} lng={h.lng} />
          <button
            type="button"
            style={S.inlineBtn}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((prev) => !prev)}
          >
            Details
            <ChevronDown
              size={14}
              style={{
                color: "#94a3b8",
                transition: "transform 150ms ease",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div id={panelId} role="region" style={S.detailPanel}>
          {h.isIncomplete ? <p style={S.warning}>Incomplete data from source</p> : null}
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Distance from trail</span>
            <span style={S.detailVal}>{h.distanceLong} · {BAND_LABELS[h.distanceBand]}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Lat</span>
            <span style={S.detailVal}>{h.lat}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Lng</span>
            <span style={S.detailVal}>{h.lng}</span>
          </div>
          <div style={{ marginTop: "0.35rem" }}>
            <CopyCoords lat={h.lat} lng={h.lng} />
          </div>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>OSM ref</span>
            <span style={S.detailVal}>
              {h.osmType}/{(h.osmNumericId ?? h.osmIdRaw) || "—"}
            </span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Kind</span>
            <span style={S.detailVal}>{h.kind || "—"}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Category</span>
            <span style={S.detailVal}>{h.categoryLabel}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailLabel}>Type</span>
            <span style={S.detailVal}>{h.typeLabel ?? "—"}</span>
          </div>
          <div style={S.tagsList}>
            <h4 style={S.tagsHeading}>Top tags</h4>
            {topTags.length === 0 ? <p style={S.emptyNote}>No tags</p> : null}
            {topTags.map(([k, v]) => (
              <div key={`top-${k}`} style={S.detailRow}>
                <span style={S.detailLabel}>{k}</span>
                <span style={S.detailVal}>{v}</span>
              </div>
            ))}
            <button type="button" style={S.linkBtn} onClick={() => setShowAllTags((v) => !v)}>
              {showAllTags ? "Hide all tags" : `Show all tags (${allTags.length})`}
            </button>
            {showAllTags ? (
              <div style={{ marginTop: "0.35rem" }}>
                {allTags.map(([k, v]) => (
                  <div key={`all-${k}`} style={S.detailRow}>
                    <span style={S.detailLabel}>{k}</span>
                    <span style={S.detailVal}>{v}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div style={S.rowActions}>
            {h.osmUrl ? (
              <a href={h.osmUrl} target="_blank" rel="noopener noreferrer" style={S.inlineBtn}>
                Open in OpenStreetMap <ExternalLink size={13} />
              </a>
            ) : null}
            <button type="button" style={S.linkBtn} onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide raw data" : "View raw data"}
            </button>
          </div>
          {showRaw ? <pre style={S.rawPre}>{JSON.stringify(h.raw, null, 2)}</pre> : null}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chips (summary row)
// ---------------------------------------------------------------------------

function SummaryGlance({ highlights }: { highlights: Highlight[] }) {
  const closest = useMemo(() => sortHighlights(highlights, "closest")[0], [highlights]);
  return (
    <div style={S.glanceWrap}>
      <span style={S.glanceItem}>
        <Milestone size={14} />
        Closest: {closest?.title ?? "—"} · {closest?.distanceShort ?? "—"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main section
// ---------------------------------------------------------------------------

type Props = {
  highlightsRaw?: unknown;
};

function coerceHighlightArray(input: unknown): HighlightRaw[] {
  if (Array.isArray(input)) return input as HighlightRaw[];
  if (input && typeof input === "object") {
    const rec = input as Record<string, unknown>;
    if (Array.isArray(rec.data)) return rec.data as HighlightRaw[];
    if (Array.isArray(rec.items)) return rec.items as HighlightRaw[];
    if (Array.isArray(rec.highlights)) return rec.highlights as HighlightRaw[];
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed as HighlightRaw[];
    } catch {
      return [];
    }
  }
  return [];
}

export function HikeHighlightsSection({ highlightsRaw }: Props) {
  const coerced = useMemo(() => coerceHighlightArray(highlightsRaw), [highlightsRaw]);
  const highlights = useMemo(
    () => normalizeHighlights(coerced),
    [coerced]
  );
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<HighlightSort>("closest");
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [bandFilters, setBandFilters] = useState<Set<Highlight["distanceBand"]>>(new Set());
  const [showAllRows, setShowAllRows] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of highlights) counts.set(h.categoryLabel, (counts.get(h.categoryLabel) ?? 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [highlights]);

  const filtered = useMemo(() => {
    const bySearch = highlights.filter((h) => matchesHighlightSearch(h, search));
    const byCategory =
      categoryFilters.size === 0
        ? bySearch
        : bySearch.filter((h) => categoryFilters.has(h.categoryLabel));
    const byBand =
      bandFilters.size === 0
        ? byCategory
        : byCategory.filter((h) => bandFilters.has(h.distanceBand));
    return sortHighlights(byBand, sortBy);
  }, [highlights, search, categoryFilters, bandFilters, sortBy]);
  const visible = showAllRows ? filtered : filtered.slice(0, 3);
  const hiddenCount = Math.max(0, filtered.length - visible.length);

  const toggleCategory = useCallback((category: string) => {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const toggleBand = useCallback((band: Highlight["distanceBand"]) => {
    setBandFilters((prev) => {
      const next = new Set(prev);
      if (next.has(band)) next.delete(band);
      else next.add(band);
      return next;
    });
  }, []);

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <div style={S.titleWrap}>
          <Landmark size={18} style={{ color: "#6366f1", flexShrink: 0 }} />
          <h2 style={S.title}>Highlights</h2>
        </div>
        <span style={S.countPill}>{highlights.length} total</span>
      </div>
      <SummaryGlance highlights={highlights} />

      {highlights.length === 0 ? (
        <p style={S.emptyNote}>No highlights are available for this trail yet.</p>
      ) : null}

      {highlights.length > 0 ? (
      <div style={S.controlsWrap}>
        <label style={S.searchWrap}>
          <Search size={14} style={{ color: "#94a3b8" }} />
          <input
            style={S.searchInput}
            placeholder="Search highlights (name, type, tags)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label style={S.sortWrap}>
          <Filter size={14} style={{ color: "#94a3b8" }} />
          <select style={S.sortSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value as HighlightSort)}>
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </label>
      </div>
      ) : null}

      {highlights.length > 0 ? (
      <div style={S.filtersToggleWrap}>
        <button type="button" style={S.inlineBtn} onClick={() => setShowFilters((v) => !v)}>
          {showFilters ? "Hide filters" : "Show filters"}
        </button>
      </div>
      ) : null}

      {highlights.length > 0 && showFilters ? (
      <div style={S.filterRows}>
        <div style={S.filterGroup}>
          {categories.map(([category, count]) => (
            <button
              key={category}
              type="button"
              style={categoryFilters.has(category) ? S.filterChipActive : S.filterChip}
              onClick={() => toggleCategory(category)}
            >
              {category} ({count})
            </button>
          ))}
        </div>
        <div style={S.filterGroup}>
          {(["on-trail", "very-close", "close", "nearby", "off-route"] as const).map((band) => {
            const count = highlights.filter((h) => h.distanceBand === band).length;
            return (
              <button
                key={band}
                type="button"
                style={bandFilters.has(band) ? S.filterChipActive : S.filterChip}
                onClick={() => toggleBand(band)}
              >
                {BAND_LABELS[band]} ({count})
              </button>
            );
          })}
        </div>
      </div>
      ) : null}

      {highlights.length > 0 ? (
        <div style={S.list} ref={listRef} tabIndex={-1}>
          {visible.map((h) => <HighlightRow key={h.id} h={h} />)}
          {filtered.length === 0 ? <p style={S.emptyNote}>No highlights match your filters.</p> : null}
        </div>
      ) : null}
      {highlights.length > 0 && hiddenCount > 0 ? (
        <button type="button" style={S.toggleBtn} onClick={() => setShowAllRows((v) => !v)}>
          {showAllRows ? "Show fewer highlights" : `Show ${hiddenCount} more highlights`}
        </button>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Styles (inline, matching existing section/card pattern)
// ---------------------------------------------------------------------------

const S = {
  section: {
    marginTop: 0,
    border: "1px solid #e5e7eb",
    borderRadius: "0.7rem",
    padding: "0.75rem",
    width: "100%",
    boxSizing: "border-box",
  } as const,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
    width: "100%",
  } as const,
  titleWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
  } as const,
  title: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#111827",
  } as const,
  subtitle: {
    margin: 0,
    fontSize: "0.85rem",
    color: "#6b7280",
  } as const,
  countPill: {
    border: "1px solid #e5e7eb",
    borderRadius: "999px",
    padding: "0.18rem 0.5rem",
    fontSize: "0.74rem",
    color: "#374151",
    background: "#fff",
  } as const,
  helperText: {
    margin: "0.3rem 0 0",
    fontSize: "0.75rem",
    color: "#6b7280",
  } as const,
  sourceLink: {
    color: "#4f46e5",
    textDecoration: "none",
  } as const,

  glanceWrap: {
    marginTop: "0.35rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
    width: "100%",
  } as const,
  glanceItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    padding: "0.16rem 0.4rem",
    background: "#fff",
    color: "#374151",
    fontSize: "0.72rem",
  } as const,

  controlsWrap: {
    marginTop: "0.3rem",
    display: "flex",
    gap: "0.45rem",
    flexWrap: "wrap" as const,
    width: "100%",
  } as const,
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.3rem 0.45rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "#fff",
    flex: "1 1 180px",
    minWidth: 0,
  } as const,
  searchInput: {
    border: "none",
    outline: "none",
    width: "100%",
    fontSize: "0.78rem",
    color: "#111827",
    background: "transparent",
  } as const,
  sortWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.3rem 0.45rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "#fff",
  } as const,
  sortSelect: {
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "0.76rem",
    color: "#111827",
  } as const,
  filterRows: {
    marginTop: "0.25rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.22rem",
    width: "100%",
  } as const,
  filterGroup: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.22rem",
    width: "100%",
  } as const,
  filterChip: {
    border: "1px solid #e5e7eb",
    borderRadius: "999px",
    padding: "0.14rem 0.4rem",
    background: "#fff",
    color: "#475569",
    fontSize: "0.7rem",
    cursor: "pointer",
  } as const,
  filterChipActive: {
    border: "1px solid #6366f1",
    borderRadius: "999px",
    padding: "0.14rem 0.4rem",
    background: "#eef2ff",
    color: "#4338ca",
    fontSize: "0.7rem",
    cursor: "pointer",
  } as const,

  // Chips
  chipsRow: {
    marginTop: "0.5rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
  } as const,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.55rem",
    padding: "0.2rem 0.5rem",
    fontSize: "0.82rem",
    color: "#374151",
    background: "#fff",
    whiteSpace: "nowrap" as const,
    maxWidth: "200px",
    overflow: "hidden",
  } as const,
  chipText: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as const,
  chipDot: {
    color: "#9ca3af",
    flexShrink: 0,
  } as const,
  chipDist: {
    fontSize: "0.78rem",
    color: "#6b7280",
    flexShrink: 0,
  } as const,
  moreChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    border: "1px solid #e0e7ff",
    borderRadius: "0.55rem",
    padding: "0.2rem 0.5rem",
    fontSize: "0.82rem",
    color: "#4f46e5",
    background: "#eef2ff",
    cursor: "pointer",
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
  } as const,

  // List
  list: {
    marginTop: "0.25rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.22rem",
    width: "100%",
  } as const,
  catHeading: {
    margin: "0.55rem 0 0.2rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "#6b7280",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  } as const,

  // Row
  rowWrapper: {
    border: "1px solid #f1f5f9",
    borderRadius: "0.5rem",
    background: "#fafafa",
    overflow: "hidden",
    width: "100%",
    boxSizing: "border-box",
  } as const,
  rowBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.45rem",
    padding: "0.25rem 0.35rem",
    width: "100%",
    boxSizing: "border-box",
    background: "transparent",
    textAlign: "left" as const,
  } as const,
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    minWidth: 0,
    flex: 1,
  } as const,
  rowIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: "#eef2ff",
    flexShrink: 0,
  } as const,
  rowInfo: {
    flex: 1,
    minWidth: 0,
  } as const,
  rowTitle: {
    margin: 0,
    fontWeight: 600,
    fontSize: "0.75rem",
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as const,
  rowSubtitle: {
    margin: "0.05rem 0 0",
    fontSize: "0.68rem",
    color: "#6b7280",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as const,
  bandBadge: {
    display: "inline-flex",
    marginTop: "0.08rem",
    border: "1px solid #e2e8f0",
    borderRadius: "999px",
    padding: "0.06rem 0.32rem",
    color: "#64748b",
    fontSize: "0.6rem",
    width: "fit-content",
  } as const,
  distanceCol: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "flex-end",
    gap: "0.1rem",
    flexShrink: 0,
  } as const,
  rowDist: {
    flexShrink: 0,
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#374151",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  distanceSub: {
    display: "none",
    color: "#94a3b8",
  } as const,
  rowActionsTop: {
    display: "flex",
    alignItems: "center",
    gap: "0.2rem",
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  } as const,

  // Detail panel (accordion)
  detailPanel: {
    padding: "0.3rem 0.45rem 0.45rem 2.5rem",
    borderTop: "1px solid #f1f5f9",
    background: "#fff",
  } as const,
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.1rem 0",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "0.72rem",
    color: "#374151",
  } as const,
  detailLabel: {
    color: "#6b7280",
  } as const,
  detailVal: {
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums" as const,
    color: "#111827",
    textAlign: "right" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "220px",
    whiteSpace: "nowrap" as const,
  } as const,
  tagsList: {
    marginTop: "0.25rem",
  } as const,
  tagsHeading: {
    margin: "0.3rem 0 0.15rem",
    fontSize: "0.72rem",
    color: "#374151",
  } as const,
  warning: {
    margin: "0 0 0.4rem",
    fontSize: "0.7rem",
    color: "#b45309",
  } as const,
  emptyNote: {
    margin: "0.25rem 0",
    fontSize: "0.72rem",
    color: "#6b7280",
  } as const,
  rowActions: {
    marginTop: "0.3rem",
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
  } as const,
  inlineBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    height: "20px",
    borderRadius: "0.4rem",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#374151",
    cursor: "pointer",
    textDecoration: "none",
    padding: "0 0.34rem",
    fontSize: "0.64rem",
  } as const,
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#4f46e5",
    cursor: "pointer",
    padding: 0,
    fontSize: "0.72rem",
  } as const,
  rawPre: {
    margin: "0.35rem 0 0",
    padding: "0.4rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.45rem",
    background: "#f8fafc",
    color: "#334155",
    fontSize: "0.66rem",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: "180px",
    overflow: "auto",
  } as const,

  // Buttons
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "24px",
    height: "24px",
    borderRadius: "0.4rem",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#374151",
    cursor: "pointer",
    textDecoration: "none",
    padding: 0,
    fontSize: 0,
  } as const,
  unsupported: {
    fontSize: "0.66rem",
    color: "#9ca3af",
  } as const,
  toggleBtn: {
    marginTop: "0.25rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    border: "1px solid #e0e7ff",
    borderRadius: "0.5rem",
    padding: "0.16rem 0.42rem",
    fontSize: "0.66rem",
    fontWeight: 500,
    color: "#4f46e5",
    background: "#eef2ff",
    cursor: "pointer",
    font: "inherit",
  } as const,
  filtersToggleWrap: {
    marginTop: "0.22rem",
  } as const,
} as const;
