"use client";

import dynamic from "next/dynamic";
import type { AmenityPoint, ParkingPoint } from "@/lib/geo/amenities";
import type { Highlight } from "@/lib/highlights/types";
import type {
  TrailHeadSelectionMethod,
  TrailMapHead,
  TrailSegmentsMapSegment,
} from "./TrailSegmentsMap";

const TrailSegmentsMapInner = dynamic(() => import("./TrailSegmentsMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        marginTop: "1.25rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "0.9rem",
      }}
    >
      <h2 style={{ margin: "0 0 0.75rem", fontSize: "1.25rem", fontWeight: 700 }}>Map</h2>
      <div
        style={{
          width: "100%",
          height: "320px",
          borderRadius: "0.75rem",
          background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          color: "#15803d",
          fontSize: "0.875rem",
          fontWeight: 500,
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ opacity: 0.6, animation: "spin 1.2s linear infinite", flexShrink: 0 }}
        >
          <ellipse cx="6.5" cy="3.5" rx="1.5" ry="2" />
          <ellipse cx="11" cy="2.5" rx="1.5" ry="2" />
          <ellipse cx="15.5" cy="3.5" rx="1.5" ry="2" />
          <ellipse cx="19" cy="7" rx="1.5" ry="2" />
          <path d="M12 8c-3.5 0-7 2.5-7 6.5 0 2.5 1.5 5 4 5.5.8.2 2 .5 3 .5s2.2-.3 3-.5c2.5-.5 4-3 4-5.5C19 10.5 15.5 8 12 8z" />
        </svg>
        Loading map…
      </div>
    </div>
  ),
});

export type VetPoint = {
  osmId: string;
  name: string | null;
  kind: string;
  lat: number;
  lon: number;
  distanceToCentroidMeters: number;
  tags: Record<string, any>;
};

export function TrailSegmentsMapClient({
  segments,
  trailHeads,
  trailHeadSelection,
  amenityPoints,
  amenityCoordinatesAvailable,
  parkingPoints,
  highlights,
  vets,
}: {
  segments: TrailSegmentsMapSegment[];
  trailHeads: TrailMapHead[];
  trailHeadSelection: TrailHeadSelectionMethod;
  amenityPoints: AmenityPoint[];
  amenityCoordinatesAvailable: boolean;
  parkingPoints: ParkingPoint[];
  highlights: Highlight[];
  vets: VetPoint[];
}) {
  return (
    <TrailSegmentsMapInner
      segments={segments}
      trailHeads={trailHeads}
      trailHeadSelection={trailHeadSelection}
      amenityPoints={amenityPoints}
      amenityCoordinatesAvailable={amenityCoordinatesAvailable}
      parkingPoints={parkingPoints}
      highlights={highlights}
      vets={vets}
    />
  );
}

export default TrailSegmentsMapClient;
