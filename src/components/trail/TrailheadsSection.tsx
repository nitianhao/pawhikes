"use client";

import { useState } from "react";
import Image from "next/image";
import type { TrailHeadRow, TrailSystemForPage } from "@/lib/data/trailSystem";
import { stripCountrySuffix, formatHoursCompact } from "@/lib/trails/displayFormatters";
import { trailheadImageAlt } from "@/lib/seo/media";

// ─── Formatters (human-friendly, no raw JSON) ─────────────────────────────────
function formatMeters(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "—";
  if (m < 1000) return `~${Math.round(m)} m`;
  return `~${(m / 1000).toFixed(1)} km`;
}

function formatBoolUnknown(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "Unknown";
}

/** Access chip: human label + optional tooltip when data is missing. */
function formatAccessChip(accessValue?: string | null): { label: string; tooltip?: string } {
  const raw = accessValue != null ? String(accessValue).trim() : "";
  if (!raw) {
    return {
      label: "Access not confirmed",
      tooltip: "We couldn't verify access rules for this entry. Check posted signage at the trailhead.",
    };
  }
  const lower = raw.toLowerCase();
  if (lower === "public") return { label: "Public access" };
  if (lower === "permissive") return { label: "Permissive access" };
  if (lower === "private") return { label: "Private land" };
  if (lower === "restricted") return { label: "Restricted access" };
  const titleCase = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return { label: /access$/i.test(titleCase) ? titleCase : `${titleCase} access` };
}

/** Fee chip: human label + optional tooltip when data is missing. */
function formatFeeChip(headFeeLikely?: boolean | null): { label: string; tooltip?: string } {
  if (headFeeLikely === true) return { label: "Fee likely" };
  if (headFeeLikely === false) return { label: "Free parking" };
  return {
    label: "Fee not posted",
    tooltip: "We didn't find fee info. If there's a kiosk or permit sign, follow it to avoid tickets.",
  };
}

/** Distance-to-trail chip: human-readable proximity; tooltip when missing. */
function formatDistanceChip(distanceMeters?: number | null): { label: string; tooltip?: string } {
  const m = distanceMeters != null && Number.isFinite(distanceMeters) ? Number(distanceMeters) : null;
  if (m == null) {
    return {
      label: "Distance not measured",
      tooltip: "We don't have geometry data to calculate distance from this access point to the trail.",
    };
  }
  const rounded = m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10;
  if (m <= 20) return { label: "On trail" };
  if (m <= 100) return { label: `Near trail (~${rounded} m)` };
  return { label: `~${rounded} m from trail` };
}

/** Score for primary selection: higher = better. Used when isPrimary not set. */
function scoreForPrimary(head: TrailHeadRow): number {
  const raw = head.raw && typeof head.raw === "object" ? (head.raw as Record<string, unknown>) : {};
  const distanceMeters =
    raw.distanceMeters != null && Number.isFinite(Number(raw.distanceMeters))
      ? Number(raw.distanceMeters)
      : 9999;
  const distanceScore = Math.max(0, 100 - distanceMeters / 5); // closer = better
  const accessScore =
    head.headAccessClass === "public"
      ? 30
      : head.headAccessClass
        ? 10
        : 0;
  const confidence =
    head.googleMatchConfidence != null && Number.isFinite(head.googleMatchConfidence)
      ? head.googleMatchConfidence
      : 0;
  const reviewScore = Math.min(10, Math.floor((head.googleReviewCount ?? 0) / 5));
  const hasPhoto = head.googlePhotoUri && String(head.googlePhotoUri).trim() !== "" ? 5 : 0;
  return distanceScore + accessScore + confidence * 20 + reviewScore + hasPhoto;
}

