import type { CSSProperties } from "react";
import Link from "next/link";
import { space, type as t, color, radius } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { slugifyCity } from "@/lib/slug";
import { cityDirectoryAriaLabel, trailGuideAriaLabel } from "@/lib/seo/anchors";
import { resolveStateName } from "@/lib/seo/entities";
import type { RelatedTrailCardCandidate } from "@/lib/trails/relatedTrails";

export type RelatedTrailsSectionProps = {
  city: string;
  state: string;
  relatedTrails?: RelatedTrailCardCandidate[];
};

const wrapStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: space[4],
  padding: `${space[4]} 0`,
  textAlign: "center",
};

const noteStyle: CSSProperties = {
  ...t.meta,
  color: color.textMuted,
  margin: 0,
};

const ctaStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: space[2],
  padding: `${space[3]} ${space[6]}`,
  background: color.green700,
  color: "#fff",
  borderRadius: radius.md,
  ...t.meta,
  fontWeight: 600,
  textDecoration: "none",
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

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: "0.5rem",
  marginBottom: "0.55rem",
};

const cardNameStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: "0.9375rem",
  color: "#111827",
  lineHeight: 1.3,
  minWidth: 0,
};

const cardDistStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: "0.9375rem",
  color: "#14532d",
  whiteSpace: "nowrap",
  flexShrink: 0,
};

const chipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.25rem",
  marginBottom: "0.3rem",
};

const envChipRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.25rem",
};

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

const helperTextStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  margin: `0 0 ${space[3]}`,
};

export function RelatedTrailsSection({ city, state, relatedTrails }: RelatedTrailsSectionProps) {
  const statePath = `/${encodeURIComponent(state)}`;
  const cityPath = `/${encodeURIComponent(state)}/${encodeURIComponent(slugifyCity(city))}`;
  const cityAria = cityDirectoryAriaLabel({ cityName: city, stateName: state });
  const hasRelated = Array.isArray(relatedTrails) && relatedTrails.length > 0;
  const stateName = resolveStateName(state);
  const relatedCount = hasRelated ? relatedTrails.length : 0;
  const sourceBuckets = hasRelated
    ? new Set(relatedTrails.map((trail) => trail.sourceBucket))
    : new Set<RelatedTrailCardCandidate["sourceBucket"]>();
  const onlySameCity = hasRelated && sourceBuckets.size === 1 && sourceBuckets.has("sameCity");
  const onlySameState = hasRelated && sourceBuckets.size === 1 && sourceBuckets.has("sameState");

  const sectionTitle = hasRelated
    ? onlySameState
      ? `More trails in ${stateName}`
      : `More ${city} trails`
    : `More ${city} Trails`;

  const sectionSubtitle = hasRelated
    ? onlySameState
      ? relatedCount === 1
        ? `Another dog-friendly option in a different ${stateName} city`
        : `Dog-friendly options from other cities across ${stateName}`
      : relatedCount === 1
        ? `Another dog-friendly option in ${city}`
        : `Dog-friendly trails in ${city} you can explore next`
    : `Find other dog-friendly trails in ${city}, ${state}`;
  return (
    <Section
      id="related-trails"
      title={sectionTitle}
      subtitle={sectionSubtitle}
    >
      {hasRelated ? (
        <div>
          {onlySameCity ? (
            <p style={helperTextStyle}>
              Browse more dog-friendly options nearby, or view the{" "}
              <Link href={cityPath} aria-label={cityAria} title={cityAria} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
                full {city} trail directory
              </Link>
              .
            </p>
          ) : onlySameState ? (
            <p style={helperTextStyle}>
              Looking for a wider search? Browse{" "}
              <Link href={statePath} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
                all {stateName} trail listings
              </Link>
              .
            </p>
          ) : null}
          <ul style={gridStyle}>
            {relatedTrails.map((trail) => {
              const trailAriaLabel = trailGuideAriaLabel({
                trailName: trail.name,
                cityName: trail.cityName,
                stateName: trail.stateName,
              });

              return (
                <li key={trail.id}>
                  <Link
                    href={trail.href}
                    aria-label={trailAriaLabel}
                    title={trailAriaLabel}
                    style={cardLinkStyle}
                    className="city-trail-card"
                  >
                    <div style={cardHeaderStyle}>
                      <div style={cardNameStyle}>{trail.name}</div>
                      <div style={cardDistStyle}>{trail.distance}</div>
                    </div>

                    {(trail.dogsAllowed || trail.leashPolicy) && (
                      <div style={chipRowStyle}>
                        {trail.dogsAllowed && <span style={policyChipStyle}>🐾 {trail.dogsAllowed}</span>}
                        {trail.leashPolicy && <span style={policyChipStyle}>Leash: {trail.leashPolicy}</span>}
                      </div>
                    )}

                    {(trail.shade || trail.heat) && (
                      <div style={envChipRowStyle}>
                        {trail.shade && <span style={envChipStyle}>{trail.shade} shade</span>}
                        {trail.heat && <span style={envChipStyle}>{trail.heat} heat</span>}
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div style={wrapStyle}>
          <p style={noteStyle}>
            Looking for more places to explore with your dog? Browse the{" "}
            <Link href={cityPath} aria-label={cityAria} title={cityAria} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
              {city} trail directory
            </Link>
            {" "}or the{" "}
            <Link href={statePath} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
              {state} state trail listings
            </Link>
            .
          </p>
          <Link href="/" style={ctaStyle} aria-label="Browse all states and city dog-friendly trail directories">
            Browse all state and city trails
          </Link>
        </div>
      )}
    </Section>
  );
}
