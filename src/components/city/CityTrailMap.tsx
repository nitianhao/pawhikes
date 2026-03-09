"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
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
    setTimeout(() => {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
    }, 0);
  }, [map, bounds]);

  return null;
}

// ── Individual marker ──────────────────────────────────────────────────────────
// Each marker self-manages its highlight state by listening to the trail:hover
// event dispatched by the card list (and by other markers).
function TrailMarker({ pin, point }: { pin: CityTrailPin; point: LatLngTuple }) {
  const markerRef = useRef<any>(null);

  // Card hover → highlight this pin if its id matches
  useEffect(() => {
    function onHover(e: Event) {
      const { id } = (e as CustomEvent<{ id: string | null }>).detail;
      const m = markerRef.current;
      if (!m) return;
      if (id === pin.id) {
        m.setStyle({ radius: 12, fillColor: "#16a34a", fillOpacity: 1, color: "#14532d", weight: 3 });
      } else {
        m.setStyle({ radius: 8, fillColor: "#22c55e", fillOpacity: 0.88, color: "#14532d", weight: 2 });
      }
    }
    window.addEventListener("trail:hover", onHover);
    return () => window.removeEventListener("trail:hover", onHover);
  }, [pin.id]);

  // Filter change → dim pins not in the visible set
  useEffect(() => {
    function onFilter(e: Event) {
      const { ids } = (e as CustomEvent<{ ids: string[] | null }>).detail;
      const m = markerRef.current;
      if (!m) return;
      if (ids === null || ids.includes(pin.id)) {
        m.setStyle({ fillOpacity: 0.88, opacity: 1 });
      } else {
        m.setStyle({ fillOpacity: 0.15, opacity: 0.3 });
      }
    }
    window.addEventListener("trail:filter", onFilter);
    return () => window.removeEventListener("trail:filter", onFilter);
  }, [pin.id]);

  return (
    <CircleMarker
      ref={markerRef}
      center={point}
      radius={8}
      pathOptions={{ fillColor: "#22c55e", color: "#14532d", weight: 2, fillOpacity: 0.88 }}
      eventHandlers={{
        // Pin hover → broadcast to card list
        mouseover: () => {
          markerRef.current?.setStyle({ radius: 12, fillColor: "#16a34a", fillOpacity: 1, weight: 3 });
          window.dispatchEvent(new CustomEvent("trail:hover", { detail: { id: pin.id } }));
        },
        mouseout: () => {
          markerRef.current?.setStyle({ radius: 8, fillColor: "#22c55e", fillOpacity: 0.88, weight: 2 });
          window.dispatchEvent(new CustomEvent("trail:hover", { detail: { id: null } }));
        },
        // Pin click → scroll matching card into view
        click: () => {
          window.dispatchEvent(new CustomEvent("trail:focus", { detail: { id: pin.id } }));
        },
      }}
    >
      <Tooltip direction="top" offset={[0, -10]} className="city-trail-tooltip">
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
  const markers = pins.map((pin) => ({
    pin,
    point: [pin.centroid[1], pin.centroid[0]] as LatLngTuple,
  }));

  const lats = markers.map((m) => m.point[0]);
  const lons = markers.map((m) => m.point[1]);
  const bounds: LatLngBoundsExpression = [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];

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
        <TrailMarker key={pin.id} pin={pin} point={point} />
      ))}
    </MapContainer>
  );
}