function selectPrimaryAndOthers(
  matched: TrailHeadRow[]
): { primary: TrailHeadRow | null; others: TrailHeadRow[] } {
  const primaryByFlag = matched.find((h) => h.isPrimary === true);
  if (primaryByFlag) {
    const others = matched.filter((h) => h.id !== primaryByFlag.id);
    const restSorted = [...others].sort((a, b) => scoreForPrimary(b) - scoreForPrimary(a));
    return { primary: primaryByFlag, others: restSorted };
  }
  const sorted = [...matched].sort((a, b) => scoreForPrimary(b) - scoreForPrimary(a));
  const primary = sorted[0] ?? null;
  const others = primary ? sorted.slice(1) : sorted;
  return { primary, others };
}

const SECTION_STYLE = {
  marginTop: 0,
  border: "1px solid #e5e7eb",
  borderTop: "none",
  borderRadius: "0.75rem",
  padding: "0.9rem",
} as const;

const CARD_STYLE = {
  border: "1px solid #e5e7eb",
  borderRadius: "0.5rem",
  padding: "0.75rem",
  marginTop: "0.5rem",
  backgroundColor: "#fafafa",
} as const;

const PRIMARY_CARD_STYLE = {
  ...CARD_STYLE,
  borderColor: "#059669",
  backgroundColor: "#ecfdf5",
} as const;

const BADGE_STYLE = {
  display: "inline-block",
  padding: "0.2rem 0.45rem",
  borderRadius: "0.375rem",
  fontSize: "0.75rem",
  fontWeight: 600,
  marginRight: "0.35rem",
  marginBottom: "0.35rem",
} as const;

function matchesSystem(head: TrailHeadRow, system: TrailSystemForPage | null): boolean {
  if (!system) return false;
  const systemRef = (system as { systemRef?: string }).systemRef ?? system.extSystemRef;
  if (systemRef != null && systemRef !== "" && head.systemRef === systemRef) return true;
  const raw = head.raw && typeof head.raw === "object" ? head.raw : {};
  if (system.slug != null && (raw as { systemSlug?: string }).systemSlug === system.slug)
    return true;
  if (system.slug != null && head.trailSlug != null && String(head.trailSlug).trim() === String(system.slug).trim())
    return true;
  return false;
}

