"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { divIcon, type LatLngBoundsExpression, type LatLngExpression } from "leaflet";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import {
  firstPointFromPaths,
  pointsToFallbackPaths,
  polylineBoundsFromPaths,
  segmentsToStitchedPaths,
  type StitchedPath,
  type LatLngTuple,
} from "@/lib/geo/stitchSegments";
import { minDistancePointToRouteMeters } from "@/lib/geo/routeDistance";
import type { AmenityPoint, ParkingPoint } from "@/lib/geo/amenities";
import type { Highlight } from "@/lib/highlights/types";
import { trailheadImageAlt } from "@/lib/seo/media";
import type { VetPoint } from "./TrailSegmentsMap.client";
import styles from "./TrailSegmentsMap.module.css";

const SNAP_TOLERANCE_METERS = 12;
const MAX_JOIN_METERS = 25;
const DEBUG_MAP = false;
const TRAILHEAD_ROUTE_BUFFER_METERS = 250;
const TRAILHEAD_MAX_DISTANCE_TO_ROUTE_METERS = 200;
const TRAILHEAD_WARN_DISTANCE_METERS = 100;
const AMENITY_MAX_DISTANCE_WARNING_METERS = 100;
const QA_SNAP_AMENITIES_TO_ROUTE = false;

type SegmentGeometry = {
  type?: string;
  coordinates?: unknown;
};

export type TrailSegmentsMapSegment = {
  id: string;
  name?: string | null;
  surface?: string | null;
  width?: number | null;
  lengthMiles?: number | null;
  geometry?: SegmentGeometry | null;
};

export type TrailMapHead = {
  id: string;
  lat?: number;
  lon?: number;
  name?: string | null;
  googleCanonicalName?: string | null;
  googleAddress?: string | null;
  googleMapsUrl?: string | null;
  googlePhone?: string | null;
  googlePhotoUri?: string | null;
  googleWebsite?: string | null;
  parking?: { fee?: string; capacity?: number } | null | unknown;
};

export type TrailHeadSelectionMethod =
  | "systemRef"
  | "trailSlug"
  | "raw.systemSlug"
  | "raw.systemName"
  | "withinRouteBuffer"
  | "none";

type RenderTrailHead = TrailMapHead & {
  point: LatLngTuple;
  distanceToRouteMeters: number | null;
  possiblyMislinked: boolean;
};

type RenderAmenityPoint = AmenityPoint & {
  point: LatLngTuple;
  originalPoint: LatLngTuple;
  distanceToRouteMeters: number | null;
};

export type TrailMapBailoutSpot = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  primaryKind: string;
  kinds: string[];
};

type ActiveOverlay = "amenities" | "highlights" | "vets" | "bailouts" | null;

function formatCoord(point: LatLngTuple): string {
  return `${point[0].toFixed(5)}, ${point[1].toFixed(5)}`;
}

function FitMapView({
  bounds,
  center,
}: {
  bounds: LatLngBoundsExpression | null;
  center: LatLngExpression;
}) {
  const map = useMap();

  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [24, 24] });
      return;
    }

    map.setView(center, 14);
  }, [bounds, center, map]);

  return null;
}

function renderPaths(paths: StitchedPath[]) {
  return paths.map((path) => (
    <Polyline
      key={path.id}
      positions={path.points}
      pathOptions={{
        color: "#2563eb",
        weight: path.isPrimary ? 4 : 3,
        opacity: path.isPrimary ? 0.9 : 0.45,
      }}
    />
  ));
}

