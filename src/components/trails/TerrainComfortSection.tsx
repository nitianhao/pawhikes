import type { CSSProperties } from "react";
import { space, type as t, color } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import type { Tone } from "@/design/tokens";
import { ElevationWidthSection, type ElevationProfile } from "@/components/trail/ElevationWidthSection";
import { SurfaceSection } from "@/components/trail/SurfaceSection";
import { ShadeSection, getShadeTierLabel } from "@/components/trail/ShadeSection";
import { WaterSection } from "@/components/trail/WaterSection";
import type { ShadeProfilePoint } from "@/components/trail/ShadeProfileChart";

export type TerrainComfortSectionProps = {
  // Elevation / effort
  elevationProfile: ElevationProfile | null;
  elevationProfilePoints: { d: number; e: number }[] | null;
  totalGainFt: number | null;
  maxFt: number | null;
  minFt: number | null;
  lengthMiles: number | null;
  gradP50: number | null;
  gradP90: number | null;
  widthSummary: { min?: number; max?: number; p50?: number; p90?: number; unknownPct?: number } | null;
  // Surface
  surfaceSummary: unknown;
  surfaceBreakdown: unknown;
  roughnessRisk: string | undefined;
  roughnessRiskScore: number | undefined;
  roughnessRiskKnownSamples: number | undefined;
  surfaceProfilePoints: { d: number; surface: string }[] | null;
  // Shade
  shadeClass: string | null;
  shadeProxyPercent: number | null;
  shadeProxyScore: number | undefined;
  shadeSources: unknown;
  shadeProfilePoints: ShadeProfilePoint[] | null;
  // Water
  waterNearScore: number | undefined;
  waterNearPercent: number | undefined;
  waterTypesNearby: string[] | string | undefined;
  swimLikely: boolean | undefined;
  waterProfilePoints: { d: number; type: string }[] | null;
  // Shared
  lengthMilesTotal: number | undefined;
  // SEO copy
  seoTerrain: string | null;
  seoSurface: string | null;
  seoShade: string | null;
  seoWater: string | null;
};

function firstSentence(text: string): string {
  const m = text.match(/^[^.!?]*[.!?]/);
  return m ? m[0].trim() : text;
}

const EFFORT_SHORT: Record<string, string> = {
  "Mostly Flat": "Flat",
  "Rolling Hills": "Rolling",
  "Challenging Climb": "Challenging",
  "Steep Workout": "Steep",
};

function waterSummaryLabel(pct: number | null | undefined): string {
  if (pct == null) return "Unknown";
  if (pct < 0.2) return "None";
  if (pct < 0.5) return "Some";
  if (pct < 0.8) return "Moderate";
  return "Good";
}

function shadeTone(shadeClass: string | null | undefined): Tone {
  const c = String(shadeClass ?? "").trim().toUpperCase();
  if (c === "HIGH") return "good";
  if (c === "MEDIUM") return "warn";
  return "warn";
}

const dividerStyle: CSSProperties = {
  borderTop: `1px solid ${color.borderSubtle}`,
  paddingTop: space[6],
  marginTop: space[6],
};

const subheadStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 600,
  lineHeight: 1.35,
  color: color.textSecondary,
  margin: `0 0 ${space[3]}`,
};

const seoCopyStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  margin: `0 0 ${space[4]}`,
  lineHeight: 1.6,
};

const tileGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: space[3],
  marginBottom: space[6],
};

