// Data source: InstantDB `trailSystems` entity.
// Expected fields: `state`, `city`, `slug`, `name`, `lengthMilesTotal`.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { safeDecodeURIComponent, slugifyCity } from "@/lib/slug";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { timed } from "@/lib/perf";
import { normalizeState } from "@/lib/trailSlug";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, collectionPageSchema } from "@/lib/seo/schema";
import { stateBrowseHelp, stateIntro } from "@/lib/seo/contentTemplates";
import { resolveStateName } from "@/lib/seo/entities";
import { cityDirectoryAriaLabel } from "@/lib/seo/anchors";
import { pickDirectoryOgImage } from "@/lib/seo/media";
import { getTrailSystemsIndex, type TrailSystemsIndexRecord } from "@/lib/data/trailSystemsIndex";
import {
  evaluateStateIndexability,
  isWellFormedStateParam,
} from "@/lib/seo/indexation";
import { stateDescription, stateTitle } from "@/lib/seo/ctr";

type TrailSystemRecord = TrailSystemsIndexRecord;
type CityData = {
  slug: string;
  label: string;
  count: number;
  miles: number;
  shadePercent: number | null;
};
type CityAccum = Omit<CityData, "shadePercent"> & {
  _shadeSum: number;
  _shadeN: number;
};

export const revalidate = 3600;

export async function generateStaticParams() {
  const systems = await getTrailSystemsIndex();
  const states = new Set<string>();
  for (const s of systems) {
    if (typeof s.lengthMilesTotal === "number" && s.lengthMilesTotal > 1 && s.state) {
      states.add(normalizeState(String(s.state)));
    }
  }
  return Array.from(states).map((state) => ({ state }));
}