function buildBoundsFromPoints(points: LatLngTuple[]): LatLngBoundsExpression | null {
  if (points.length < 2) return null;

  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLon = points[0][1];
  let maxLon = points[0][1];

  for (const [lat, lon] of points) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

function normalizeTrailHeads(trailHeads: TrailMapHead[]): Array<TrailMapHead & { point: LatLngTuple }> {
  return trailHeads.flatMap((head) => {
    const lat = typeof head.lat === "number" && Number.isFinite(head.lat) ? head.lat : null;
    const lon = typeof head.lon === "number" && Number.isFinite(head.lon) ? head.lon : null;
    if (lat == null || lon == null) return [];
    return [{ ...head, point: [lat, lon] as LatLngTuple }];
  });
}

function validateTrailHeadsAgainstRoute(
  trailHeads: Array<TrailMapHead & { point: LatLngTuple }>,
  routePaths: Array<{ points: LatLngTuple[] }>
): {
  kept: RenderTrailHead[];
  candidateCount: number;
  filteredOutCount: number;
  validationSkipped: boolean;
} {
  const candidateCount = trailHeads.length;
  const routePointCount = routePaths.reduce((sum, path) => sum + path.points.length, 0);
  if (routePointCount === 0) {
    return {
      kept: trailHeads.map((head) => ({
        ...head,
        distanceToRouteMeters: null,
        possiblyMislinked: false,
      })),
      candidateCount,
      filteredOutCount: 0,
      validationSkipped: true,
    };
  }

  const kept = trailHeads
    .map((head) => {
      const distanceToRouteMeters = minDistancePointToRouteMeters(head.point, routePaths);
      return {
        ...head,
        distanceToRouteMeters,
        possiblyMislinked: distanceToRouteMeters > TRAILHEAD_WARN_DISTANCE_METERS,
      };
    })
    .filter((head) => head.distanceToRouteMeters <= TRAILHEAD_MAX_DISTANCE_TO_ROUTE_METERS);

  return {
    kept,
    candidateCount,
    filteredOutCount: candidateCount - kept.length,
    validationSkipped: false,
  };
}

function amenityKindLabel(kind: AmenityPoint["kind"]): string {
  switch (kind) {
    case "bench":
      return "Bench";
    case "shelter":
      return "Shelter";
    case "restroom":
      return "Restroom";
    case "waste_bin":
      return "Waste Bin";
    case "drinking_water":
      return "Drinking Water";
  }
}

function amenityKindColor(kind: AmenityPoint["kind"]): string {
  switch (kind) {
    case "drinking_water":
      return "#0369a1";
    case "restroom":
      return "#1d4ed8";
    case "bench":
      return "#6b7280";
    case "waste_bin":
      return "#9f1239";
    case "shelter":
      return "#92400e";
  }
}

function highlightKindColor(kind: string): string {
  switch (kind) {
    case "waterfall":
      return "#0ea5e9";
    case "viewpoint":
      return "#7c3aed";
    case "peak":
      return "#92400e";
    case "cave_entrance":
      return "#374151";
    case "spring":
      return "#0369a1";
    case "attraction":
      return "#d97706";
    case "historic":
      return "#6b7280";
    case "ruins":
      return "#78716c";
    default:
      return "#059669";
  }
}

function bailoutKindColor(primaryKind: string): string {
  if (primaryKind === "entrance") return "#047857";
  if (primaryKind === "intersection") return "#4f46e5";
  return "#b45309";
}

function nearestRouteVertex(
  point: LatLngTuple,
  routePaths: Array<{ points: LatLngTuple[] }>
): LatLngTuple | null {
  let nearest: LatLngTuple | null = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const path of routePaths) {
    for (const candidate of path.points) {
      const distance = minDistancePointToRouteMeters(point, [{ points: [candidate] }]);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = candidate;
      }
    }
  }

  return nearest;
}

function buildAmenityOverlay(
  amenityPoints: AmenityPoint[],
  routePaths: Array<{ points: LatLngTuple[] }>
): {
  plottedAmenityPoints: RenderAmenityPoint[];
  farCount: number;
  countsByKind: Record<AmenityPoint["kind"], number>;
} {
  const countsByKind: Record<AmenityPoint["kind"], number> = {
    bench: 0,
    shelter: 0,
    restroom: 0,
    waste_bin: 0,
    drinking_water: 0,
  };

  const plottedAmenityPoints = amenityPoints.map((amenity) => {
    countsByKind[amenity.kind] += 1;
    const originalPoint: LatLngTuple = [amenity.lat, amenity.lon];
    const distanceToRouteMeters =
      routePaths.length > 0 ? minDistancePointToRouteMeters(originalPoint, routePaths) : null;
    const snappedPoint =
      QA_SNAP_AMENITIES_TO_ROUTE && routePaths.length > 0
        ? nearestRouteVertex(originalPoint, routePaths) ?? originalPoint
        : originalPoint;

    return {
      ...amenity,
      point: snappedPoint,
      originalPoint,
      distanceToRouteMeters,
    };
  });

  const farCount = plottedAmenityPoints.filter(
    (amenity) =>
      amenity.distanceToRouteMeters != null &&
      amenity.distanceToRouteMeters > AMENITY_MAX_DISTANCE_WARNING_METERS
  ).length;

  return { plottedAmenityPoints, farCount, countsByKind };
}

