import dynamic from "next/dynamic";
import type { AmenityPoint } from "./AmenityProfileChart";

// Interactive chart with keyboard navigation — code-split into its own chunk.
const AmenityProfileChart = dynamic(
  () => import("./AmenityProfileChart").then((m) => ({ default: m.AmenityProfileChart }))
);

type PoiLike = {
  kind?: string;
  name?: string | null;
  anchor?: string;
  distanceToAnchorMeters?: number;
  location?: unknown;
  tags?: unknown;
  osmType?: string;
  osmId?: string;
};

const KIND_TO_CATEGORY: Record<string, string> = {
  drinking_water: "Water",
  toilets: "Restrooms",
  shelter: "Shelter",
  bench: "Seating",
  picnic_table: "Seating",
  waste_basket: "Trash bins",
  parking: "Parking",
};
const CATEGORY_ORDER = ["Water", "Restrooms", "Shelter", "Seating", "Trash bins", "Parking", "Other"] as const;

const CATEGORY_ICON: Record<string, string> = {
  Water: "💧",
  Restrooms: "🚻",
  Shelter: "🛖",
  Seating: "🪑",
  "Trash bins": "🗑️",
  Parking: "🅿️",
  Other: "✳️",
};

const DEFAULT_VISIBLE_CATEGORIES = 3;

function toCategory(kind: string): string {
  const k = kind.trim().toLowerCase();
  return KIND_TO_CATEGORY[k] ?? "Other";
}

function distanceLabel(meters: number): string {
  if (meters < 75) return "at the spot";
  if (meters < 150) return "very close";
  if (meters <= 300) return "short walk";
  return "nearby";
}

function formatClosestMeta(meters: number): string {
  const m = Math.round(meters);
  const label = distanceLabel(meters);
  return `closest: ${m} m • ${label}`;
}

function osmUrl(poi: PoiLike): string | null {
  const type = typeof poi.osmType === "string" ? poi.osmType.trim().toLowerCase() : "";
  let id: string | null = null;
  if (typeof poi.osmId === "string" && poi.osmId.trim()) {
    const parts = poi.osmId.trim().split("/");
    id = parts[parts.length - 1] ?? null;
  }
  if (!type || !id) return null;
  return `https://www.openstreetmap.org/${type}/${id}`;
}

const ANCHOR_LABELS: Record<string, string> = {
  start: "Near the start",
  centroid: "Near the middle",
  end: "Near the end",
};

type AnchorKey = "start" | "centroid" | "end";
const ANCHOR_ORDER: AnchorKey[] = ["start", "centroid", "end"];

function normalizeAnchor(anchor: unknown): AnchorKey | null {
  const a = typeof anchor === "string" ? anchor.trim().toLowerCase() : "";
  if (a === "start" || a === "centroid" || a === "end") return a;
  return null;
}

type CategorySummary = { label: string; count: number; minMeters: number };
type AnchorGroup = { anchor: AnchorKey; pois: PoiLike[]; categories: CategorySummary[] };

function buildAnchorGroups(pois: PoiLike[]): AnchorGroup[] {
  const byAnchor: Record<AnchorKey, PoiLike[]> = { start: [], centroid: [], end: [] };
  for (const p of pois) {
    const anchor = normalizeAnchor(p.anchor);
    if (anchor) byAnchor[anchor].push(p);
  }
  return ANCHOR_ORDER.map((anchor) => {
    const list = byAnchor[anchor];
    const byCat: Record<string, { count: number; minMeters: number }> = {};
    for (const poi of list) {
      const kind = typeof poi.kind === "string" ? poi.kind : "";
      const cat = toCategory(kind);
      const dist =
        poi.distanceToAnchorMeters != null && Number.isFinite(Number(poi.distanceToAnchorMeters))
          ? Number(poi.distanceToAnchorMeters)
          : 99999;
      if (!byCat[cat]) byCat[cat] = { count: 0, minMeters: dist };
      byCat[cat].count += 1;
      if (dist < byCat[cat].minMeters) byCat[cat].minMeters = dist;
    }
    const categories: CategorySummary[] = [];
    for (const label of CATEGORY_ORDER) {
      const rec = byCat[label];
      if (rec && rec.count > 0) categories.push({ label, count: rec.count, minMeters: rec.minMeters });
    }
    return { anchor, pois: list, categories };
  });
}

function sortPoisByDistance(pois: PoiLike[]): PoiLike[] {
  return [...pois].sort((a, b) => {
    const da = a.distanceToAnchorMeters != null && Number.isFinite(a.distanceToAnchorMeters) ? Number(a.distanceToAnchorMeters) : 99999;
    const db = b.distanceToAnchorMeters != null && Number.isFinite(b.distanceToAnchorMeters) ? Number(b.distanceToAnchorMeters) : 99999;
    return da - db;
  });
}

