"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";

export type CityTrailPin = {
  id: string;
  name: string;
  href: string;
  /** [lon, lat] — GeoJSON order, as stored in trailSystems.centroid */
  centroid: [number, number];
  lengthMilesTotal?: number;
};

// ── Auto-fit bounds ────────────────────────────────────────────────────────────
function FitBounds({ bounds }: { bounds: LatLngBoundsExpression }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    fitted.current = true;
    // Defer one tick so the container has measured its size
    setTimeout(() => {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    }, 0);
  }, [map, bounds]);

  return null;
}

// ── Individual marker with hover highlight ─────────────────────────────────────
function TrailMarker({
  pin,
  point,
  onClick,
}: {
  pin: CityTrailPin;
  point: LatLngTuple;
  onClick: () => void;
}) {
  const markerRef = useRef<any>(null);

  return (
    <CircleMarker
      ref={markerRef}
      center={point}
      radius={8}
      pathOptions={{
        fillColor: "#22c55e",
        color: "#14532d",
        weight: 2,
        fillOpacity: 0.88,
      }}
      eventHandlers={{
        click: onClick,
        mouseover: () => markerRef.current?.setStyle({ radius: 11, fillOpacity: 1 }),
        mouseout:  () => markerRef.current?.setStyle({ radius: 8,  fillOpacity: 0.88 }),
      }}
    >
      <Tooltip
        direction="top"
        offset={[0, -10]}
        className="city-trail-tooltip"
      >
        <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{pin.name}</span>
        {typeof pin.lengthMilesTotal === "number" && (
          <span style={{ display: "block", fontSize: "0.75rem", opacity: 0.75, marginTop: "2px" }}>
            {pin.lengthMilesTotal.toFixed(1)} mi
          </span>
        )}
      </Tooltip>
    </CircleMarker>
  );
}

// ── Main map ───────────────────────────────────────────────────────────────────
export function CityTrailMap({ pins }: { pins: CityTrailPin[] }) {
  const router = useRouter();

  // Convert stored [lon, lat] → Leaflet [lat, lon]
  const markers = pins.map((pin) => ({
    pin,
    point: [pin.centroid[1], pin.centroid[0]] as LatLngTuple,
  }));

  // Derive bounds from all marker positions
  const lats = markers.map((m) => m.point[0]);
  const lons = markers.map((m) => m.point[1]);
  const bounds: LatLngBoundsExpression = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];

  // Fallback center if there's only one pin (fitBounds needs 2 points)
  const center: LatLngTuple =
    markers.length === 1
      ? markers[0].point
      : [
          (Math.min(...lats) + Math.max(...lats)) / 2,
          (Math.min(...lons) + Math.max(...lons)) / 2,
        ];

  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ width: "100%", height: "100%" }}
      scrollWheelZoom={false}
      preferCanvas
      zoomControl
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions" target="_blank">CARTO</a>'
        maxZoom={19}
      />

      {markers.length > 1 && <FitBounds bounds={bounds} />}

      {markers.map(({ pin, point }) => (
        <TrailMarker
          key={pin.id}
          pin={pin}
          point={point}
          onClick={() => router.push(pin.href)}
        />
      ))}
    </MapContainer>
  );
}