export function TerrainComfortSection({
  elevationProfile,
  elevationProfilePoints,
  totalGainFt,
  maxFt,
  minFt,
  lengthMiles,
  gradP50,
  gradP90,
  widthSummary,
  surfaceSummary,
  surfaceBreakdown,
  roughnessRisk,
  roughnessRiskScore,
  roughnessRiskKnownSamples,
  surfaceProfilePoints,
  shadeClass,
  shadeProxyPercent,
  shadeProxyScore,
  shadeSources,
  shadeProfilePoints,
  waterNearScore,
  waterNearPercent,
  waterTypesNearby,
  swimLikely,
  waterProfilePoints,
  lengthMilesTotal,
  seoTerrain,
  seoSurface,
  seoShade,
  seoWater,
}: TerrainComfortSectionProps) {
  const effortLabel = elevationProfile?.label ?? "—";
  const effortTileLabel = EFFORT_SHORT[effortLabel] ?? effortLabel;
  const surfaceDominant =
    (surfaceSummary as { dominant?: string } | null | undefined)?.dominant ?? "—";
  const surfaceLabel =
    surfaceDominant !== "—"
      ? surfaceDominant.charAt(0).toUpperCase() + surfaceDominant.slice(1).toLowerCase()
      : "Mixed";
  const shadeLabel = getShadeTierLabel(shadeClass, shadeProxyPercent);
  const waterLabel = waterSummaryLabel(waterNearPercent);

  return (
    <Section
      id="terrain"
      title="Terrain & Comfort"
      subtitle="Elevation, surface, shade, heat, and water signals for dog hiking comfort"
    >
      {/* Overview tiles */}
      <div style={tileGridStyle}>
        <StatTile label="Effort" value={effortTileLabel} tone="neutral" />
        <StatTile label="Surface" value={surfaceLabel} tone="neutral" />
        <StatTile label="Shade" value={shadeLabel} tone={shadeTone(shadeClass)} />
        <StatTile label="Water" value={waterLabel} tone="neutral" />
      </div>

      {/* Elevation subsection */}
      <div>
        <h3 style={subheadStyle}>Elevation & Width</h3>
        {seoTerrain && <p style={seoCopyStyle}>{firstSentence(seoTerrain)}</p>}
        <ElevationWidthSection
          elevationProfile={elevationProfile}
          elevationProfilePoints={elevationProfilePoints}
          totalGainFt={totalGainFt}
          maxFt={maxFt}
          minFt={minFt}
          lengthMiles={lengthMiles}
          gradP50={gradP50}
          gradP90={gradP90}
          widthSummary={widthSummary}
        />
      </div>

      {/* Surface subsection */}
      <div style={dividerStyle}>
        <h3 style={subheadStyle}>Surface & Paws</h3>
        {seoSurface && <p style={seoCopyStyle}>{firstSentence(seoSurface)}</p>}
        <SurfaceSection
          surfaceSummary={surfaceSummary}
          surfaceBreakdown={surfaceBreakdown}
          roughnessRisk={roughnessRisk}
          roughnessRiskScore={roughnessRiskScore}
          roughnessRiskKnownSamples={roughnessRiskKnownSamples}
          surfaceProfilePoints={surfaceProfilePoints}
          lengthMilesTotal={lengthMilesTotal}
        />
      </div>

      {/* Shade subsection */}
      <div style={dividerStyle}>
        <h3 style={subheadStyle}>Shade & Heat</h3>
        {seoShade && <p style={seoCopyStyle}>{firstSentence(seoShade)}</p>}
        <ShadeSection
          shadeClass={shadeClass ?? undefined}
          shadeProxyPercent={shadeProxyPercent ?? undefined}
          shadeProxyScore={shadeProxyScore}
          shadeSources={shadeSources}
          shadeProfilePoints={shadeProfilePoints}
          lengthMilesTotal={lengthMilesTotal}
        />
      </div>

      {/* Water subsection */}
      <div style={dividerStyle}>
        <h3 style={subheadStyle}>Water Access</h3>
        {seoWater && <p style={seoCopyStyle}>{firstSentence(seoWater)}</p>}
        <WaterSection
          waterNearScore={waterNearScore}
          waterNearPercent={waterNearPercent}
          waterTypesNearby={waterTypesNearby}
          swimLikely={swimLikely}
          waterProfilePoints={waterProfilePoints}
          lengthMilesTotal={lengthMilesTotal}
        />
      </div>
    </Section>
  );
}
