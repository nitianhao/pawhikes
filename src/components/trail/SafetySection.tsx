"use client";

import {
  ExternalLink,
  Globe,
  HeartPulse,
  MapPin,
  Shield,
} from "lucide-react";

type SafetySectionProps = {
  nearbyVets?: any[] | null;
  trailName?: string | null;
  city?: string | null;
  state?: string | null;
};

type VetCard = {
  name: string;
  kind: string;
  lat: number;
  lon: number;
  distanceMeters: number;
  distanceLabel: string;
  website?: string;
  addressLine?: string;
  mapsUrl: string;
  raw: Record<string, unknown>;
};

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getLonLat(poi: any): { lon: number; lat: number } | null {
  const coords = poi?.location?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lon = asNumber(coords[0]);
    const lat = asNumber(coords[1]);
    if (lon != null && lat != null && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
      return { lon, lat };
    }
  }
  const lon = asNumber(poi?.lon ?? poi?.lng);
  const lat = asNumber(poi?.lat);
  if (lon != null && lat != null && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90) {
    return { lon, lat };
  }
  return null;
}

const METERS_PER_MILE = 1609.344;

function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round(meters)} m`;
  return `${miles.toFixed(1)} mi`;
}

function buildMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

function extractAddress(tags: Record<string, any>): string | undefined {
  const street = tags?.["addr:street"];
  const num = tags?.["addr:housenumber"];
  const postcode = tags?.["addr:postcode"];
  const city = tags?.["addr:city"];
  const parts: string[] = [];
  if (num && street) parts.push(`${num} ${street}`);
  else if (street) parts.push(String(street));
  if (city) parts.push(String(city));
  if (postcode) parts.push(String(postcode));
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function extractWebsite(poi: any): string | undefined {
  const w = poi?.tags?.website ?? poi?.tags?.["contact:website"] ?? poi?.website;
  if (typeof w === "string" && /^https?:\/\//.test(w.trim())) return w.trim();
  return undefined;
}

function kindLabel(kind: string): string {
  if (kind === "emergency_vet") return "Emergency vet";
  if (kind === "animal_hospital") return "Animal hospital";
  if (kind === "veterinary") return "Veterinary";
  return kind
    ? kind.charAt(0).toUpperCase() + kind.slice(1).replace(/_/g, " ")
    : "Vet";
}

function normalizeVets(raw: unknown): VetCard[] {
  if (!Array.isArray(raw)) return [];
  const cards: VetCard[] = [];
  for (const poi of raw) {
    if (!poi || typeof poi !== "object") continue;
    const pos = getLonLat(poi);
    if (!pos) continue;
    const name =
      typeof poi.name === "string" && poi.name.trim()
        ? poi.name.trim()
        : "Unnamed clinic";
    const dist = asNumber(poi.distanceToCentroidMeters) ?? Infinity;
    const tags: Record<string, any> =
      poi.tags && typeof poi.tags === "object" ? poi.tags : {};
    cards.push({
      name,
      kind: typeof poi.kind === "string" ? poi.kind : "unknown",
      lat: pos.lat,
      lon: pos.lon,
      distanceMeters: dist,
      distanceLabel: formatDistance(dist),
      website: extractWebsite(poi),
      addressLine: extractAddress(tags),
      mapsUrl: buildMapsUrl(pos.lat, pos.lon),
      raw: poi as Record<string, unknown>,
    });
  }
  cards.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return cards;
}

export function SafetySection({
  nearbyVets,
}: SafetySectionProps) {
  const vets = normalizeVets(nearbyVets);
  const nearest = vets[0];
  const hasVets = vets.length > 0;

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <div style={S.titleWrap}>
          <Shield size={18} style={{ color: "#dc2626", flexShrink: 0 }} />
          <h2 style={S.title}>Dog Emergency</h2>
        </div>
        <p style={S.subtitle}>Emergency help nearby</p>
      </div>

      {/* Snapshot chips */}
      <div style={S.chipsRow}>
        <span style={S.chip}>
          <HeartPulse size={13} style={{ flexShrink: 0, color: "#dc2626" }} />
          {nearest
            ? `Nearest vet: ${nearest.distanceLabel}`
            : "No nearby vets found"}
        </span>
      </div>

      {/* Vet list - all vets shown expanded */}
      {hasVets ? (
        <div style={S.vetList}>
          {vets.map((vet, i) => (
            <VetRow key={i} vet={vet} />
          ))}
        </div>
      ) : (
        <p style={S.emptyNote}>No nearby veterinary clinics were found within search radius.</p>
      )}
    </section>
  );
}

function VetRow({ vet }: { vet: VetCard }) {
  return (
    <div style={S.vetRow}>
      <div style={S.vetIcon}>
        <HeartPulse size={16} style={{ color: "#dc2626" }} />
      </div>
      <div style={S.vetInfo}>
        <p style={S.vetName}>{vet.name}</p>
        <p style={S.vetMeta}>
          {vet.distanceLabel} from trail · {kindLabel(vet.kind)}
          {vet.addressLine ? ` · ${vet.addressLine}` : ""}
        </p>
      </div>
      <div style={S.vetActions}>
        <a
          href={vet.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={S.iconBtn}
          title="Open in Maps"
        >
          <MapPin size={14} />
        </a>
        {vet.website ? (
          <a
            href={vet.website}
            target="_blank"
            rel="noopener noreferrer"
            style={S.iconBtn}
            title="Website"
          >
            <Globe size={14} />
          </a>
        ) : null}
        {vet.addressLine ? (
          <CopyButton text={vet.addressLine} title="Copy address" />
        ) : null}
      </div>
    </div>
  );
}

function CopyButton({ text, title }: { text: string; title: string }) {
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard;
  if (!canCopy) return null;
  return (
    <button
      type="button"
      style={S.iconBtn}
      title={title}
      onClick={() => {
        navigator.clipboard.writeText(text).catch(() => {});
      }}
    >
      <ExternalLink size={14} />
    </button>
  );
}

const S = {
  section: {
    marginTop: "1.25rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    padding: "0.9rem",
  } as const,
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
  } as const,
  titleWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
  } as const,
  title: { margin: 0, fontSize: "1.2rem", fontWeight: 600, color: "#111827" } as const,
  subtitle: { margin: 0, fontSize: "0.85rem", color: "#6b7280" } as const,
  chipsRow: {
    marginTop: "0.5rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.35rem",
  } as const,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.55rem",
    padding: "0.2rem 0.5rem",
    fontSize: "0.82rem",
    color: "#374151",
    background: "#fff",
    whiteSpace: "nowrap" as const,
  } as const,
  vetList: {
    marginTop: "0.55rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.35rem",
  } as const,
  vetRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    padding: "0.45rem 0.55rem",
    border: "1px solid #f1f5f9",
    borderRadius: "0.55rem",
    background: "#fafafa",
  } as const,
  vetIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    background: "#fef2f2",
    flexShrink: 0,
  } as const,
  vetInfo: {
    flex: 1,
    minWidth: 0,
  } as const,
  vetName: {
    margin: 0,
    fontWeight: 600,
    fontSize: "0.88rem",
    color: "#111827",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as const,
  vetMeta: {
    margin: "0.1rem 0 0",
    fontSize: "0.78rem",
    color: "#6b7280",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  } as const,
  vetActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    flexShrink: 0,
  } as const,
  iconBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: "0.4rem",
    border: "1px solid #e5e7eb",
    background: "#fff",
    color: "#374151",
    cursor: "pointer",
    textDecoration: "none",
    padding: 0,
    fontSize: 0,
  } as const,
  emptyNote: {
    margin: "0.55rem 0 0",
    fontSize: "0.85rem",
    color: "#6b7280",
  } as const,
} as const;
