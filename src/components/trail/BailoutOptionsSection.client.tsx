"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  GitMerge,
  LogOut,
  Search,
} from "lucide-react";
import type { BailoutPointRaw, BailoutSpot, BailoutAnchorKey } from "@/lib/bailouts/bailouts.utils";
import { BailoutCoverageChart } from "@/components/trail/BailoutCoverageChart";
import {
  anchorLabel,
  deriveSpotForAnchor,
  formatDistanceLong,
  formatDistanceShort,
  humanize,
  isActionableExit,
  isDeadEndOnly,
  normalizeBailoutPoints,
  sortSpotsBySelectedAnchorDistance,
} from "@/lib/bailouts/bailouts.utils";

type Props = {
  bailoutPointsRaw?: BailoutPointRaw[] | null;
  bailoutClass?: string | null;
  bailoutScore?: number | null;
  bailoutReasons?: string[] | string | null;
  lengthMilesTotal?: number | null;
};

type AllSort = "closest" | "alpha";

type KindFilter = {
  entrance: boolean;
  intersection: boolean;
  dead_end: boolean;
};

const ANCHOR_OPTIONS: Array<{ id: BailoutAnchorKey; label: string }> = [
  { id: "start", label: "Start" },
  { id: "centroid", label: "Midpoint" },
  { id: "end", label: "End" },
];

function coerceRawPoints(input: unknown): BailoutPointRaw[] {
  if (Array.isArray(input)) return input as BailoutPointRaw[];
  if (input && typeof input === "object") {
    const rec = input as Record<string, unknown>;
    if (Array.isArray(rec.data)) return rec.data as BailoutPointRaw[];
    if (Array.isArray(rec.items)) return rec.items as BailoutPointRaw[];
    if (Array.isArray(rec.bailoutPoints)) return rec.bailoutPoints as BailoutPointRaw[];
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parsed as BailoutPointRaw[];
    } catch {
      return [];
    }
  }
  return [];
}

function parseReasons(value: string[] | string | null | undefined): string[] {
  if (value == null) return [];
  const base = Array.isArray(value) ? value : String(value).split(/\n|;/g);
  const uniq = new Set<string>();
  const out: string[] = [];
  for (const item of base) {
    const cleaned = String(item).split(",").map((part) => part.trim()).filter(Boolean);
    for (const part of cleaned) {
      const key = part.toLowerCase();
      if (uniq.has(key)) continue;
      uniq.add(key);
      out.push(part);
    }
  }
  return out;
}

function spotHasKind(spot: BailoutSpot, kind: "entrance" | "intersection" | "dead_end"): boolean {
  return spot.kinds.some((k) => k.toLowerCase() === kind);
}

function spotIcon(spot: BailoutSpot) {
  if (spotHasKind(spot, "entrance")) return <LogOut size={16} style={{ color: "#047857" }} />;
  if (spotHasKind(spot, "intersection")) return <GitMerge size={16} style={{ color: "#4f46e5" }} />;
  return <AlertTriangle size={16} style={{ color: "#b45309" }} />;
}