function TrailheadCard({
  head,
  isPrimary,
  trailContext,
}: {
  head: TrailHeadRow;
  isPrimary: boolean;
  trailContext?: {
    trailName?: string | null;
    cityName?: string | null;
    stateName?: string | null;
  };
}) {
  const raw = head.raw && typeof head.raw === "object" ? (head.raw as Record<string, unknown>) : {};
  const distanceMeters =
    raw.distanceMeters != null && Number.isFinite(Number(raw.distanceMeters))
      ? Number(raw.distanceMeters)
      : null;
  const parking =
    head.parking && typeof head.parking === "object" && !Array.isArray(head.parking)
      ? (head.parking as { capacity?: number; fee?: string; access?: string })
      : null;
  const capacity = parking?.capacity;
  const accessFromParking = parking?.access;
  const accessValue =
    head.headAccessClass ?? (accessFromParking ? String(accessFromParking) : null) ?? null;
  const accessChip = formatAccessChip(accessValue);
  const feeChip = formatFeeChip(head.headFeeLikely);
  const distanceChip = formatDistanceChip(distanceMeters);
  const parkingLabel =
    capacity == null
      ? null
      : capacity === 0
        ? "Street parking likely"
        : capacity <= 10
          ? "Small lot"
          : capacity <= 40
            ? "Medium lot"
            : "Large lot";
  const ratingStr =
    head.googleRating != null && Number.isFinite(head.googleRating)
      ? head.googleRating.toFixed(1)
      : "—";
  const reviewStr =
    head.googleReviewCount != null && Number.isFinite(head.googleReviewCount)
      ? ` (${head.googleReviewCount})`
      : "";
  const title = head.name && String(head.name).trim() ? head.name : "Trailhead";
  const subtitle = head.googleCanonicalName && String(head.googleCanonicalName).trim() && head.googleCanonicalName !== title ? head.googleCanonicalName : null;
  const address = stripCountrySuffix(head.googleAddress);
  const coordsStr =
    head.lat != null && head.lon != null
      ? `${head.lat}, ${head.lon}`
      : head.lat != null
        ? `${head.lat}, —`
        : head.lon != null
          ? `—, ${head.lon}`
          : null;

  const copyCoords = () => {
    if (!coordsStr) return;
    void navigator.clipboard.writeText(coordsStr);
  };

  const cardStyle = isPrimary ? { ...CARD_STYLE, ...PRIMARY_CARD_STYLE } : CARD_STYLE;
  const photoUri = head.googlePhotoUri && String(head.googlePhotoUri).trim() !== "" ? head.googlePhotoUri : null;
  const photoAlt = trailheadImageAlt({
    trailheadName: title,
    trailName: trailContext?.trailName,
    cityName: trailContext?.cityName ?? address,
    stateName: trailContext?.stateName,
  });

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {/* Photo: fixed size, lazy except primary */}
        {photoUri ? (
          <div
            style={{
              flexShrink: 0,
              width: 120,
              height: 90,
              borderRadius: "0.5rem",
              overflow: "hidden",
              backgroundColor: "#e5e7eb",
            }}
          >
            <Image
              src={photoUri}
              alt={photoAlt}
              width={120}
              height={90}
              sizes="120px"
              unoptimized
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
        ) : (
          <div
            style={{
              flexShrink: 0,
              width: 120,
              height: 90,
              borderRadius: "0.5rem",
              backgroundColor: "#f1f5f9",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "1.5rem",
            }}
            aria-hidden
          >
            📍
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name & location */}
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#111827" }}>{title}</div>
          {subtitle && (
            <div style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.15rem" }}>{subtitle}</div>
          )}
          {address && (
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "#475569", lineHeight: 1.4 }}>{address}</p>
          )}
          {(() => {
            const hours = head.headHoursText;
            const rawLines = Array.isArray(hours)
              ? hours.filter((line): line is string => typeof line === "string" && line.trim() !== "")
              : typeof hours === "string" && hours.trim() !== ""
                ? [hours.trim()]
                : [];
            const hoursLines = formatHoursCompact(rawLines);
            if (hoursLines.length === 0) return null;
            return (
              <div style={{ marginTop: "0.35rem", fontSize: "0.8125rem", color: "#475569", lineHeight: 1.35 }}>
                <div style={{ fontWeight: 600, color: "#334155", marginBottom: "0.15rem" }}>Hours</div>
                <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
                  {hoursLines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            );
          })()}

          {/* Quick facts badges */}
          <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
            {isPrimary && (
              <span style={{ ...BADGE_STYLE, background: "#059669", color: "white" }}>Primary</span>
            )}
            <span
              title={accessChip.tooltip}
              style={{ ...BADGE_STYLE, background: "#f1f5f9", color: "#475569" }}
            >
              🔓 {accessChip.label}
            </span>
            <span
              title={feeChip.tooltip}
              style={{ ...BADGE_STYLE, background: "#f1f5f9", color: "#475569" }}
            >
              💵 {feeChip.label}
            </span>
            <span
              title={distanceChip.tooltip}
              style={{ ...BADGE_STYLE, background: "#f1f5f9", color: "#475569" }}
            >
              📍 {distanceChip.label}
            </span>
            {parkingLabel && (
              <span style={{ ...BADGE_STYLE, background: "#f1f5f9", color: "#475569" }}>🅿 {parkingLabel}</span>
            )}
            {(head.googleRating != null || head.googleReviewCount != null) && (
              <span style={{ ...BADGE_STYLE, background: "#f1f5f9", color: "#475569" }}>★ {ratingStr}{reviewStr}</span>
            )}
          </div>

          {/* Actions */}
          <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            {head.googleMapsUrl && (
              <a
                href={head.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: "#fff",
                  backgroundColor: "#15803d",
                  borderRadius: "0.5rem",
                  textDecoration: "none",
                }}
              >
                Navigate
              </a>
            )}
            {coordsStr && (
              <button
                type="button"
                onClick={copyCoords}
                style={{
                  padding: "0.4rem 0.75rem",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  color: "#475569",
                  backgroundColor: "#f1f5f9",
                  border: "1px solid #e2e8f0",
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                }}
              >
                Copy coordinates
              </button>
            )}
            {head.googlePlaceId && head.googleMapsUrl && (
              <a
                href={head.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.8125rem", color: "#2563eb", textDecoration: "none" }}
              >
                View place details
              </a>
            )}
            {head.googleWebsite && (
              <a
                href={head.googleWebsite.startsWith("http") ? head.googleWebsite : `https://${head.googleWebsite}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: "0.8125rem", color: "#2563eb", textDecoration: "none" }}
              >
                Website
              </a>
            )}
            {head.googlePhone && (
              <a
                href={`tel:${head.googlePhone.replace(/\s/g, "")}`}
                style={{ fontSize: "0.8125rem", color: "#2563eb", textDecoration: "none" }}
              >
                {head.googlePhone}
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export type TrailheadsSectionProps = {
  system: TrailSystemForPage | null;
  trailHeads?: TrailHeadRow[];
};

export function TrailheadsSection({ system, trailHeads = [] }: TrailheadsSectionProps) {
  const list = Array.isArray(trailHeads) ? trailHeads : [];
  const matched = system ? list.filter((th) => matchesSystem(th, system)) : [];
  const { primary, others } = selectPrimaryAndOthers(matched);
  const [showAllTrailheads, setShowAllTrailheads] = useState(false);
  const trailContext = {
    trailName: typeof system?.name === "string" ? system.name : null,
    cityName: typeof system?.city === "string" ? system.city : null,
    stateName: typeof system?.state === "string" ? system.state : null,
  };
  const initialOtherCount = primary ? 2 : 3; // show 3 total when primary exists
  const visibleOthers = showAllTrailheads ? others : others.slice(0, initialOtherCount);
  const hiddenOthersCount = Math.max(0, others.length - visibleOthers.length);

  return (
    <section style={SECTION_STYLE}>
      {matched.length === 0 ? (
        <div style={{ marginTop: 0 }}>
          <p style={{ color: "#6b7280", fontSize: "0.9rem", margin: 0 }}>
            {list.length === 0
              ? "No trailheads mapped yet."
              : "No trailheads linked to this system."}
          </p>
        </div>
      ) : (
        <>
          {/* Primary trailhead card */}
          {primary && (
            <>
              <h3 style={{ margin: 0, marginBottom: "0.5rem", fontSize: "1rem", fontWeight: 600, color: "#374151" }}>
                Primary trailhead
              </h3>
              <TrailheadCard head={primary} isPrimary trailContext={trailContext} />
            </>
          )}

          {/* Other access points */}
          {others.length > 0 && (
            <>
              <h3 style={{ margin: "1.25rem 0 0.5rem", fontSize: "1rem", fontWeight: 600, color: "#374151" }}>
                Other access points
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {visibleOthers.map((head) => (
                  <TrailheadCard key={head.id} head={head} isPrimary={false} trailContext={trailContext} />
                ))}
              </div>
              {others.length > initialOtherCount && (
                <div style={{ marginTop: "0.8rem", display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={() => setShowAllTrailheads((prev) => !prev)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                      minWidth: "220px",
                      padding: "0.5rem 1rem",
                      fontSize: "0.84rem",
                      fontWeight: 600,
                      letterSpacing: "0.01em",
                      color: "#0f5132",
                      background: "linear-gradient(180deg, #ecfdf5 0%, #dcfce7 100%)",
                      border: "1px solid #86efac",
                      borderRadius: "9999px",
                      boxShadow: "0 2px 8px rgba(16, 185, 129, 0.15)",
                      cursor: "pointer",
                    }}
                  >
                    {showAllTrailheads
                      ? "Show fewer trailheads"
                      : `Show ${hiddenOthersCount} more trailhead${hiddenOthersCount === 1 ? "" : "s"}`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