function makeCircleIcon(color: string, size = 16): ReturnType<typeof divIcon> {
  return divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

function makeDiamondIcon(color: string, size = 14): ReturnType<typeof divIcon> {
  return divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;background:${color};border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);transform:rotate(45deg)"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

const trailHeadIcon = divIcon({
  className: "",
  html:
    '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#f97316;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
});

const trailHeadSuspectIcon = divIcon({
  className: "",
  html:
    '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#fdba74;border:2px dashed #d97706;box-shadow:0 1px 4px rgba(0,0,0,0.18);opacity:0.6"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -10],
});

const parkingIcon = divIcon({
  className: "",
  html:
    '<span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:#1d4ed8;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.35);font-size:11px;font-weight:700;color:#fff;font-family:sans-serif;line-height:1">P</span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -12],
});

export function TrailSegmentsMap({
  segments,
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
}: {
  segments: TrailSegmentsMapSegment[];
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
}) {
  const [activeOverlay, setActiveOverlay] = useState<ActiveOverlay>(null);

  // ── Segment stitching (depends only on segments) ──────────────────────────
  const { stitchResult, renderedPaths, firstPoint, routeBounds } = useMemo(() => {
    const sr = segmentsToStitchedPaths(segments, {
      snapToleranceMeters: SNAP_TOLERANCE_METERS,
      maxJoinMeters: MAX_JOIN_METERS,
    });
    const fallback = pointsToFallbackPaths(sr.parts);
    const byId = new Map(sr.parts.map((part) => [part.id, part]));
    const suspicious = sr.stitchedPaths.filter((path) => path.suspect);
    const healthy = sr.stitchedPaths.filter((path) => !path.suspect);
    const suspectFallback = suspicious.flatMap((path) =>
      path.partIds.flatMap((partId, index) => {
        const part = byId.get(partId);
        if (!part) return [];
        return [
          {
            id: `${path.id}-part-${index + 1}`,
            points: part.points,
            partIds: [part.id],
            approxMiles: part.lengthMiles ?? 0,
            isPrimary: false,
            maxStepMeters: path.maxStepMeters,
            suspect: false,
          } satisfies StitchedPath,
        ];
      })
    );
    const rendered =
      sr.stats.mode === "fallback"
        ? fallback
        : healthy.length === 0 && suspectFallback.length === 0
          ? fallback
          : [...healthy, ...suspectFallback];
    return {
      stitchResult: sr,
      renderedPaths: rendered,
      firstPoint: firstPointFromPaths(rendered),
      routeBounds: polylineBoundsFromPaths(rendered),
    };
  }, [segments]);

  // ── Trailhead validation (depends on trailHeads + renderedPaths) ───────────
  const { normalizedTrailHeads, trailHeadValidation, trailHeadBounds } = useMemo(() => {
    const candidates = normalizeTrailHeads(trailHeads);
    const validation = validateTrailHeadsAgainstRoute(candidates, renderedPaths);
    return {
      normalizedTrailHeads: validation.kept,
      trailHeadValidation: validation,
      trailHeadBounds: buildBoundsFromPoints(validation.kept.map((h) => h.point)),
    };
  }, [trailHeads, renderedPaths]);

  // ── Amenity overlay (depends on amenityPoints + renderedPaths) ────────────
  const amenityOverlay = useMemo(
    () => buildAmenityOverlay(amenityPoints, renderedPaths),
    [amenityPoints, renderedPaths]
  );

  const amenityBounds = useMemo(
    () => buildBoundsFromPoints(amenityOverlay.plottedAmenityPoints.map((a) => a.point)),
    [amenityOverlay]
  );

  const bounds = routeBounds ?? trailHeadBounds ?? amenityBounds;

  const initialCenter =
    firstPoint ?? normalizedTrailHeads[0]?.point ?? amenityOverlay.plottedAmenityPoints[0]?.point ?? null;

  const validHighlights = useMemo(
    () => highlights.filter((h) => !h.isIncomplete && !(h.lat === 0 && h.lng === 0)),
    [highlights]
  );

  const hasAmenities = amenityOverlay.plottedAmenityPoints.length > 0;
  const hasHighlights = validHighlights.length > 0;
  const hasVets = vets.length > 0;
  const hasBailouts = bailoutSpots.length > 0;

  useEffect(() => {
    if (!DEBUG_MAP) return;

    const joinRows = [...stitchResult.debugJoins]
      .sort((a, b) => b.dMeters - a.dMeters)
      .slice(0, 10)
      .map((join) => ({
        edge: join.chosenEdgeId,
        meters: Number(join.dMeters.toFixed(1)),
        turn: join.turnAngle == null ? "start" : Number(join.turnAngle.toFixed(0)),
        from: formatCoord(join.fromPoint),
        to: formatCoord(join.toPoint),
      }));

    if (joinRows.length > 0) {
      console.table(joinRows);
    }

    if (stitchResult.stats.swappedPairs.length > 0) {
      console.table(
        stitchResult.stats.swappedPairs.map((entry) => ({
          original: `${entry.original[0]}, ${entry.original[1]}`,
          normalized: `${entry.normalized[0]}, ${entry.normalized[1]}`,
        }))
      );
    }
    if (trailHeadValidation.filteredOutCount > 0) {
      console.log("Filtered linked trailheads outside route distance threshold:", {
        filteredOutCount: trailHeadValidation.filteredOutCount,
        candidateCount: trailHeadValidation.candidateCount,
      });
    }
  }, [stitchResult, trailHeadValidation]);

  if (!initialCenter) {
    return (
      <section className={styles.section}>
        <h2 className={styles.heading}>Map</h2>
        <p className={styles.unavailable}>Map unavailable</p>
      </section>
    );
  }

  function toggleOverlay(overlay: "amenities" | "highlights" | "vets" | "bailouts") {
    setActiveOverlay((prev) => (prev === overlay ? null : overlay));
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Map</h2>
      {(hasAmenities || hasHighlights || hasVets || hasBailouts) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem",
            marginBottom: "0.6rem",
          }}
        >
          {hasAmenities && (
            <button
              type="button"
              onClick={() => toggleOverlay("amenities")}
              style={{
                padding: "0.3rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.8rem",
                fontWeight: 500,
                border: "1px solid",
                cursor: "pointer",
                lineHeight: 1.4,
                background: activeOverlay === "amenities" ? "#dcfce7" : "#f8fafc",
                borderColor: activeOverlay === "amenities" ? "#86efac" : "#d1d5db",
                color: activeOverlay === "amenities" ? "#15803d" : "#374151",
              }}
            >
              Amenities ({amenityOverlay.plottedAmenityPoints.length})
            </button>
          )}
          {hasHighlights && (
            <button
              type="button"
              onClick={() => toggleOverlay("highlights")}
              style={{
                padding: "0.3rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.8rem",
                fontWeight: 500,
                border: "1px solid",
                cursor: "pointer",
                lineHeight: 1.4,
                background: activeOverlay === "highlights" ? "#dcfce7" : "#f8fafc",
                borderColor: activeOverlay === "highlights" ? "#86efac" : "#d1d5db",
                color: activeOverlay === "highlights" ? "#15803d" : "#374151",
              }}
            >
              Highlights ({validHighlights.length})
            </button>
          )}
          {hasVets && (
            <button
              type="button"
              onClick={() => toggleOverlay("vets")}
              style={{
                padding: "0.3rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.8rem",
                fontWeight: 500,
                border: "1px solid",
                cursor: "pointer",
                lineHeight: 1.4,
                background: activeOverlay === "vets" ? "#dcfce7" : "#f8fafc",
                borderColor: activeOverlay === "vets" ? "#86efac" : "#d1d5db",
                color: activeOverlay === "vets" ? "#15803d" : "#374151",
              }}
            >
              Vets ({vets.length})
            </button>
          )}
          {hasBailouts && (
            <button
              type="button"
              onClick={() => toggleOverlay("bailouts")}
              style={{
                padding: "0.3rem 0.75rem",
                borderRadius: "9999px",
                fontSize: "0.8rem",
                fontWeight: 500,
                border: "1px solid",
                cursor: "pointer",
                lineHeight: 1.4,
                background: activeOverlay === "bailouts" ? "#dcfce7" : "#f8fafc",
                borderColor: activeOverlay === "bailouts" ? "#86efac" : "#d1d5db",
                color: activeOverlay === "bailouts" ? "#15803d" : "#374151",
              }}
            >
              Bailout exits ({bailoutSpots.length})
            </button>
          )}
        </div>
      )}
      <MapContainer center={initialCenter} zoom={14} scrollWheelZoom={false} className={styles.map}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitMapView bounds={bounds} center={initialCenter} />
        {renderPaths(renderedPaths)}
        {DEBUG_MAP
          ? stitchResult.endpointClusters.map((cluster) => (
              <CircleMarker
                key={cluster.id}
                center={cluster.point}
                radius={4}
                pathOptions={{
                  color: "#92400e",
                  fillColor: "#f59e0b",
                  fillOpacity: 0.75,
                  weight: 1,
                }}
              >
                <Tooltip>{`degree ${cluster.degree} · endpoints ${cluster.endpointCount}`}</Tooltip>
              </CircleMarker>
            ))
          : null}
        {DEBUG_MAP
          ? stitchResult.debugJoins.map((join, index) => {
              return (
                <Polyline
                  key={`${join.chosenEdgeId}-${index}`}
                  positions={[join.fromPoint, join.toPoint]}
                  pathOptions={{ color: "#ef4444", weight: 1, opacity: 0.7, dashArray: "4 4" }}
                >
                  <Tooltip>
                    {`edge ${join.chosenEdgeId} · d ${join.dMeters.toFixed(1)}m · turn ${
                      join.turnAngle == null ? "start" : `${join.turnAngle.toFixed(0)}deg`
                    }`}
                  </Tooltip>
                </Polyline>
              );
            })
          : null}
        {DEBUG_MAP
          ? renderedPaths.flatMap((path) => {
              const first = path.points[0];
              const last = path.points[path.points.length - 1];
              return [
                first ? (
                  <CircleMarker
                    key={`${path.id}-first`}
                    center={first}
                    radius={4}
                    pathOptions={{ color: "#1d4ed8", fillColor: "#60a5fa", fillOpacity: 0.9, weight: 1 }}
                  >
                    <Tooltip>{`${path.id} start · ${formatCoord(first)}`}</Tooltip>
                  </CircleMarker>
                ) : null,
                last ? (
                  <CircleMarker
                    key={`${path.id}-last`}
                    center={last}
                    radius={4}
                    pathOptions={{ color: "#7c2d12", fillColor: "#fb923c", fillOpacity: 0.9, weight: 1 }}
                  >
                    <Tooltip>{`${path.id} end · ${formatCoord(last)}`}</Tooltip>
                  </CircleMarker>
                ) : null,
              ];
            })
          : null}
        {normalizedTrailHeads.map((head) => {
          const parking =
            head.parking && typeof head.parking === "object" && !Array.isArray(head.parking)
              ? (head.parking as { fee?: string; capacity?: number })
              : null;
          const label = head.googleCanonicalName ?? head.name ?? "Trailhead";
          const parkingBits = [
            typeof parking?.fee === "string" && parking.fee.trim() !== ""
              ? `Fee: ${parking.fee.trim()}`
              : null,
            typeof parking?.capacity === "number" && Number.isFinite(parking.capacity)
              ? `Capacity: ${parking.capacity}`
              : null,
          ].filter((value): value is string => Boolean(value));

          return (
            <Marker key={head.id} position={head.point} icon={head.possiblyMislinked ? trailHeadSuspectIcon : trailHeadIcon}>
              <Popup>
                <div className={styles.popup}>
                  {head.googlePhotoUri ? (
                    <div style={{ marginBottom: "0.5rem" }}>
                      <Image
                        src={head.googlePhotoUri}
                        alt={trailheadImageAlt({
                          trailheadName: label,
                          trailName,
                          cityName,
                          stateName,
                        })}
                        width={120}
                        height={80}
                        sizes="120px"
                        style={{
                          width: "100%",
                          maxWidth: "120px",
                          height: "auto",
                          maxHeight: "80px",
                          objectFit: "cover",
                          borderRadius: "6px",
                          display: "block",
                        }}
                      />
                    </div>
                  ) : null}
                  <strong>{label}</strong>
                  {head.distanceToRouteMeters != null ? (
                    <p>{`~${Math.round(head.distanceToRouteMeters)}m from route`}</p>
                  ) : null}
                  {head.possiblyMislinked ? <p>Possibly mis-linked</p> : null}
                  {head.googleAddress ? <p>{head.googleAddress}</p> : null}
                  {parkingBits.length > 0 ? <p>{parkingBits.join(" · ")}</p> : null}
                  {head.googleMapsUrl ? (
                    <p>
                      <a
                        href={head.googleMapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.mapLink}
                      >
                        Open in Google Maps
                      </a>
                    </p>
                  ) : null}
                  {head.googleWebsite ? (
                    <p>
                      <a
                        href={head.googleWebsite.startsWith("http") ? head.googleWebsite : `https://${head.googleWebsite}`}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.mapLink}
                      >
                        Website
                      </a>
                    </p>
                  ) : null}
                  {head.googlePhone ? (
                    <p>
                      <a href={`tel:${head.googlePhone.replace(/\s/g, "")}`} className={styles.mapLink}>
                        {head.googlePhone}
                      </a>
                    </p>
                  ) : null}
                </div>
              </Popup>
            </Marker>
          );
        })}
        {parkingPoints.map((p) => {
          const position: [number, number] = [p.lat, p.lon];
          const bits = [
            p.capacity != null ? `${p.capacity} spaces` : null,
            p.fee != null && p.fee !== "no" ? `Fee: ${p.fee}` : null,
            p.access != null && p.access !== "yes" ? `Access: ${p.access}` : null,
          ].filter((v): v is string => Boolean(v));

          return (
            <Marker key={p.id} position={position} icon={parkingIcon}>
              <Popup>
                <div className={styles.popup}>
                  <strong>{p.name ?? "Parking"}</strong>
                  {bits.length > 0 ? <p>{bits.join(" · ")}</p> : null}
                </div>
              </Popup>
            </Marker>
          );
        })}
        {activeOverlay === "amenities"
          ? amenityOverlay.plottedAmenityPoints.map((amenity) => (
              <Marker
                key={amenity.id}
                position={amenity.point}
                icon={makeCircleIcon(amenityKindColor(amenity.kind))}
              >
                <Popup>
                  <div className={styles.popup}>
                    <strong>{amenityKindLabel(amenity.kind)}</strong>
                    {amenity.name ? <p>{amenity.name}</p> : null}
                  </div>
                </Popup>
              </Marker>
            ))
          : null}
        {activeOverlay === "highlights"
          ? validHighlights.map((h) => (
              <Marker
                key={h.id}
                position={[h.lat, h.lng]}
                icon={makeDiamondIcon(highlightKindColor(h.kind))}
              >
                <Popup>
                  <div className={styles.popup}>
                    <strong>{h.title}</strong>
                    <p>{h.categoryLabel}{h.typeLabel ? ` · ${h.typeLabel}` : ""}</p>
                    <p style={{ color: "#6b7280" }}>{h.distanceShort} from trail</p>
                  </div>
                </Popup>
              </Marker>
            ))
          : null}
        {activeOverlay === "vets"
          ? vets.map((v) => {
              const isEmergency = v.kind === "emergency_vet";
              const color = isEmergency ? "#dc2626" : "#7c3aed";
              const distKm = (v.distanceToCentroidMeters / 1000).toFixed(1);
              const kindLabel = v.kind === "emergency_vet" ? "Emergency Vet" : v.kind === "animal_hospital" ? "Animal Hospital" : "Veterinarian";
              const address = [v.tags["addr:housenumber"], v.tags["addr:street"], v.tags["addr:city"]].filter(Boolean).join(" ");
              const website = v.tags.website ?? v.tags["contact:website"] ?? null;
              const phone = v.tags.phone ?? v.tags["contact:phone"] ?? null;
              return (
                <Marker key={v.osmId} position={[v.lat, v.lon]} icon={makeCircleIcon(color, 18)}>
                  <Popup>
                    <div className={styles.popup}>
                      <strong>{v.name ?? kindLabel}</strong>
                      <p style={{ color: isEmergency ? "#dc2626" : "#6b7280" }}>{kindLabel} · {distKm} km away</p>
                      {address ? <p>{address}</p> : null}
                      {phone ? <p><a href={`tel:${phone.replace(/\s/g, "")}`} className={styles.mapLink}>{phone}</a></p> : null}
                      {website ? <p><a href={website.startsWith("http") ? website : `https://${website}`} target="_blank" rel="noreferrer" className={styles.mapLink}>Website</a></p> : null}
                    </div>
                  </Popup>
                </Marker>
              );
            })
          : null}
        {activeOverlay === "bailouts"
          ? bailoutSpots.map((spot) => (
              <Marker
                key={spot.id}
                position={[spot.lat, spot.lng]}
                icon={makeCircleIcon(bailoutKindColor(spot.primaryKind), 18)}
              >
                <Popup>
                  <div className={styles.popup}>
                    <strong>{spot.title}</strong>
                    <p>
                      {spot.kinds
                        .map((kind) => kind.replace(/_/g, " "))
                        .map((kind) => kind.charAt(0).toUpperCase() + kind.slice(1))
                        .join(" · ")}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))
          : null}
      </MapContainer>
    </section>
  );
}

export default TrailSegmentsMap;