function anchorMicroSummary(categories: CategorySummary[]): string {
  const hasWater = categories.some((c) => c.label === "Water");
  const hasRestrooms = categories.some((c) => c.label === "Restrooms");
  const hasParking = categories.some((c) => c.label === "Parking");
  const onlyParking = categories.length === 1 && hasParking;
  if (hasWater && hasRestrooms) return "Water nearby • Restrooms nearby";
  if (hasWater) return "Water nearby";
  if (hasRestrooms) return "Restrooms nearby";
  if (onlyParking) return "Mostly parking nearby";
  if (categories.length > 0) return "A few amenities nearby";
  return "";
}

export type RouteAmenitiesSectionProps = {
  trailheadPOIs?: unknown;
  amenityPoints?: AmenityPoint[] | null;
  lengthMilesTotal?: number | null;
};

export function RouteAmenitiesSection({ trailheadPOIs, amenityPoints, lengthMilesTotal }: RouteAmenitiesSectionProps) {
  const raw = trailheadPOIs;
  const arr = Array.isArray(raw) ? raw : [];
  const pois = arr.filter((p): p is PoiLike => p != null && typeof p === "object");
  const groups = buildAnchorGroups(pois);

  if (pois.length === 0) return null;

  const sectionStyle = {
    marginTop: "0.65rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.7rem",
    padding: "0.65rem 0.75rem",
  } as const;
  const cardStyle = {
    border: "1px solid #e5e7eb",
    borderRadius: "0.45rem",
    padding: "0.45rem 0.55rem",
    marginTop: "0.35rem",
    backgroundColor: "#fafafa",
  } as const;

  return (
    <section style={sectionStyle}>
      <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600, color: "#111827" }}>
        Amenities along the route
      </h2>
      <p style={{ margin: "0.15rem 0 0", fontSize: "0.76rem", color: "#6b7280" }}>
        Nearby facilities around the start, middle, and end of this trail.
      </p>

      {amenityPoints && amenityPoints.length >= 1 && (
        <div style={{ marginTop: "0.55rem" }}>
          <div style={{
            fontSize: "0.66rem",
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            color: "#6b7280",
            marginBottom: "0.2rem",
          }}>
            Amenities along the trail
          </div>
          <AmenityProfileChart points={amenityPoints} totalMiles={lengthMilesTotal} />
        </div>
      )}

      <div
        style={{
          marginTop: "0.35rem",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
          gap: "0.4rem",
        }}
      >
        {groups.map(({ anchor, pois: anchorPois, categories }) => {
          const visibleCategories = categories.slice(0, DEFAULT_VISIBLE_CATEGORIES);
          const moreCategories = categories.slice(DEFAULT_VISIBLE_CATEGORIES);
          const sortedPois = sortPoisByDistance(anchorPois);
          const firstDetails = sortedPois.slice(0, 3);
          const restDetails = sortedPois.slice(3);
          const restCount = restDetails.length;

          return (
            <div key={anchor} style={cardStyle}>
              <h3 style={{ margin: 0, fontSize: "0.86rem", fontWeight: 600, color: "#374151" }}>
                {ANCHOR_LABELS[anchor] ?? anchor}
              </h3>
              {categories.length === 0 ? (
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.76rem", color: "#6b7280" }}>
                  No mapped amenities near this part of the trail.
                </p>
              ) : (
                <>
                  {anchorMicroSummary(categories) ? (
                    <p style={{ margin: "0.18rem 0 0", fontSize: "0.74rem", color: "#6b7280" }}>
                      {anchorMicroSummary(categories)}
                    </p>
                  ) : null}
                  <div style={{ marginTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {visibleCategories.map(({ label, count, minMeters }) => (
                      <div
                        key={label}
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "0.25rem 0.5rem",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                          <span style={{ fontSize: "0.9rem" }}>{CATEGORY_ICON[label] ?? CATEGORY_ICON.Other}</span>
                          <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151" }}>{label}</span>
                        </div>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 600,
                            color: "#374151",
                            background: "#e5e7eb",
                            padding: "0.08rem 0.34rem",
                            borderRadius: "9999px",
                          }}
                        >
                          {count}
                        </span>
                        <div style={{ width: "100%", fontSize: "0.67rem", color: "#6b7280" }}>
                          {formatClosestMeta(minMeters)}
                        </div>
                      </div>
                    ))}
                  </div>
                  {moreCategories.length > 0 ? (
                    <details style={{ marginTop: "0.2rem" }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontSize: "0.72rem",
                          color: "#2563eb",
                          listStyle: "none",
                          textDecoration: "underline",
                        }}
                      >
                        Show {moreCategories.length} more
                      </summary>
                      <div style={{ marginTop: "0.2rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                        {moreCategories.map(({ label, count, minMeters }) => (
                          <div
                            key={label}
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "0.25rem 0.5rem",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                              <span style={{ fontSize: "0.9rem" }}>{CATEGORY_ICON[label] ?? CATEGORY_ICON.Other}</span>
                              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#374151" }}>{label}</span>
                            </div>
                            <span
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: 600,
                                color: "#374151",
                                background: "#e5e7eb",
                                padding: "0.08rem 0.34rem",
                                borderRadius: "9999px",
                              }}
                            >
                              {count}
                            </span>
                            <div style={{ width: "100%", fontSize: "0.67rem", color: "#6b7280" }}>
                              {formatClosestMeta(minMeters)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {sortedPois.length > 0 ? (
                    <div
                      style={{
                        marginTop: "0.35rem",
                        paddingTop: "0.35rem",
                        borderTop: "1px solid #e5e7eb",
                      }}
                    >
                      <details>
                        <summary
                        style={{
                          cursor: "pointer",
                          fontSize: "0.72rem",
                          color: "#2563eb",
                          listStyle: "none",
                          textDecoration: "underline",
                        }}
                      >
                        Point details
                      </summary>
                      <ul style={{ margin: "0.25rem 0 0", paddingLeft: "0.8rem", listStyle: "none", fontSize: "0.72rem" }}>
                        {firstDetails.map((poi, i) => {
                          const kind = typeof poi.kind === "string" ? poi.kind : "";
                          const label = toCategory(kind);
                          const name = typeof poi.name === "string" ? poi.name.trim() : null;
                          const dist =
                            poi.distanceToAnchorMeters != null && Number.isFinite(Number(poi.distanceToAnchorMeters))
                              ? Math.round(Number(poi.distanceToAnchorMeters))
                              : null;
                          const dLabel = dist != null ? distanceLabel(poi.distanceToAnchorMeters as number) : "";
                          const url = osmUrl(poi);
                          const primary = name || `${label} area`;
                          const secondary = dist != null && dLabel ? `${dist} m • ${dLabel}` : "";
                          return (
                            <li
                              key={i}
                              style={{
                                marginBottom: "0.2rem",
                                display: "flex",
                                flexWrap: "wrap",
                                alignItems: "baseline",
                                justifyContent: "space-between",
                                gap: "0.25rem 0.5rem",
                              }}
                            >
                              <div>
                                <span style={{ color: "#374151" }}>{primary}</span>
                                {secondary ? (
                                  <div style={{ fontSize: "0.67rem", color: "#6b7280" }}>{secondary}</div>
                                ) : null}
                              </div>
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener"
                                  style={{ fontSize: "0.67rem", color: "#2563eb", whiteSpace: "nowrap" }}
                                  title="OpenStreetMap"
                                >
                                  ↗
                                </a>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                      {restCount > 0 ? (
                        <details style={{ marginTop: "0.15rem" }}>
                          <summary
                            style={{
                              cursor: "pointer",
                              fontSize: "0.67rem",
                              color: "#6b7280",
                              listStyle: "none",
                              textDecoration: "underline",
                            }}
                          >
                            Show {restCount} more
                          </summary>
                          <ul style={{ margin: "0.22rem 0 0", paddingLeft: "0.8rem", listStyle: "none", fontSize: "0.72rem" }}>
                            {restDetails.map((poi, i) => {
                              const kind = typeof poi.kind === "string" ? poi.kind : "";
                              const label = toCategory(kind);
                              const name = typeof poi.name === "string" ? poi.name.trim() : null;
                              const dist =
                                poi.distanceToAnchorMeters != null &&
                                Number.isFinite(Number(poi.distanceToAnchorMeters))
                                  ? Math.round(Number(poi.distanceToAnchorMeters))
                                  : null;
                              const dLabel = dist != null ? distanceLabel(poi.distanceToAnchorMeters as number) : "";
                              const url = osmUrl(poi);
                              const primary = name || `${label} area`;
                              const secondary = dist != null && dLabel ? `${dist} m • ${dLabel}` : "";
                              return (
                                <li
                                  key={i}
                                  style={{
                                    marginBottom: "0.2rem",
                                    display: "flex",
                                    flexWrap: "wrap",
                                    alignItems: "baseline",
                                    justifyContent: "space-between",
                                    gap: "0.25rem 0.5rem",
                                  }}
                                >
                                  <div>
                                    <span style={{ color: "#374151" }}>{primary}</span>
                                    {secondary ? (
                                      <div style={{ fontSize: "0.67rem", color: "#6b7280" }}>{secondary}</div>
                                    ) : null}
                                  </div>
                                  {url ? (
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noopener"
                                      style={{ fontSize: "0.67rem", color: "#2563eb", whiteSpace: "nowrap" }}
                                      title="OpenStreetMap"
                                    >
                                      ↗
                                    </a>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </details>
                      ) : null}
                      </details>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
