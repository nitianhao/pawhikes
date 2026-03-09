import { Section } from "@/components/ui/Section";
import { TrailSegmentsMapClient } from "@/components/trail/TrailSegmentsMap.client";
import type { AmenityPoint, ParkingPoint } from "@/lib/geo/amenities";
import type { Highlight } from "@/lib/highlights/types";
import type {
  TrailMapBailoutSpot,
  TrailHeadSelectionMethod,
  TrailMapHead,
} from "@/components/trail/TrailSegmentsMap";
import type { VetPoint } from "@/components/trail/TrailSegmentsMap.client";

export type MapSpatialSectionProps = {
  systemSlug: string | null;
  trailHeads: TrailMapHead[];
  trailHeadSelection: TrailHeadSelectionMethod;
  amenityPoints: AmenityPoint[];
  amenityCoordinatesAvailable: boolean;
  parkingPoints: ParkingPoint[];
  highlights: Highlight[];
  vets: VetPoint[];
  bailoutSpots: TrailMapBailoutSpot[];
  trailName?: string | null;
  cityName?: string | null;
  stateName?: string | null;
};

export function MapSpatialSection({
  systemSlug,
  trailHeads,
  trailHeadSelection,
  amenityPoints,
  amenityCoordinatesAvailable,
  parkingPoints,
  highlights,
  vets,
  bailoutSpots,
  trailName,
  cityName,
  stateName,
}: MapSpatialSectionProps) {
  return (
    <Section
      id="map"
      title="Map & Route"
      subtitle="Trail layout, trailheads, parking, and dog-relevant points of interest"
    >
      <TrailSegmentsMapClient
        systemSlug={systemSlug}
        trailHeads={trailHeads}
        trailHeadSelection={trailHeadSelection}
        amenityPoints={amenityPoints}
        amenityCoordinatesAvailable={amenityCoordinatesAvailable}
        parkingPoints={parkingPoints}
        highlights={highlights}
        vets={vets}
        bailoutSpots={bailoutSpots}
        trailName={trailName}
        cityName={cityName}
        stateName={stateName}
      />
    </Section>
  );
}