function formatMiles(miles: number): string {
  const n = Math.round(miles);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// Returns a factual one-line description of how coverage is distributed.
function distributionNote(cities: CityData[], totalTrails: number): string | null {
  if (cities.length === 0) return null;
  if (cities.length === 1) {
    return `All ${totalTrails} indexed trail system${totalTrails === 1 ? "" : "s"} are in ${cities[0].label}.`;
  }
  const largest = cities.reduce((a, b) => (a.count > b.count ? a : b));
  const pct = totalTrails > 0 ? largest.count / totalTrails : 0;
  if (pct >= 0.7) {
    return `${largest.label} has the majority of indexed systems (${largest.count} of ${totalTrails}).`;
  }
  return `${cities.length} cities listed alphabetically.`;
}

function cityMilesLabel(miles: number): string {
  const n = Math.round(miles);
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k mi` : `${n} mi`;
}

function shadeLabel(pct: number): string {
  if (pct >= 0.5) return "Well shaded";
  if (pct >= 0.25) return "Partial shade";
  return "Mostly open";
}

async function loadTrailSystems(): Promise<TrailSystemRecord[]> {
  return getTrailSystemsIndex();
}

function stateInventory(systems: TrailSystemRecord[], stateLabel: string): {
  cityCount: number;
  trailCount: number;
} {
  const normalizedTargetState = stateLabel.toLowerCase();
  const citySet = new Set<string>();
  let trailCount = 0;

  for (const system of systems) {
    const systemState = String(system.state ?? "").trim();
    const normalizedSystemState = systemState ? systemState.toLowerCase() : "unknown";
    if (normalizedSystemState !== normalizedTargetState) continue;

    const length = typeof system.lengthMilesTotal === "number" ? system.lengthMilesTotal : 0;
    if (length <= 1) continue;
    trailCount += 1;
    citySet.add(slugifyCity(String(system.city ?? "").trim() || "unknown-city"));
  }

  return { cityCount: citySet.size, trailCount };
}

export default async function StatePage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const rawState = safeDecodeURIComponent(state);
  if (!isWellFormedStateParam(rawState)) notFound();
  const stateLabel = normalizeState(rawState);
  const stateName = resolveStateName(stateLabel);
  const statePath = `/${encodeURIComponent(stateLabel)}`;

  if (rawState !== stateLabel) {
    permanentRedirect(statePath);
  }

  let systems: TrailSystemRecord[] = [];
  const db = await getAdminDbSafe();
  try {
    if (db) systems = await loadTrailSystems();
  } catch {
    // Keep rendering even if data fails.
  }

  const normalizedTargetState = stateLabel.toLowerCase();

  const { cities, totalMiles } = await timed(
    "compute:filter+cityMap+sort (state)",
    async () => {
      const systemsInState = systems.filter((system) => {
        const systemState = String(system.state ?? "").trim();
        if (!systemState) return normalizedTargetState === "unknown";
        return systemState.toLowerCase() === normalizedTargetState;
      });
      const cityMap = new Map<string, CityAccum>();
      let totalMiles = 0;
      for (const system of systemsInState) {
        const length =
          typeof system.lengthMilesTotal === "number" ? system.lengthMilesTotal : 0;
        if (length <= 1) continue;
        totalMiles += length;
        const rawCity = String(system.city ?? "").trim();
        const label = rawCity || "Unknown city";
        const slug = slugifyCity(label);
        const entry = cityMap.get(slug) ?? {
          slug, label, count: 0, miles: 0, _shadeSum: 0, _shadeN: 0,
        };
        entry.count += 1;
        entry.miles += length;
        const shadePct = typeof system.shadeProxyPercent === "number"
          ? system.shadeProxyPercent : null;
        if (shadePct !== null) { entry._shadeSum += shadePct; entry._shadeN += 1; }
        cityMap.set(slug, entry);
      }
      const cities: CityData[] = Array.from(cityMap.values())
        .map(({ _shadeSum, _shadeN, ...c }) => ({
          ...c,
          shadePercent: _shadeN > 0 ? _shadeSum / _shadeN : null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      return { cities, totalMiles };
    }
  );

  const totalTrails = cities.reduce((sum, city) => sum + city.count, 0);
  const hasCities = cities.length > 0;

  if (!hasCities) {
    return (
      <div style={{ display: "grid", gap: "2rem" }}>
        <StateHeader stateLabel={stateLabel} stateName={stateName} />
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "14px",
            background: "#fff",
            padding: "1.25rem 1.5rem",
            color: "#6b7280",
            lineHeight: 1.6,
          }}
        >
          {!db && (
            <p style={{ marginBottom: "0.5rem", color: "#374151" }}>
              {instantDbMissingEnvMessage()}
            </p>
          )}
          No trail systems found for this state yet. Coverage is expanding — check back soon.
        </div>
      </div>
    );
  }

  const note = distributionNote(cities, totalTrails);
  const intro = stateIntro({
    stateName,
    cityCount: cities.length,
    totalTrails,
    totalMiles: Math.round(totalMiles),
  });
  const browseHelp = stateBrowseHelp({
    stateName,
    featuredCities: cities.map((city) => city.label),
  });

  return (
    <div style={{ display: "grid", gap: "2rem" }}>
      <JsonLd
        id="state-schema"
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: stateName, path: statePath },
          ]),
          collectionPageSchema({
            name: `Dog-Friendly Trails in ${stateName}`,
            description: `Browse cities in ${stateName} with dog-friendly hiking trail coverage.`,
            path: statePath,
            about: {
              name: stateName,
              path: statePath,
            },
          }),
        ]}
      />
      <nav aria-label="Breadcrumb">
        <ol
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.8125rem",
            color: "#6b7280",
          }}
        >
          <li>
            <Link href="/" style={{ color: "#64748b", textDecoration: "none" }}>
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{stateName}</li>
        </ol>
      </nav>
      {/* ── State header ─────────────────────────────────────────────────── */}
      <StateHeader
        stateLabel={stateLabel}
        stateName={stateName}
        totalTrails={totalTrails}
        cityCount={cities.length}
        totalMiles={Math.round(totalMiles)}
        intro={intro}
      />

      {/* ── City browse ──────────────────────────────────────────────────── */}
      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          background: "#fff",
          overflow: "hidden",
        }}
      >
        {/* Section header */}
        <div className="section-card__header">
          <h2 className="section-card__title">Cities with Dog-Friendly Trails in {stateName}</h2>
          <p className="section-card__subtitle" style={{ marginTop: "0.25rem" }}>
            Choose a city directory to compare dog access, leash rules, shade, and terrain.
          </p>
          {note && (
            <p
              style={{
                fontSize: "0.75rem",
                color: "#9ca3af",
                marginTop: "0.3rem",
                lineHeight: 1.4,
              }}
            >
              {note}
            </p>
          )}
          <p style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.3rem", lineHeight: 1.45 }}>
            {browseHelp}
          </p>
        </div>

        {/* Grid body */}
        <div className="section-card__body">
          {!db && (
            <p style={{ marginBottom: "0.75rem", fontSize: "0.875rem", color: "#374151" }}>
              {instantDbMissingEnvMessage()}
            </p>
          )}

          <ul className="state-cities-grid">
          {cities.map((city, i) => (
            <li
              key={city.slug}
              style={{
                display: "flex",
                ["--card-delay" as string]: `${Math.min(i * 40, 200)}ms`,
              }}
            >
              <Link
                href={`/${encodeURIComponent(stateLabel)}/${encodeURIComponent(city.slug)}`}
                aria-label={cityDirectoryAriaLabel({ cityName: city.label, stateName })}
                title={cityDirectoryAriaLabel({ cityName: city.label, stateName })}
                className="state-city-card"
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  borderRadius: "12px",
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  textDecoration: "none",
                  color: "inherit",
                  boxShadow: "0 1px 4px rgba(15, 23, 42, 0.07), inset 3px 0 0 #dcfce7",
                  overflow: "hidden",
                }}
              >
                {/* Card body — city name + preview signals */}
                <div style={{ flex: 1, padding: "1.125rem 1.25rem 1rem" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "1.25rem",
                      color: "#111827",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.2,
                    }}
                  >
                    {city.label}
                  </div>
                  {(city.miles > 0 || city.shadePercent !== null) && (
                    <div
                      style={{
                        marginTop: "0.45rem",
                        fontSize: "0.75rem",
                        color: "#9ca3af",
                        lineHeight: 1.4,
                      }}
                    >
                      {[
                        city.miles > 0 ? cityMilesLabel(city.miles) : null,
                        city.shadePercent !== null ? shadeLabel(city.shadePercent) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </div>

                {/* Footer — count left, action right */}
                <div
                  className="state-city-card__footer"
                  style={{
                    padding: "0.6rem 1.25rem",
                    borderTop: "1px solid #f0f0f0",
                    background: "#fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "#9ca3af",
                      fontWeight: 500,
                    }}
                  >
                    {city.count} trail system{city.count === 1 ? "" : "s"}
                  </span>
                  <span
                    className="state-city-card__cta"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                      fontSize: "0.8125rem",
                      fontWeight: 600,
                      color: "#166534",
                      flexShrink: 0,
                    }}
                  >
                    See dog-friendly trails
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
        </div>
      </section>
    </div>
  );
}

// ── State header ──────────────────────────────────────────────────────────────

function StateHeader({
  stateLabel,
  stateName,
  totalTrails,
  cityCount,
  totalMiles,
  intro,
}: {
  stateLabel: string;
  stateName: string;
  totalTrails?: number;
  cityCount?: number;
  totalMiles?: number;
  intro?: string;
}) {
  const hasStats =
    totalTrails !== undefined && cityCount !== undefined && totalMiles !== undefined;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        background: "linear-gradient(135deg, #f0fdf4 0%, #f7fee7 55%, #ffffff 100%)",
        padding: "1rem 1.25rem",
      }}
    >
      {/* Breadcrumb */}
      <Link
        href="/"
        className="trail-back-link"
        style={{
          fontSize: "0.8rem",
          color: "#6b7280",
          textDecoration: "none",
          display: "inline-block",
          marginBottom: "0.55rem",
        }}
      >
        ← Back to dog-friendly trail states
      </Link>

      {/* State name + stats */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <h1
          style={{
            fontSize: "1.625rem",
            fontWeight: 700,
            color: "#111827",
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            margin: 0,
          }}
        >
          Dog-Friendly Hiking Trails in {stateName}
        </h1>

        {hasStats && (
          <div
            style={{
              display: "flex",
              gap: "1.25rem",
              flexShrink: 0,
              paddingBottom: "0.1rem",
            }}
          >
            <StatPill value={formatMiles(totalMiles!)} label="total mi" />
            <StatPill value={String(totalTrails)} label={totalTrails === 1 ? "system" : "systems"} />
            <StatPill value={String(cityCount)} label={cityCount === 1 ? "city" : "cities"} />
          </div>
        )}
      </div>
      {intro && (
        <p style={{ margin: "0.55rem 0 0", color: "#6b7280", fontSize: "0.875rem", lineHeight: 1.55 }}>
          {intro}
        </p>
      )}
    </div>
  );
}

function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          color: "#14532d",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: "0.72rem",
          color: "#6b7280",
          fontWeight: 500,
          marginTop: "0.1rem",
        }}
      >
        {label}
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const rawState = safeDecodeURIComponent(state);
  if (!isWellFormedStateParam(rawState)) {
    return buildPageMetadata({
      title: "State not found",
      description: "This state route is invalid.",
      pathname: `/${encodeURIComponent(rawState)}`,
      index: false,
    });
  }
  const stateLabel = normalizeState(rawState);
  const stateName = resolveStateName(stateLabel);
  let indexable = true;
  let inventory = { cityCount: 0, trailCount: 0 };
  let stateSystems: TrailSystemRecord[] = [];

  try {
    const systems = await loadTrailSystems();
    stateSystems = systems.filter((system) => {
      const systemState = String(system.state ?? "").trim().toLowerCase();
      const length = typeof system.lengthMilesTotal === "number" ? system.lengthMilesTotal : 0;
      return (
        length > 1 &&
        (systemState === stateLabel.toLowerCase() ||
          (!systemState && stateLabel.toLowerCase() === "unknown"))
      );
    });
    inventory = stateInventory(systems, stateLabel);
    indexable = indexable && evaluateStateIndexability(inventory).indexable;
  } catch {
    // Keep default indexability decision if inventory cannot be computed.
  }

  return buildPageMetadata({
    title: stateTitle({
      stateName,
      trailCount: inventory.trailCount,
    }),
    description: stateDescription({
      stateName,
      cityCount: inventory.cityCount,
      trailCount: inventory.trailCount,
    }),
    pathname: `/${encodeURIComponent(stateLabel)}`,
    index: indexable,
    ogImages: pickDirectoryOgImage({
      systems: stateSystems,
      pageLabel: `${stateName} dog-friendly hiking trails`,
    }),
  });
}
