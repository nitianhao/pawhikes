"use client";

import { Copy, Droplets, ExternalLink, MapPin, Waves } from "lucide-react";

export type SwimSectionProps = {
  swimLikely?: boolean | null;
  swimAccessPointsCount?: number | null;
  swimAccessPointsByType?: Record<string, number> | null;
  swimAccessPoints?: Array<{
    kind?: string | null;
    name?: string | null;
    tags?: Record<string, unknown>;
    osmId?: string | null;
    osmType?: string | null;
    location?: { type?: string; coordinates?: [number, number] };
    lat?: number;
    lon?: number;
    distanceToTrailMeters?: number;
    distanceToTrail?: number;
    [key: string]: unknown;
  }> | null;
};

function getLonLat(
  point: {
    location?: { coordinates?: [number, number] };
    lat?: number;
    lon?: number;
  } | null
): { lat: number; lon: number } | null {
  if (!point) return null;
  const coords = point.location?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
    return { lon: coords[0], lat: coords[1] };
  }
  const lat = point.lat != null && Number.isFinite(point.lat) ? point.lat : null;
  const lon = point.lon != null && Number.isFinite(point.lon) ? point.lon : null;
  if (lat != null && lon != null) return { lat, lon };
  return null;
}

function buildMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function humanizeTypeKey(key: string): string {
  const k = String(key).trim().toLowerCase();
  if (k === "lake_or_pond") return "Lake/pond";
  if (k === "ford") return "Ford (shallow crossing)";
  if (k === "river_access") return "River access";
  if (k === "beach") return "Beach";
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortAccessPoints(
  points: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return [...points].sort((a, b) => {
    const kindA = (a.kind ?? "").toString();
    const kindB = (b.kind ?? "").toString();
    if (kindA !== kindB) return kindA.localeCompare(kindB);
    const distA =
      (typeof a.distanceToTrailMeters === "number" && Number.isFinite(a.distanceToTrailMeters)
        ? a.distanceToTrailMeters
        : null) ??
      (typeof a.distanceToTrail === "number" && Number.isFinite(a.distanceToTrail) ? a.distanceToTrail : null) ??
      Infinity;
    const distB =
      (typeof b.distanceToTrailMeters === "number" && Number.isFinite(b.distanceToTrailMeters)
        ? b.distanceToTrailMeters
        : null) ??
      (typeof b.distanceToTrail === "number" && Number.isFinite(b.distanceToTrail) ? b.distanceToTrail : null) ??
      Infinity;
    return distA - distB;
  });
}

function CopyCoordsButton({ lat, lon }: { lat: number; lon: number }) {
  const text = `${lat},${lon}`;
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
      }}
      style={S.actionBtn}
      title="Copy coordinates"
    >
      <Copy size={12} />
      Copy coords
    </button>
  );
}

