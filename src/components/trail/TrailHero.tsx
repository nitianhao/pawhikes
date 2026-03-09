import type { CSSProperties } from "react";
import { Medal, Navigation } from "lucide-react";
import { space, radius, shadow, type as t, color, toneColors, type Tone } from "@/design/tokens";
import { StatTile } from "@/components/ui/StatTile";

export type TrailHeroProps = {
  name: string;
  city: string | null;
  state: string | null;
  county: string | null;
  distanceMiles: number | null;
  routeTypeLabel: string | null;
  verdict: string | null;
  dogsAllowed: string | null;
  leashPolicy: string | null;
  effortLabel: string | null;
  shadeClass: string | null;
  shadeProxyPercent: number | null;
  hasCertifiedPolicy: boolean;
  policySourceTitle: string | null;
  policySourceUrl: string | null;
  bestEntryName: string | null;
  bestEntryUrl: string;
  seasonGuidance: string | null;
};

const EFFORT_SHORT: Record<string, string> = {
  "Mostly Flat": "Flat",
  "Rolling Hills": "Rolling",
  "Challenging Climb": "Challenging",
  "Steep Workout": "Strenuous",
};

function dogsTone(raw: string | null): Tone {
  if (!raw) return "neutral";
  const s = raw.toLowerCase();
  if (/yes|allowed/.test(s)) return "good";
  if (/no|not allowed|prohibited/.test(s)) return "risk";
  return "neutral";
}

function dogsValue(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/yes|allowed/.test(s)) return "Allowed";
  if (/no|not allowed|prohibited/.test(s)) return "Not allowed";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function leashTone(raw: string | null): Tone {
  if (!raw) return "neutral";
  const s = raw.toLowerCase();
  if (/off[- ]?leash|leash[- ]?optional/.test(s)) return "good";
  if (/on[- ]?leash|required/.test(s)) return "warn";
  return "neutral";
}

function leashValue(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  if (/off[- ]?leash|leash[- ]?optional/.test(s)) return "Off-leash";
  if (/on[- ]?leash|required/.test(s)) return "Required";
  if (/conditional/.test(s)) return "Conditional";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function shadeTone(shadeClass: string | null, pct: number | null): Tone {
  const c = (shadeClass ?? "").toLowerCase();
  if (c === "high") return "good";
  if (c === "medium") return "neutral";
  if (c === "low") return "warn";
  if (pct != null) {
    if (pct >= 0.6) return "good";
    if (pct >= 0.3) return "neutral";
    return "warn";
  }
  return "neutral";
}

function shadeValue(shadeClass: string | null, pct: number | null): string | null {
  const c = (shadeClass ?? "").toLowerCase();
  if (c === "high") return "High shade";
  if (c === "medium") return "Some shade";
  if (c === "low") return "Exposed";
  if (pct != null) return `${Math.round(pct * 100)}% shaded`;
  return null;
}

const heroStyle: CSSProperties = {
  backgroundColor: color.surface,
  border: `1px solid ${color.border}`,
  borderTop: "3px solid #15803d",
  borderRadius: radius.lg,
  boxShadow: shadow.card,
  display: "flex",
  flexDirection: "column",
  gap: space[4],
};


const metaLineStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  margin: 0,
};

const verdictStyle: CSSProperties = {
  ...t.body,
  color: color.textSecondary,
  margin: 0,
  maxWidth: "52rem",
};

const tilesRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))",
  gap: space[2],
};

const dividerStyle: CSSProperties = {
  borderTop: `1px solid ${color.borderSubtle}`,
  paddingTop: space[4],
  display: "flex",
  flexDirection: "column",
  gap: space[3],
};

const trustRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: space[3],
  rowGap: space[2],
};

const certBadgeStyle = (certified: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: space[2],
  backgroundColor: certified ? color.warn.bg : color.neutral.bg,
  color: certified ? color.warn.text : color.neutral.text,
  border: `1px solid ${certified ? color.warn.border : color.neutral.border}`,
  borderRadius: radius.pill,
  padding: `2px 10px`,
  ...t.meta,
  fontWeight: 600,
});

const sourceStyle: CSSProperties = {
  ...t.meta,
  color: color.textMuted,
};

const sourceLinkStyle: CSSProperties = {
  ...t.meta,
  color: color.green700,
  textDecoration: "underline",
};

const seasonStyle: CSSProperties = {
  ...t.meta,
  color: color.textMuted,
};

const bestEntryStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: space[2],
  ...t.meta,
  color: color.textSecondary,
};

const bestEntryLinkStyle: CSSProperties = {
  color: color.green700,
  textDecoration: "underline",
  ...t.meta,
  fontWeight: 500,
};

