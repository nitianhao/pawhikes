import Link from "next/link";
import { trailGuideAriaLabel, trailGuideCtaLabel } from "@/lib/seo/anchors";

export type TrailCardData = {
  id: string;
  name: string;
  cityLabel: string;
  stateCode: string;
  href: string;
  lengthMiles: number | null;
  elevationGainFt: number | null;
  leashPolicy: string | null;
  shadePercent: number | null;
  waterPercent: number | null;
  surfacePrimary: string | null;
};

function toDisplayPct(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  // shadePercent / waterPercent stored as 0–1 decimal
  return Math.round(value <= 1 ? value * 100 : value);
}

export function TrailCard({ trail }: { trail: TrailCardData }) {
  const miles = trail.lengthMiles != null && trail.lengthMiles > 0
    ? `${trail.lengthMiles.toFixed(1)} mi`
    : null;

  const elevFt = trail.elevationGainFt != null && trail.elevationGainFt > 0
    ? `↑ ${Math.round(trail.elevationGainFt)} ft`
    : null;

  const shadePct = toDisplayPct(trail.shadePercent);
  const waterPct = toDisplayPct(trail.waterPercent);

  const ctaLabel = trailGuideCtaLabel(trail.name);
  const ctaAriaLabel = trailGuideAriaLabel({
    trailName: trail.name,
    cityName: trail.cityLabel,
    stateName: trail.stateCode,
  });

  return (
    <article className="featured-trail-card">
      <div className="featured-trail-card__body">
        {/* Location */}
        <p className="featured-trail-card__location">
          {trail.cityLabel}, {trail.stateCode}
        </p>

        {/* Name + distance */}
        <div className="featured-trail-card__name-row">
          <h3 className="featured-trail-card__title">{trail.name}</h3>
          {miles && (
            <span className="featured-trail-card__distance">{miles}</span>
          )}
        </div>

        {/* Elevation */}
        {elevFt && (
          <p className="featured-trail-card__elevation">{elevFt} gain</p>
        )}

        {/* Attributes */}
        <div className="featured-trail-card__attrs">
          {trail.leashPolicy && (
            <span className="featured-trail-card__chip featured-trail-card__chip--policy">
              Leash: {trail.leashPolicy}
            </span>
          )}
          {shadePct != null && (
            <span className="featured-trail-card__chip">
              {shadePct}% shade
            </span>
          )}
          {waterPct != null && waterPct > 0 && (
            <span className="featured-trail-card__chip">
              {waterPct}% water
            </span>
          )}
          {trail.surfacePrimary && (
            <span className="featured-trail-card__chip">
              {trail.surfacePrimary}
            </span>
          )}
        </div>

        {/* CTA */}
        <Link href={trail.href} className="featured-trail-card__cta" aria-label={ctaAriaLabel} title={ctaAriaLabel}>
          {ctaLabel} <span className="featured-trail-card__cta-arrow" aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
