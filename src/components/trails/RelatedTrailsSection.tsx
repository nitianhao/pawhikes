import type { CSSProperties } from "react";
import Link from "next/link";
import { space, type as t, color, radius } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { slugifyCity } from "@/lib/slug";
import { cityDirectoryAriaLabel } from "@/lib/seo/anchors";

export type RelatedTrailsSectionProps = {
  city: string;
  state: string;
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

export function RelatedTrailsSection({ city, state }: RelatedTrailsSectionProps) {
  const statePath = `/${encodeURIComponent(state)}`;
  const cityPath = `/${encodeURIComponent(state)}/${encodeURIComponent(slugifyCity(city))}`;
  const cityAria = cityDirectoryAriaLabel({ cityName: city, stateName: state });
  return (
    <Section
      id="related-trails"
      title={`More ${city} Trails`}
      subtitle={`Find other dog-friendly trails in ${city}, ${state}`}
    >
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
    </Section>
  );
}