function sourceDisplayLabel(url: string | null, title: string | null): string {
  if (title?.trim()) return title.trim();
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function TrailHero({
  name,
  city,
  state,
  county,
  distanceMiles,
  routeTypeLabel,
  verdict,
  dogsAllowed,
  leashPolicy,
  effortLabel,
  shadeClass,
  shadeProxyPercent,
  hasCertifiedPolicy,
  policySourceTitle,
  policySourceUrl,
  bestEntryName,
  bestEntryUrl,
  seasonGuidance,
}: TrailHeroProps) {
  const locationParts = [
    city && state ? `${city}, ${state}` : city ?? state ?? null,
    county ? `${county} County` : null,
  ].filter(Boolean) as string[];

  const specParts = [
    distanceMiles != null ? `${distanceMiles.toFixed(1)} mi` : null,
    routeTypeLabel,
  ].filter(Boolean) as string[];

  const hasLocation = locationParts.length > 0;
  const hasSpecs = specParts.length > 0;

  const sourceText = sourceDisplayLabel(policySourceUrl, policySourceTitle);

  const dogsTileValue = dogsValue(dogsAllowed);
  const dogsTileTone = dogsTone(dogsAllowed);
  const leashTileValue = leashValue(leashPolicy);
  const leashTileTone = leashTone(leashPolicy);
  const effortTileValue = effortLabel ? (EFFORT_SHORT[effortLabel] ?? effortLabel) : null;
  const shadeTileValue = shadeValue(shadeClass, shadeProxyPercent);
  const shadeTileTone = shadeTone(shadeClass, shadeProxyPercent);

  return (
    <div className="trail-hero" style={heroStyle}>
      {/* Name */}
      <h1 className="trail-hero__title">{name || "Trail"}</h1>

      {/* Location meta — spans allow CSS to break into two lines on mobile */}
      {(hasLocation || hasSpecs) && (
        <p style={metaLineStyle} className="trail-hero__meta">
          {hasLocation && (
            <span className="trail-hero__meta-location">
              {locationParts.join(" · ")}
            </span>
          )}
          {hasLocation && hasSpecs && (
            <span className="trail-hero__meta-sep"> · </span>
          )}
          {hasSpecs && (
            <span className="trail-hero__meta-specs">
              {specParts.join(" · ")}
            </span>
          )}
        </p>
      )}

      {/* Verdict */}
      {verdict && <p style={verdictStyle}>{verdict}</p>}

      {/* Stat tiles */}
      <div style={tilesRowStyle} className="trail-hero__tiles">
        {dogsTileValue && (
          <StatTile label="Dogs allowed" value={dogsTileValue} tone={dogsTileTone} />
        )}
        {leashTileValue && (
          <StatTile label="Leash rule" value={leashTileValue} tone={leashTileTone} />
        )}
        {effortTileValue && (
          <StatTile label="Trail effort" value={effortTileValue} tone="neutral" />
        )}
        {shadeTileValue && (
          <StatTile label="Shade" value={shadeTileValue} tone={shadeTileTone} />
        )}
      </div>

      {/* Trust row + best entry */}
      <div style={dividerStyle}>
        <div style={trustRowStyle} className="trail-hero__trust-row">
          {/* Certified / available badge */}
          <span style={certBadgeStyle(hasCertifiedPolicy)}>
            {hasCertifiedPolicy && (
              <Medal size={12} aria-hidden style={{ flexShrink: 0 }} />
            )}
            {hasCertifiedPolicy ? "Certified dog policy" : "Dog policy available"}
          </span>

          {/* Source link */}
          {sourceText && (
            <span style={sourceStyle}>
              Source:{" "}
              {policySourceUrl ? (
                <a
                  href={policySourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={sourceLinkStyle}
                >
                  {sourceText}
                </a>
              ) : (
                sourceText
              )}
            </span>
          )}

          {/* Season guidance */}
          {seasonGuidance && (
            <span style={seasonStyle}>{seasonGuidance}</span>
          )}
        </div>

        {/* Best entry */}
        {(bestEntryName || true) && (
          <div style={bestEntryStyle} className="trail-hero__best-entry">
            <Navigation size={13} aria-hidden style={{ flexShrink: 0, color: toneColors("neutral").icon }} />
            <span>Best entry:</span>
            {bestEntryName ? (
              <a
                href={bestEntryUrl}
                target={bestEntryUrl.startsWith("http") ? "_blank" : undefined}
                rel={bestEntryUrl.startsWith("http") ? "noreferrer" : undefined}
                style={bestEntryLinkStyle}
              >
                {bestEntryName}
              </a>
            ) : (
              <span style={{ color: color.textMuted }}>See trailheads below</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
