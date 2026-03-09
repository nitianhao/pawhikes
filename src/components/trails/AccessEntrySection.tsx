import type { CSSProperties } from "react";
import { space, type as t, color } from "@/design/tokens";
import { firstSentence } from "@/lib/trails/displayFormatters";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { Disclosure } from "@/components/ui/Disclosure";
import type { Tone } from "@/design/tokens";
import { TrailheadsSection } from "@/components/trail/TrailheadsSection";
import { ParkingSection } from "@/components/trail/ParkingSection";
import { RouteAmenitiesSection } from "@/components/trail/RouteAmenitiesSection";
import type { TrailSystemForPage, TrailHeadRow } from "@/lib/data/trailSystem";
import type { AmenityPoint } from "@/components/trail/AmenityProfileChart";

export type AccessEntrySectionProps = {
  system: TrailSystemForPage | null;
  trailHeads: TrailHeadRow[];
  parkingCapacityEstimate: number | null;
  parkingCount: number | null;
  parkingFeeKnown: boolean | null;
  amenityPoints: AmenityPoint[] | null;
  lengthMilesTotal: number | undefined;
  seoAmenities: string | null;
};

function feeTone(feeKnown: boolean | null): Tone {
  if (feeKnown === false) return "good";
  if (feeKnown === true) return "warn";
  return "neutral";
}

function feeLabel(feeKnown: boolean | null): string {
  if (feeKnown === false) return "Free";
  if (feeKnown === true) return "Paid";
  return "Unknown";
}

const tileGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: space[3],
  marginBottom: space[6],
};

const seoCopyStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  margin: `0 0 ${space[4]}`,
  lineHeight: 1.6,
};

const dividerStyle: CSSProperties = {
  borderTop: `1px solid ${color.borderSubtle}`,
  paddingTop: space[6],
  marginTop: space[6],
};

export function AccessEntrySection({
  system,
  trailHeads,
  parkingCapacityEstimate,
  parkingCount,
  parkingFeeKnown,
  amenityPoints,
  lengthMilesTotal,
  seoAmenities,
}: AccessEntrySectionProps) {
  const parkingCountLabel =
    parkingCount != null ? String(parkingCount) : "Unknown";
  const capacityLabel =
    parkingCapacityEstimate != null ? String(parkingCapacityEstimate) : "—";

  return (
    <Section
      id="access"
      title="Access & Entry"
      subtitle="Trailheads, parking, and entry logistics for hiking with dogs"
    >
      {/* Parking stat row */}
      <div style={tileGridStyle}>
        <StatTile label="Parking Lots" value={parkingCountLabel} tone="neutral" />
        <StatTile label="Capacity" value={capacityLabel} note={capacityLabel !== "—" ? "spaces est." : undefined} tone="neutral" />
        <StatTile label="Fee" value={feeLabel(parkingFeeKnown)} tone={feeTone(parkingFeeKnown)} />
      </div>

      {firstSentence(seoAmenities) && <p style={seoCopyStyle}>{firstSentence(seoAmenities)}</p>}

      {/* Trailheads — primary content */}
      <TrailheadsSection system={system} trailHeads={trailHeads} />

      {/* Route amenities */}
      <div style={dividerStyle}>
        <RouteAmenitiesSection
          trailheadPOIs={system?.trailheadPOIs}
          amenityPoints={amenityPoints}
          lengthMilesTotal={lengthMilesTotal}
        />
      </div>

      {/* Parking detail — secondary */}
      <div style={{ marginTop: space[3] }}>
        <Disclosure label="Parking details">
          <ParkingSection
            parkingCapacityEstimate={parkingCapacityEstimate}
            parkingCount={parkingCount}
            parkingFeeKnown={parkingFeeKnown}
          />
        </Disclosure>
      </div>
    </Section>
  );
}