function CopyCoordsButton({ lat, lng }: { lat: number; lng: number }) {
  const [copied, setCopied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  const onCopy = useCallback(() => {
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

  if (unsupported) return <span style={S.mutedTiny}>Copy unsupported</span>;

  return (
    <button type="button" style={S.inlineBtn} onClick={onCopy} title="Copy coordinates">
      {copied ? <Check size={13} style={{ color: "#059669" }} /> : <Copy size={13} />}
      Copy coords
    </button>
  );
}

function SpotRow({ spot }: { spot: BailoutSpot }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const anchorKeys = useMemo(() => {
    const keys = Object.keys(spot.anchors);
    const ordered = ["start", "centroid", "end"].filter((k) => keys.includes(k));
    const extra = keys.filter((k) => !ordered.includes(k)).sort((a, b) => a.localeCompare(b));
    return [...ordered, ...extra];
  }, [spot.anchors]);

  return (
    <div style={S.rowWrap}>
      <div style={S.rowTop}>
        <div style={S.rowLeft}>
          <div style={S.rowIcon}>{spotIcon(spot)}</div>
          <div style={S.rowText}>
            <p style={S.rowTitle}>{spot.title}</p>
            <p style={S.rowSubtitle}>{spot.subtitle}</p>
            <div style={S.badgesWrap}>
              {spot.badges.map((badge) => (
                <span key={`${spot.id}-${badge}`} style={S.kindBadge}>
                  {badge}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div style={S.rowRight}>
          {spot.distanceShort ? <span style={S.distancePill}>{spot.distanceShort}</span> : null}
          <a href={spot.googleMapsUrl} target="_blank" rel="noopener noreferrer" style={S.inlineBtn}>
            Google Maps <ExternalLink size={13} />
          </a>
          {spot.osmUrl ? (
            <a href={spot.osmUrl} target="_blank" rel="noopener noreferrer" style={S.inlineBtn}>
              Open OSM <ExternalLink size={13} />
            </a>
          ) : (
            <span style={S.inlineBtnDisabled}>OSM unavailable</span>
          )}
          <CopyCoordsButton lat={spot.lat} lng={spot.lng} />
          <button
            type="button"
            style={S.inlineBtn}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((v) => !v)}
          >
            Details
            <ChevronDown
              size={14}
              style={{
                color: "#94a3b8",
                transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 150ms ease",
              }}
            />
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={panelId} role="region" style={S.detailPanel}>
          <div style={S.detailRow}>
            <span style={S.detailKey}>Latitude</span>
            <span style={S.detailVal}>{spot.lat}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>Longitude</span>
            <span style={S.detailVal}>{spot.lng}</span>
          </div>
          <div style={{ marginTop: "0.35rem" }}>
            <CopyCoordsButton lat={spot.lat} lng={spot.lng} />
          </div>
          <div style={{ marginTop: "0.35rem" }}>
            <p style={S.detailHeading}>Distances to anchors</p>
            {anchorKeys.length === 0 ? (
              <p style={S.mutedTiny}>No anchor distance data available</p>
            ) : (
              anchorKeys.map((anchor) => {
                const m = spot.anchors[anchor];
                const distanceText = typeof m === "number" ? formatDistanceLong(m, anchor) : "Unknown distance";
                return (
                  <div key={`${spot.id}-${anchor}`} style={S.detailRow}>
                    <span style={S.detailKey}>{anchorLabel(anchor)}</span>
                    <span style={S.detailVal}>{distanceText}</span>
                  </div>
                );
              })
            )}
          </div>
          <div style={{ marginTop: "0.35rem" }}>
            <p style={S.detailHeading}>Kinds</p>
            <div style={S.badgesWrap}>
              {spot.kinds.map((kind) => (
                <span key={`${spot.id}-kind-${kind}`} style={S.kindBadge}>
                  {humanize(kind)}
                </span>
              ))}
            </div>
          </div>
          <button type="button" style={S.linkBtn} onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? "Hide raw data (JSON)" : "View raw data (JSON)"}
          </button>
          {showRaw ? <pre style={S.rawPre}>{JSON.stringify(spot.rawPoints, null, 2)}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}

function matchesSearch(spot: BailoutSpot, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  const anchorWords = Object.keys(spot.anchors).map((a) => anchorLabel(a));
  const haystack = [spot.title, ...spot.kinds, ...anchorWords, ...spot.badges].join(" ").toLowerCase();
  return haystack.includes(q);
}

function findClosestActionableDistance(spots: BailoutSpot[], anchor: BailoutAnchorKey): number | null {
  const distances = spots
    .filter((spot) => isActionableExit(spot))
    .map((spot) => spot.anchors[anchor])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (distances.length === 0) return null;
  return Math.min(...distances);
}

export function BailoutOptionsSection({
  bailoutPointsRaw,
  bailoutClass,
  bailoutScore,
  bailoutReasons,
  lengthMilesTotal,
}: Props) {
  const points = useMemo(() => coerceRawPoints(bailoutPointsRaw), [bailoutPointsRaw]);
  const reasons = useMemo(() => parseReasons(bailoutReasons), [bailoutReasons]);
  const spots = useMemo(() => normalizeBailoutPoints(points), [points]);

  const [selectedAnchor, setSelectedAnchor] = useState<BailoutAnchorKey>("start");
  const [allOpen, setAllOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<AllSort>("closest");
  const [kindFilters, setKindFilters] = useState<KindFilter>({
    entrance: true,
    intersection: true,
    dead_end: false,
  });
  const [visibleCount, setVisibleCount] = useState(20);

  const spotsForAnchor = useMemo(
    () => spots.map((spot) => deriveSpotForAnchor(spot, selectedAnchor)),
    [spots, selectedAnchor]
  );

  const actionableSpots = useMemo(
    () => spotsForAnchor.filter((spot) => isActionableExit(spot)),
    [spotsForAnchor]
  );
  const deadEndOnlyCount = useMemo(
    () => spotsForAnchor.filter((spot) => isDeadEndOnly(spot)).length,
    [spotsForAnchor]
  );

  const topExits = useMemo(() => {
    const withDistance = actionableSpots.filter((spot) => spot.distanceForSelectedAnchorM != null);
    return sortSpotsBySelectedAnchorDistance(withDistance).slice(0, 5);
  }, [actionableSpots]);

  const closestStart = useMemo(
    () => findClosestActionableDistance(spots, "start"),
    [spots]
  );
  const closestMidpoint = useMemo(
    () => findClosestActionableDistance(spots, "centroid"),
    [spots]
  );
  const closestEnd = useMemo(
    () => findClosestActionableDistance(spots, "end"),
    [spots]
  );

  const filteredAll = useMemo(() => {
    const byKinds = spotsForAnchor.filter((spot) => {
      const matchesEntrance = kindFilters.entrance && spotHasKind(spot, "entrance");
      const matchesIntersection = kindFilters.intersection && spotHasKind(spot, "intersection");
      const matchesDeadEnd = kindFilters.dead_end && isDeadEndOnly(spot);
      return matchesEntrance || matchesIntersection || matchesDeadEnd;
    });
    const bySearch = byKinds.filter((spot) => matchesSearch(spot, search));
    if (sortBy === "alpha") return [...bySearch].sort((a, b) => a.title.localeCompare(b.title));
    return sortSpotsBySelectedAnchorDistance(bySearch);
  }, [spotsForAnchor, kindFilters, search, sortBy]);

  useEffect(() => {
    setVisibleCount(20);
  }, [search, sortBy, selectedAnchor, kindFilters]);

  const visibleAll = filteredAll.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAll.length;
  const selectedAnchorLabel = anchorLabel(selectedAnchor);

  if (
    spots.length === 0 &&
    bailoutClass == null &&
    bailoutScore == null &&
    (reasons.length === 0 || bailoutReasons == null)
  ) {
    return null;
  }

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <h2 style={S.title}>Exit options (Bailouts)</h2>
        <div style={S.headlinePills}>
          <span style={S.metaPill}>Bailout: {bailoutClass ?? "—"}</span>
          <span style={S.metaPill}>Score: {bailoutScore != null ? String(bailoutScore) : "—"}</span>
        </div>
      </div>
      <p style={S.helperText}>
        If you need to shorten the hike, these are the nearest exits/connectors. Exit points near the trail.
        Distances are from the selected anchor (start/end/midpoint).
      </p>

      <details style={S.detailsWrap}>
        <summary style={S.detailsSummary}>How is this calculated?</summary>
        <div style={S.detailsBody}>
          <p style={S.mutedText}>Based on trail graph connectivity and nearby exits.</p>
          {reasons.length > 0 ? (
            <ul style={S.bullets}>
              {reasons.map((reason) => (
                <li key={reason} style={S.bullet}>
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p style={S.mutedTiny}>No additional reasons were provided.</p>
          )}
        </div>
      </details>

      <div style={S.statsGrid}>
        <span style={S.statPill}>Total spots: {spots.length}</span>
        <span style={S.statPill}>Actionable exits: {actionableSpots.length}</span>
        <span style={S.statPill}>Dead ends: {deadEndOnlyCount}</span>
        <span style={S.statPill}>
          Closest near Start: {closestStart == null ? "—" : formatDistanceShort(closestStart)}
        </span>
        <span style={S.statPill}>
          Closest near Midpoint: {closestMidpoint == null ? "—" : formatDistanceShort(closestMidpoint)}
        </span>
        <span style={S.statPill}>
          Closest near End: {closestEnd == null ? "—" : formatDistanceShort(closestEnd)}
        </span>
      </div>

      {/* Spatial coverage chart */}
      {points.length > 0 && (
        <div style={{ marginTop: "1rem", marginBottom: "0.25rem" }}>
          <div style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            color: "#6b7280",
            marginBottom: "0.4rem",
          }}>
            Exit coverage along the trail
          </div>
          <BailoutCoverageChart points={points} totalMiles={lengthMilesTotal} />
        </div>
      )}

      <div style={{ ...S.segmentWrap, marginTop: "1rem" }} role="tablist" aria-label="Bailout anchor">
        {ANCHOR_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={selectedAnchor === opt.id}
            style={selectedAnchor === opt.id ? S.segmentBtnActive : S.segmentBtn}
            onClick={() => setSelectedAnchor(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "0.7rem" }}>
        <h3 style={S.subTitle}>Top exits near {selectedAnchorLabel}</h3>
        {topExits.length === 0 ? (
          <p style={S.mutedText}>
            No mapped exits near {selectedAnchorLabel}. Try switching to a different anchor.
          </p>
        ) : (
          <div style={S.listWrap}>
            {topExits.map((spot) => (
              <SpotRow key={`${selectedAnchor}-${spot.id}`} spot={spot} />
            ))}
          </div>
        )}
      </div>

      <div style={S.allWrap}>
        <button
          type="button"
          style={S.expandBtn}
          aria-expanded={allOpen}
          onClick={() => setAllOpen((v) => !v)}
        >
          {allOpen ? "Hide all exit points" : "All exit points"}
          <ChevronDown
            size={14}
            style={{
              color: "#64748b",
              transform: allOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 150ms ease",
            }}
          />
        </button>

        {allOpen ? (
          <div style={S.allBody}>
            <label style={S.searchWrap}>
              <Search size={14} style={{ color: "#94a3b8" }} />
              <input
                style={S.searchInput}
                placeholder="Search by title, kind, or anchor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>

            <div style={S.filterWrap}>
              <button
                type="button"
                style={kindFilters.entrance ? S.filterChipActive : S.filterChip}
                onClick={() => setKindFilters((prev) => ({ ...prev, entrance: !prev.entrance }))}
              >
                Entrances
              </button>
              <button
                type="button"
                style={kindFilters.intersection ? S.filterChipActive : S.filterChip}
                onClick={() => setKindFilters((prev) => ({ ...prev, intersection: !prev.intersection }))}
              >
                Intersections
              </button>
              <button
                type="button"
                style={kindFilters.dead_end ? S.filterChipActive : S.filterChip}
                onClick={() => setKindFilters((prev) => ({ ...prev, dead_end: !prev.dead_end }))}
              >
                Include dead ends
              </button>

              <label style={S.sortWrap}>
                Sort
                <select style={S.sortSelect} value={sortBy} onChange={(e) => setSortBy(e.target.value as AllSort)}>
                  <option value="closest">Closest to {selectedAnchorLabel}</option>
                  <option value="alpha">Alphabetical</option>
                </select>
              </label>
            </div>

            {visibleAll.length === 0 ? (
              <p style={S.mutedText}>No exit points match these filters.</p>
            ) : (
              <div style={S.listWrap}>
                {visibleAll.map((spot) => (
                  <SpotRow key={`all-${selectedAnchor}-${spot.id}`} spot={spot} />
                ))}
              </div>
            )}

            {hasMore ? (
              <button
                type="button"
                style={S.showMoreBtn}
                onClick={() => setVisibleCount((prev) => prev + 20)}
              >
                Show 20 more
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

const S = {
  section: {
    marginTop: "1.25rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    padding: "0.9rem",
  } as const,
  title: {
    margin: 0,
    fontSize: "1.2rem",
    fontWeight: 600,
    color: "#111827",
  } as const,
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
  } as const,
  helperText: {
    margin: "0.35rem 0 0",
    fontSize: "0.82rem",
    color: "#6b7280",
  } as const,
  headlinePills: {
    display: "inline-flex",
    gap: "0.35rem",
    flexWrap: "wrap" as const,
  } as const,
  metaPill: {
    border: "1px solid #e5e7eb",
    borderRadius: "999px",
    padding: "0.18rem 0.5rem",
    fontSize: "0.76rem",
    color: "#334155",
    background: "#fff",
  } as const,
  detailsWrap: { marginTop: "0.55rem" } as const,
  detailsSummary: {
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "#334155",
  } as const,
  detailsBody: { marginTop: "0.45rem" } as const,
  bullets: { margin: "0.35rem 0 0", paddingLeft: "1.15rem" } as const,
  bullet: { margin: "0.16rem 0", color: "#475569", fontSize: "0.8rem" } as const,
  mutedText: { margin: 0, fontSize: "0.82rem", color: "#475569" } as const,
  mutedTiny: { margin: 0, fontSize: "0.75rem", color: "#64748b" } as const,

  statsGrid: {
    marginTop: "0.65rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
  } as const,
  statPill: {
    border: "1px solid #e2e8f0",
    borderRadius: "0.5rem",
    padding: "0.22rem 0.5rem",
    fontSize: "0.76rem",
    color: "#334155",
    background: "#f8fafc",
  } as const,

  segmentWrap: {
    marginTop: "0.7rem",
    display: "inline-flex",
    border: "1px solid #e5e7eb",
    borderRadius: "0.55rem",
    overflow: "hidden",
  } as const,
  segmentBtn: {
    border: "none",
    borderRight: "1px solid #e5e7eb",
    background: "#fff",
    color: "#475569",
    padding: "0.35rem 0.65rem",
    fontSize: "0.82rem",
    cursor: "pointer",
  } as const,
  segmentBtnActive: {
    border: "none",
    borderRight: "1px solid #e5e7eb",
    background: "#eef2ff",
    color: "#4338ca",
    padding: "0.35rem 0.65rem",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  } as const,

  subTitle: { margin: "0 0 0.35rem", fontSize: "0.95rem", color: "#111827" } as const,
  listWrap: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.35rem",
  } as const,
  rowWrap: {
    border: "1px solid #e2e8f0",
    borderRadius: "0.55rem",
    background: "#fff",
    overflow: "hidden",
  } as const,
  rowTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.75rem",
    padding: "0.45rem 0.55rem",
    flexWrap: "wrap" as const,
  } as const,
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    minWidth: 0,
    flex: 1,
  } as const,
  rowIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    background: "#f8fafc",
    flexShrink: 0,
  } as const,
  rowText: { minWidth: 0, flex: 1 } as const,
  rowTitle: {
    margin: 0,
    fontSize: "0.88rem",
    fontWeight: 600,
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as const,
  rowSubtitle: {
    margin: "0.1rem 0 0",
    fontSize: "0.78rem",
    color: "#6b7280",
  } as const,
  badgesWrap: {
    marginTop: "0.2rem",
    display: "flex",
    gap: "0.3rem",
    flexWrap: "wrap" as const,
  } as const,
  kindBadge: {
    border: "1px solid #e2e8f0",
    borderRadius: "999px",
    padding: "0.08rem 0.4rem",
    fontSize: "0.68rem",
    color: "#475569",
    background: "#fff",
  } as const,
  rowRight: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    flexWrap: "wrap" as const,
    justifyContent: "flex-end",
  } as const,
  distancePill: {
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: "999px",
    padding: "0.15rem 0.48rem",
    fontSize: "0.72rem",
    fontWeight: 600,
  } as const,
  inlineBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.22rem",
    height: "28px",
    borderRadius: "0.42rem",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#334155",
    cursor: "pointer",
    textDecoration: "none",
    padding: "0 0.52rem",
    fontSize: "0.75rem",
  } as const,
  inlineBtnDisabled: {
    display: "inline-flex",
    alignItems: "center",
    height: "28px",
    borderRadius: "0.42rem",
    border: "1px solid #e5e7eb",
    background: "#f8fafc",
    color: "#94a3b8",
    padding: "0 0.52rem",
    fontSize: "0.75rem",
  } as const,
  detailPanel: {
    borderTop: "1px solid #f1f5f9",
    background: "#f8fafc",
    padding: "0.45rem 0.58rem 0.58rem",
  } as const,
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
    padding: "0.14rem 0",
    borderBottom: "1px solid #eef2f7",
    fontSize: "0.78rem",
  } as const,
  detailKey: { color: "#64748b" } as const,
  detailVal: {
    color: "#111827",
    fontWeight: 600,
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  detailHeading: {
    margin: "0.15rem 0 0.2rem",
    fontSize: "0.76rem",
    color: "#475569",
    fontWeight: 600,
  } as const,
  linkBtn: {
    marginTop: "0.35rem",
    border: "none",
    background: "transparent",
    color: "#4f46e5",
    cursor: "pointer",
    padding: 0,
    fontSize: "0.78rem",
  } as const,
  rawPre: {
    marginTop: "0.35rem",
    padding: "0.5rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.45rem",
    background: "#fff",
    color: "#334155",
    fontSize: "0.72rem",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: "220px",
    overflow: "auto",
  } as const,

  allWrap: { marginTop: "0.8rem", borderTop: "1px solid #f1f5f9", paddingTop: "0.7rem" } as const,
  expandBtn: {
    border: "1px solid #e2e8f0",
    borderRadius: "0.5rem",
    background: "#fff",
    color: "#334155",
    padding: "0.35rem 0.58rem",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
  } as const,
  allBody: {
    marginTop: "0.55rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.55rem",
  } as const,
  searchWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "#fff",
    padding: "0.35rem 0.55rem",
  } as const,
  searchInput: {
    border: "none",
    outline: "none",
    width: "100%",
    minWidth: "250px",
    fontSize: "0.84rem",
    color: "#111827",
    background: "transparent",
  } as const,
  filterWrap: {
    display: "flex",
    gap: "0.35rem",
    flexWrap: "wrap" as const,
    alignItems: "center",
  } as const,
  filterChip: {
    border: "1px solid #e5e7eb",
    borderRadius: "999px",
    background: "#fff",
    color: "#475569",
    padding: "0.2rem 0.5rem",
    fontSize: "0.75rem",
    cursor: "pointer",
  } as const,
  filterChipActive: {
    border: "1px solid #4f46e5",
    borderRadius: "999px",
    background: "#eef2ff",
    color: "#4338ca",
    padding: "0.2rem 0.5rem",
    fontSize: "0.75rem",
    cursor: "pointer",
  } as const,
  sortWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "#fff",
    padding: "0.26rem 0.45rem",
    color: "#475569",
    fontSize: "0.75rem",
  } as const,
  sortSelect: {
    border: "none",
    outline: "none",
    background: "transparent",
    fontSize: "0.75rem",
    color: "#111827",
  } as const,
  showMoreBtn: {
    width: "fit-content",
    border: "1px solid #dbeafe",
    borderRadius: "0.5rem",
    background: "#eff6ff",
    color: "#1d4ed8",
    cursor: "pointer",
    padding: "0.3rem 0.58rem",
    fontSize: "0.78rem",
    fontWeight: 600,
  } as const,
} as const;
