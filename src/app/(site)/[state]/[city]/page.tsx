// Data source: InstantDB `trailSystems` entity.
// Map uses centroid [lon,lat] (already stored from rollup) — no segment geometry needed.

import Link from "next/link";
import type { Metadata } from "next";
import { deslugifyCity, safeDecodeURIComponent } from "@/lib/slug";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { timed, logPayloadIfEnabled } from "@/lib/perf";
import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import { CityTrailMapClient } from "@/components/city/CityTrailMap.client";
import type { CityTrailPin } from "@/components/city/CityTrailMap";

type TrailSystemRecord = Record<string, any>;

const DB_LABEL = "db:trailSystems list (city)";

async function loadTrailSystems(): Promise<TrailSystemRecord[]> {
  const db = await getAdminDbSafe();
  if (!db) return [];

  const res = await timed(DB_LABEL, () =>
    db.query({ trailSystems: { $: { limit: 5000 } } })
  );
  logPayloadIfEnabled(DB_LABEL, res);
  const systems = Array.isArray((res as any).trailSystems)
    ? (res as any).trailSystems
    : (res as any).trailSystems?.data ?? [];

  return Array.isArray(systems) ? systems : [];
}

function formatDistance(miles: unknown): string {
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles <= 0) return "—";
  return `${miles.toFixed(1)} mi`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}): Promise<Metadata> {
  const { state, city } = await params;
  const rawState = safeDecodeURIComponent(state);
  const citySlug = safeDecodeURIComponent(city);
  const cityLabel = deslugifyCity(citySlug);
  const stateLabel = normalizeState(rawState);

  return {
    title: `Dog-Friendly Hiking Trails in ${cityLabel}, ${stateLabel}`,
    description:
      "Browse dog-friendly trails with quick info on leash policy, shade, swim access, and paw-safety surface notes.",
  };
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}) {
  const { state, city } = await params;
  const rawState = safeDecodeURIComponent(state);
  const citySlug = safeDecodeURIComponent(city);
  const cityLabel = deslugifyCity(citySlug);
  const stateLabel = normalizeState(rawState);

  let systems: TrailSystemRecord[] = [];
  const db = await getAdminDbSafe();
  try {
    if (db) systems = await loadTrailSystems();
  } catch {
    // Keep rendering even if data fails.
  }

  const normalizedTargetState = stateLabel.toLowerCase();
  const normalizedTargetCity = cityLabel.toLowerCase();

  const trailsInCity = await timed("compute:filter trailsInCity (city)", async () =>
    systems.filter((system) => {
      const systemState = String(system.state ?? "").trim().toLowerCase();
      const systemCity  = String(system.city  ?? "").trim().toLowerCase();
      const matchesState =
        systemState === normalizedTargetState ||
        (!systemState && normalizedTargetState === "unknown");
      const matchesCity =
        systemCity === normalizedTargetCity ||
        (!systemCity && normalizedTargetCity === "unknown city");
      const length = typeof system.lengthMilesTotal === "number" ? system.lengthMilesTotal : 0;
      return matchesState && matchesCity && length > 1;
    })
  );

  if (trailsInCity.length === 0) {
    return (
      <section>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
          No trails found in {cityLabel}, {stateLabel || "Unknown state"}
        </h1>
        {!db && <p style={{ marginBottom: "0.75rem" }}>{instantDbMissingEnvMessage()}</p>}
        <p style={{ marginBottom: "0.75rem" }}>
          We couldn&apos;t find any trail systems matching this city.
        </p>
        <p>
          <Link href={`/${encodeURIComponent(stateLabel)}`}>
            ← Back to cities in {stateLabel || "Unknown state"}
          </Link>
        </p>
      </section>
    );
  }

  // Build map pins — only trails that have a stored centroid
  const mapPins: CityTrailPin[] = trailsInCity.flatMap((trail) => {
    const c = trail.centroid;
    if (!Array.isArray(c) || c.length < 2) return [];
    const [lon, lat] = c;
    if (typeof lon !== "number" || typeof lat !== "number") return [];
    const trailSlug = canonicalTrailSlug({
      name: trail.name ?? null,
      id: trail.id ?? null,
      extSystemRef: trail.extSystemRef ?? null,
    });
    return [{
      id:               String(trail.id ?? trailSlug),
      name:             String(trail.name ?? trailSlug ?? "Trail"),
      href:             `/${encodeURIComponent(stateLabel)}/${encodeURIComponent(citySlug)}/${encodeURIComponent(trailSlug)}`,
      centroid:         [lon, lat] as [number, number],
      lengthMilesTotal: typeof trail.lengthMilesTotal === "number" ? trail.lengthMilesTotal : undefined,
    }];
  });

  return (
    <section>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: "1.25rem" }}>
        <Link
          href={`/${encodeURIComponent(stateLabel)}`}
          style={{ fontSize: "0.8125rem", color: "#6b7280", textDecoration: "none" }}
        >
          ← {stateLabel}
        </Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginTop: "0.25rem", color: "#111827" }}>
          Dog-Friendly Trails in {cityLabel}
        </h1>
        <p style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: "#6b7280" }}>
          {trailsInCity.length} trail{trailsInCity.length !== 1 ? "s" : ""} · tap any pin to explore
        </p>
      </div>

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      {mapPins.length > 0 && (
        <div className="city-map-wrap" style={{ marginBottom: "1.75rem" }}>
          <CityTrailMapClient pins={mapPins} />
        </div>
      )}

      {!db && <p style={{ marginBottom: "1rem" }}>{instantDbMissingEnvMessage()}</p>}

      {/* ── Trail cards ─────────────────────────────────────────────────── */}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
          gap: "0.75rem",
        }}
      >
        {trailsInCity.map((trail) => {
          const trailSlug = canonicalTrailSlug({
            name: trail.name ?? null,
            id: trail.id ?? null,
            extSystemRef: trail.extSystemRef ?? null,
          });
          const distance   = formatDistance(trail.lengthMilesTotal);
          const dogsAllowed = trail.dogsAllowed ? String(trail.dogsAllowed) : null;
          const leashPolicy = trail.leashPolicy  ? String(trail.leashPolicy)  : null;
          const shade =
            typeof trail.shadeProxyPercent === "number" && Number.isFinite(trail.shadeProxyPercent)
              ? `${trail.shadeProxyPercent.toFixed(0)}%`
              : null;
          const heat = trail.heatRisk ? String(trail.heatRisk) : null;

          const trailHref = `/${encodeURIComponent(stateLabel)}/${encodeURIComponent(citySlug)}/${encodeURIComponent(trailSlug)}`;

          return (
            <li key={String(trail.slug ?? trail.id ?? trailSlug)}>
              <Link
                href={trailHref}
                style={{
                  display: "block",
                  padding: "0.9rem 1rem",
                  borderRadius: "10px",
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "box-shadow 0.15s, border-color 0.15s",
                }}
                className="city-trail-card"
              >
                {/* Name */}
                <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#111827", marginBottom: "0.2rem", lineHeight: 1.3 }}>
                  {String(trail.name ?? trailSlug ?? "Unnamed trail")}
                </div>

                {/* Distance badge */}
                <div style={{ marginBottom: "0.6rem" }}>
                  <span style={{
                    display: "inline-block",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#15803d",
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: "5px",
                    padding: "1px 7px",
                  }}>
                    {distance}
                  </span>
                </div>

                {/* Meta chips */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
                  {dogsAllowed && (
                    <Chip label={`🐾 ${dogsAllowed}`} />
                  )}
                  {leashPolicy && (
                    <Chip label={`Leash: ${leashPolicy}`} />
                  )}
                  {shade && (
                    <Chip label={`☀️ ${shade} shade`} />
                  )}
                  {heat && (
                    <Chip label={`Heat: ${heat}`} />
                  )}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span style={{
      fontSize: "0.72rem",
      color: "#4b5563",
      background: "#f9fafb",
      border: "1px solid #e5e7eb",
      borderRadius: "5px",
      padding: "1px 6px",
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}