export function SwimSection({
  swimLikely,
  swimAccessPointsCount,
  swimAccessPointsByType,
  swimAccessPoints,
}: SwimSectionProps) {
  const count =
    swimAccessPointsCount != null && Number.isFinite(swimAccessPointsCount)
      ? Math.round(swimAccessPointsCount)
      : Array.isArray(swimAccessPoints)
        ? swimAccessPoints.length
        : 0;
  const hasAny =
    swimLikely != null ||
    count > 0 ||
    (swimAccessPointsByType != null && Object.keys(swimAccessPointsByType).length > 0) ||
    (Array.isArray(swimAccessPoints) && swimAccessPoints.length > 0);

  if (!hasAny) return null;

  const statusLabel =
    swimLikely === true
      ? "Swim likely"
      : count > 0
        ? "Possible swim access"
        : "No swim access detected";
  const StatusIcon = swimLikely === true ? Waves : Droplets;
  const confidencePct = swimLikely === true ? 75 : count > 0 ? 40 : 0;

  const typeEntries =
    swimAccessPointsByType && typeof swimAccessPointsByType === "object"
      ? Object.entries(swimAccessPointsByType)
          .filter(([, v]) => Number.isFinite(v) && (v as number) > 0)
          .map(([k, v]) => ({ key: k, count: v as number }))
          .sort((a, b) => b.count - a.count)
      : [];

  let explanation = "";
  if (swimLikely === true && count >= 10) {
    explanation =
      "Multiple mapped water access spots along this trail. Look for shallow entries and calmer edges.";
  } else if (swimLikely === true && count < 10) {
    explanation = "A few mapped water access spots exist—conditions may vary.";
  } else if (swimLikely !== true && count > 0) {
    explanation =
      "Some access points are mapped, but swimming isn't strongly indicated.";
  } else {
    explanation = "No mapped swim access points found near the trail.";
  }
  const safetyNote = swimLikely === true ? " Check water quality/flow after rain." : "";

  const points = Array.isArray(swimAccessPoints) ? swimAccessPoints : [];
  const sorted = sortAccessPoints(points);
  const top2 = sorted.slice(0, 1);
  const hasMore = sorted.length > 1;

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <h2 style={S.title}>Swim</h2>
        <p style={S.subtitle}>Splash potential</p>
      </div>

      <div style={S.headlineRow}>
        <span
          style={{
            ...S.badge,
            background: swimLikely === true ? "#e0f2fe" : "#f1f5f9",
            color: swimLikely === true ? "#0369a1" : "#475569",
          }}
        >
          <StatusIcon size={16} style={{ marginRight: "0.35rem", flexShrink: 0 }} />
          {statusLabel}
        </span>
        <span style={S.countPill}>
          {count} access point{count === 1 ? "" : "s"}
        </span>
      </div>

      <div style={S.barRow}>
        <span style={S.barMuted}>Swim confidence</span>
        <span style={S.barPct}>{confidencePct}%</span>
      </div>
      <div style={S.barOuter}>
        <div
          style={{
            height: "100%",
            width: `${confidencePct}%`,
            minWidth: confidencePct > 0 ? "2px" : 0,
            borderRadius: "9999px",
            background: swimLikely === true ? "#0ea5e9" : "#94a3b8",
            transition: "width 0.2s",
          }}
        />
      </div>

      <div style={S.compactMeta}>
        <span style={S.metaItem}>
          <MapPin size={12} style={{ flexShrink: 0 }} />
          {count} access point{count === 1 ? "" : "s"}
        </span>
        {typeEntries.length > 0 ? (
          <span style={S.metaItem}>
            {typeEntries
              .slice(0, 3)
              .map(({ key, count: n }) => `${humanizeTypeKey(key)}: ${n}`)
              .join(" • ")}
          </span>
        ) : null}
        {swimLikely === true ? (
          <span style={S.metaItem}>
            <Waves size={12} style={{ flexShrink: 0 }} />
            Good chance to splash
          </span>
        ) : null}
      </div>

      <p style={S.explanation}>
        {explanation}
        {safetyNote}
      </p>

      {top2.length > 0 ? (
        <div style={S.spotBlock}>
          <div style={S.spotLabel}>Access point</div>
          {top2.map((point, i) => {
            const kind = (point.kind ?? "access").toString();
            const name = (point.name ?? "Unnamed").toString().trim() || "Unnamed";
            const coords = getLonLat(point);
            return (
              <div key={i} style={S.spotRow}>
                <span style={S.spotIcon}>
                  <Droplets size={14} style={{ color: "#0ea5e9" }} />
                </span>
                <span style={S.spotText}>
                  {humanizeTypeKey(kind)} — {name}
                </span>
                {coords ? (
                  <span style={S.spotActions}>
                    <a
                      href={buildMapsUrl(coords.lat, coords.lon)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={S.actionLink}
                    >
                      <ExternalLink size={12} />
                    </a>
                    <CopyCoordsButton lat={coords.lat} lon={coords.lon} />
                  </span>
                ) : null}
              </div>
            );
          })}
          {hasMore ? (
            <details style={S.allDetails}>
              <summary style={S.detailsSummary}>
                View all access points ({sorted.length})
              </summary>
              <div style={S.allList}>
                {sorted.map((point, i) => {
                  const kind = (point.kind ?? "access").toString();
                  const name = (point.name ?? "Unnamed").toString().trim() || "Unnamed";
                  const coords = getLonLat(point);
                  return (
                    <div key={i} style={S.spotRow}>
                      <span style={S.spotIcon}>
                        <Droplets size={14} style={{ color: "#6b7280" }} />
                      </span>
                      <span style={S.spotText}>
                        {humanizeTypeKey(kind)} — {name}
                      </span>
                      {coords ? (
                        <span style={S.spotActions}>
                          <a
                            href={buildMapsUrl(coords.lat, coords.lon)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={S.actionLink}
                          >
                            <ExternalLink size={12} />
                          </a>
                          <CopyCoordsButton lat={coords.lat} lon={coords.lon} />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

    </section>
  );
}

const S = {
  section: {
    marginTop: 0,
    border: "1px solid #e5e7eb",
    borderRadius: "0.7rem",
    padding: "0.75rem",
  } as const,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  } as const,
  title: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#111827",
    display: "inline-flex",
    alignItems: "center",
  } as const,
  subtitle: { margin: 0, fontSize: "0.78rem", color: "#6b7280" } as const,
  headlineRow: {
    marginTop: "0.35rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.6rem",
    flexWrap: "wrap" as const,
  } as const,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.2rem 0.5rem",
    borderRadius: "0.5rem",
    fontSize: "0.8rem",
    fontWeight: 600,
  } as const,
  countPill: {
    fontSize: "0.82rem",
    fontWeight: 700,
    color: "#111827",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  barRow: {
    marginTop: "0.3rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
  } as const,
  barMuted: { fontSize: "0.75rem", color: "#6b7280" } as const,
  barPct: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#111827",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  barOuter: {
    marginTop: "0.2rem",
    height: "8px",
    width: "100%",
    borderRadius: "9999px",
    overflow: "hidden",
    background: "#e5e7eb",
  } as const,
  compactMeta: {
    marginTop: "0.3rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.3rem 0.55rem",
    alignItems: "center",
  } as const,
  metaItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    fontSize: "0.74rem",
    color: "#475569",
  } as const,
  explanation: {
    marginTop: "0.3rem",
    fontSize: "0.76rem",
    lineHeight: 1.35,
    color: "#374151",
  } as const,
  spotBlock: { marginTop: "0.35rem" } as const,
  spotLabel: { fontSize: "0.72rem", fontWeight: 600, color: "#475569", marginBottom: "0.15rem" } as const,
  spotRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.18rem 0",
    borderBottom: "1px solid #f1f5f9",
    fontSize: "0.74rem",
  } as const,
  spotIcon: { flexShrink: 0 } as const,
  spotText: { flex: "1 1 auto", minWidth: 0 } as const,
  spotActions: { display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 } as const,
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    color: "#0369a1",
    textDecoration: "none",
    fontSize: "0.75rem",
  } as const,
  actionBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.14rem 0.32rem",
    fontSize: "0.68rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.35rem",
    background: "white",
    color: "#374151",
    cursor: "pointer",
  } as const,
  allDetails: { marginTop: "0.15rem" } as const,
  allList: { marginTop: "0.15rem" } as const,
  detailsSummary: {
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#374151",
  } as const,
} as const;
