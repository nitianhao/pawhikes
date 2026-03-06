"use client";
/**
 * Dynamic wrapper — keeps Leaflet out of the SSR bundle entirely.
 * Must be a Client Component so that `ssr: false` is valid in Next.js 15.
 */
import dynamic from "next/dynamic";
import type { CityTrailPin } from "./CityTrailMap";

const CityTrailMapInner = dynamic(
  () => import("./CityTrailMap").then((m) => ({ default: m.CityTrailMap })),
  {
    ssr: false,
    loading: () => (
      <div
        style={{
          width: "100%",
          height: "100%",
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
        {/* Paw spinner */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="currentColor"
          style={{ opacity: 0.6, animation: "spin 1.2s linear infinite" }}
        >
          <ellipse cx="6.5" cy="3.5" rx="1.5" ry="2" />
          <ellipse cx="11" cy="2.5" rx="1.5" ry="2" />
          <ellipse cx="15.5" cy="3.5" rx="1.5" ry="2" />
          <ellipse cx="19" cy="7" rx="1.5" ry="2" />
          <path d="M12 8c-3.5 0-7 2.5-7 6.5 0 2.5 1.5 5 4 5.5.8.2 2 .5 3 .5s2.2-.3 3-.5c2.5-.5 4-3 4-5.5C19 10.5 15.5 8 12 8z" />
        </svg>
        Loading map…
      </div>
    ),
  }
);

export function CityTrailMapClient({ pins }: { pins: CityTrailPin[] }) {
  if (pins.length === 0) return null;
  return <CityTrailMapInner pins={pins} />;
}
