// Data source: InstantDB `trailSystems` entity.
// Map uses centroid [lon,lat] (already stored from rollup) — no segment geometry needed.

import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { deslugifyCity, safeDecodeURIComponent, slugifyCity } from "@/lib/slug";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { timed } from "@/lib/perf";
import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import { CityTrailMapClient } from "@/components/city/CityTrailMap.client";
import type { CityTrailPin } from "@/components/city/CityTrailMap";
import { CityTrailCardList } from "@/components/city/CityTrailCardList.client";
import type { TrailCardData } from "@/components/city/CityTrailCardList.client";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, collectionPageSchema, faqPageSchema, itemListSchema } from "@/lib/seo/schema";
import { cityBrowseHelp, cityIntro } from "@/lib/seo/contentTemplates";
import { resolveStateName } from "@/lib/seo/entities";
import { pickDirectoryOgImage } from "@/lib/seo/media";
import {
  evaluateCityIndexability,
  isWellFormedCityParam,
  isWellFormedStateParam,
} from "@/lib/seo/indexation";
import { cityDescription, cityTitle } from "@/lib/seo/ctr";
import { getTrailSystemsIndex, type TrailSystemsIndexRecord } from "@/lib/data/trailSystemsIndex";
import { buildDogTypePath, evaluateDogTypeIntentsForCity } from "@/lib/seo/dogType";
import { buildGeoClusterPath, getGeoClustersForCity } from "@/lib/seo/geographic";
import { buildLongTailCityPath, evaluateLongTailIntentsForCity } from "@/lib/seo/longTail";

type TrailSystemRecord = TrailSystemsIndexRecord;

export const revalidate = 3600;

export async function generateStaticParams() {
  const systems = await getTrailSystemsIndex();
  const seen = new Set<string>();
  const result: { state: string; city: string }[] = [];
  for (const s of systems) {
    if (typeof s.lengthMilesTotal !== "number" || s.lengthMilesTotal <= 1) continue;
    const state = normalizeState(String(s.state ?? ""));
    const city = slugifyCity(String(s.city ?? ""));
    const key = `${state}::${city}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ state, city });
    }
  }
  return result;
}

function formatMiles(miles: number): string {
  const n = Math.round(miles);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function cityShadeLabel(systems: TrailSystemRecord[]): string | null {
  let sum = 0, count = 0;
  for (const s of systems) {
    if (typeof s.shadeProxyPercent === "number" && Number.isFinite(s.shadeProxyPercent)) {
      sum += s.shadeProxyPercent; count++;
    }
  }
  if (count === 0) return null;
  const avg = sum / count;
  if (avg >= 0.5) return "Well";
  if (avg >= 0.25) return "Partial";
  return "Open";
}

async function loadTrailSystems(): Promise<TrailSystemRecord[]> {
  return getTrailSystemsIndex();
}

function formatDistance(miles: unknown): string {
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles <= 0) return "—";
  return `${miles.toFixed(1)} mi`;
}

function surfaceSignalFromSummary(surfaceSummary: unknown): string | null {
  if (typeof surfaceSummary === "string" && surfaceSummary.trim().length > 0) {
    return surfaceSummary.trim().toLowerCase();
  }
  if (!surfaceSummary || typeof surfaceSummary !== "object" || Array.isArray(surfaceSummary)) {
    return null;
  }
  const summary = surfaceSummary as { dominant?: unknown };
  if (typeof summary.dominant === "string" && summary.dominant.trim().length > 0) {
    return summary.dominant.trim().toLowerCase();
  }
  return null;
}

function filterCitySystems(
  systems: TrailSystemRecord[],
  stateLabel: string,
  cityLabel: string
): TrailSystemRecord[] {
  const normalizedTargetState = stateLabel.toLowerCase();
  const normalizedTargetCity = cityLabel.toLowerCase();
  return systems.filter((system) => {
    const systemState = String(system.state ?? "").trim().toLowerCase();
    const systemCity = String(system.city ?? "").trim().toLowerCase();
    const matchesState =
      systemState === normalizedTargetState ||
      (!systemState && normalizedTargetState === "unknown");
    const matchesCity =
      systemCity === normalizedTargetCity ||
      (!systemCity && normalizedTargetCity === "unknown city");
    const length = typeof system.lengthMilesTotal === "number" ? system.lengthMilesTotal : 0;
    return matchesState && matchesCity && length > 1;
  });
}

function cityInventory(
  systems: TrailSystemRecord[],
  stateLabel: string,
  cityLabel: string
): { trailCount: number } {
  return { trailCount: filterCitySystems(systems, stateLabel, cityLabel).length };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}): Promise<Metadata> {
  const { state, city } = await params;
  const rawState = safeDecodeURIComponent(state);
  const citySlug = safeDecodeURIComponent(city);
  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(citySlug)) {
    return buildPageMetadata({
      title: "City not found",
      description: "This city route is invalid.",
      pathname: `/${encodeURIComponent(rawState)}/${encodeURIComponent(citySlug)}`,
      index: false,
    });
  }
  const cityLabel = deslugifyCity(citySlug);
  const stateLabel = normalizeState(rawState);
  const stateName = resolveStateName(stateLabel);
  let indexable = true;
  let inventory = { trailCount: 0 };
  let hasLeashSignals = false;
  let hasWaterSignals = false;
  let hasShadeSignals = false;
  let citySystems: TrailSystemRecord[] = [];

  try {
    const systems = await loadTrailSystems();
    citySystems = filterCitySystems(systems, stateLabel, cityLabel);
    inventory = { trailCount: citySystems.length };
    hasLeashSignals = citySystems.some(
      (system) => typeof system.leashPolicy === "string" && system.leashPolicy.trim().length > 0
    );
    hasWaterSignals = citySystems.some(
      (system) =>
        (typeof system.waterNearPercent === "number" && Number.isFinite(system.waterNearPercent)) ||
        system.swimLikely === true
    );
    hasShadeSignals = citySystems.some(
      (system) => typeof system.shadeProxyPercent === "number" && Number.isFinite(system.shadeProxyPercent)
    );
    indexable = indexable && evaluateCityIndexability(inventory).indexable;
  } catch {
    // Keep default indexability decision if inventory cannot be computed.
  }

  return buildPageMetadata({
    title: cityTitle({
      cityName: cityLabel,
      stateCode: stateLabel,
      trailCount: inventory.trailCount,
    }),
    description: cityDescription({
      cityName: cityLabel,
      stateName,
      trailCount: inventory.trailCount,
      hasLeashSignals,
      hasWaterSignals,
      hasShadeSignals,
    }),
    pathname: `/${encodeURIComponent(stateLabel)}/${encodeURIComponent(slugifyCity(cityLabel))}`,
    index: indexable,
    ogImages: pickDirectoryOgImage({
      systems: citySystems,
      pageLabel: `${cityLabel} dog-friendly hiking trails`,
    }),
  });
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ state: string; city: string }>;
}) {
  const { state, city } = await params;
  const rawState = safeDecodeURIComponent(state);
  const citySlug = safeDecodeURIComponent(city);
  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(citySlug)) notFound();
  const cityLabel = deslugifyCity(citySlug);
  const stateLabel = normalizeState(rawState);
  const stateName = resolveStateName(stateLabel);
  const canonicalCitySlug = slugifyCity(cityLabel);
  const cityPath = `/${encodeURIComponent(stateLabel)}/${encodeURIComponent(canonicalCitySlug)}`;

  if (rawState !== stateLabel || citySlug !== canonicalCitySlug) {
    permanentRedirect(cityPath);
  }

  let systems: TrailSystemRecord[] = [];
  const db = await getAdminDbSafe();
  try {
    if (db) systems = await loadTrailSystems();
  } catch {
    // Keep rendering even if data fails.
  }

  const trailsInCity = await timed("compute:filter trailsInCity (city)", async () =>
    filterCitySystems(systems, stateLabel, cityLabel)
  );

  if (trailsInCity.length === 0) {
    return (
      <section>
        <nav aria-label="Breadcrumb" style={{ marginBottom: "0.5rem" }}>
          <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", gap: "0.4rem", fontSize: "0.8125rem", color: "#6b7280" }}>
            <li><Link href="/" style={{ color: "#64748b", textDecoration: "none" }}>Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href={`/${encodeURIComponent(stateLabel)}`} style={{ color: "#64748b", textDecoration: "none" }}>{stateName}</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">{cityLabel}</li>
          </ol>
        </nav>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
          Dog-Friendly Trails in {cityLabel}, {stateName || "Unknown state"}
        </h1>
        {!db && <p style={{ marginBottom: "0.75rem" }}>{instantDbMissingEnvMessage()}</p>}
        <p style={{ marginBottom: "0.75rem", lineHeight: 1.55 }}>
          We couldn&apos;t find indexed dog-friendly trail systems for this city yet. Check other cities in {stateName} while coverage expands.
        </p>
        <p>
          <Link href={`/${encodeURIComponent(stateLabel)}`}>
            ← Back to cities in {stateName || "Unknown state"}
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

  const totalMiles = trailsInCity.reduce(
    (sum, t) => sum + (typeof t.lengthMilesTotal === "number" ? t.lengthMilesTotal : 0), 0
  );
  const shadeLabel = cityShadeLabel(trailsInCity);
  const systemCount = trailsInCity.length;
  const shadeSamples = trailsInCity
    .map((trail) =>
      typeof trail.shadeProxyPercent === "number" && Number.isFinite(trail.shadeProxyPercent)
        ? trail.shadeProxyPercent
        : null
    )
    .filter((value): value is number => value !== null);
  const avgShadePct =
    shadeSamples.length > 0
      ? shadeSamples.reduce((sum, value) => sum + value, 0) / shadeSamples.length
      : null;
  const hasWaterSignals = trailsInCity.some(
    (trail) =>
      (typeof trail.waterNearPercent === "number" && Number.isFinite(trail.waterNearPercent)) ||
      trail.swimLikely === true
  );
  const hasLeashSignals = trailsInCity.some(
    (trail) => typeof trail.leashPolicy === "string" && trail.leashPolicy.trim().length > 0
  );
  const intro = cityIntro({
    city: cityLabel,
    state: stateName,
    trailCount: systemCount,
    totalMiles,
    avgShadePct,
    hasWaterSignals,
    hasLeashSignals,
  });
  const browseHelp = cityBrowseHelp({ city: cityLabel, state: stateName });

  const trailCards: TrailCardData[] = trailsInCity.map((trail) => {
    const trailSlug = canonicalTrailSlug({
      name: trail.name ?? null,
      id: trail.id ?? null,
      extSystemRef: trail.extSystemRef ?? null,
    });
    return {
      id:          String(trail.id ?? trailSlug),
      name:        String(trail.name ?? trailSlug ?? "Unnamed trail"),
      href:        `/${encodeURIComponent(stateLabel)}/${encodeURIComponent(citySlug)}/${encodeURIComponent(trailSlug)}`,
      cityName: cityLabel,
      stateName,
      distance:      formatDistance(trail.lengthMilesTotal),
      distanceMiles: typeof trail.lengthMilesTotal === "number" && Number.isFinite(trail.lengthMilesTotal) ? trail.lengthMilesTotal : null,
      dogsAllowed:   trail.dogsAllowed ? String(trail.dogsAllowed) : null,
      leashPolicy:   trail.leashPolicy  ? String(trail.leashPolicy)  : null,
      shade:
        typeof trail.shadeProxyPercent === "number" && Number.isFinite(trail.shadeProxyPercent)
          ? `${(trail.shadeProxyPercent * 100).toFixed(0)}%`
          : null,
      shadePct:      typeof trail.shadeProxyPercent === "number" && Number.isFinite(trail.shadeProxyPercent) ? trail.shadeProxyPercent : null,
      heat:          trail.heatRisk ? String(trail.heatRisk) : null,
      waterNearPct:  typeof trail.waterNearPercent === "number" && Number.isFinite(trail.waterNearPercent) ? trail.waterNearPercent : null,
      swimLikely:    typeof trail.swimLikely === "boolean" ? trail.swimLikely : null,
      elevationGainFt: typeof trail.elevationGainFt === "number" && Number.isFinite(trail.elevationGainFt) ? trail.elevationGainFt : null,
      surfaceSignal: surfaceSignalFromSummary(trail.surfaceSummary),
    };
  });
  const dogTypeLinks = evaluateDogTypeIntentsForCity(trailsInCity)
    .filter((item) => item.indexable)
    .slice(0, 3);
  const geoLinks = getGeoClustersForCity({ cityName: cityLabel, trails: trailsInCity })
    .filter((cluster) => cluster.indexable)
    .slice(0, 2);
  const dogNeedLinks = evaluateLongTailIntentsForCity(trailsInCity)
    .filter((entry) => entry.indexable)
    .slice(0, 3);
  const trailListSchema = itemListSchema({
    name: `Dog-friendly trails in ${cityLabel}, ${stateName}`,
    path: cityPath,
    items: trailCards.map((trail) => ({
      name: trail.name,
      path: trail.href,
    })),
  });
  const inventoryTone = systemCount >= 20
    ? "broad citywide set"
    : systemCount >= 8
      ? "solid cross-city set"
      : "smaller curated set";
  const hasSurfaceSignals = trailCards.some((trail) => Boolean(trail.surfaceSignal));
  const signalMentions: string[] = [];
  if (hasLeashSignals) signalMentions.push("leash rules");
  if (avgShadePct != null) signalMentions.push("shade coverage");
  if (hasWaterSignals) signalMentions.push("water access");
  if (hasSurfaceSignals) signalMentions.push("surface type");
  signalMentions.push("distance and terrain");
  const signalSummary = signalMentions.slice(0, 4).join(", ");
  const filterCoverageText = [
    avgShadePct != null ? "shade" : null,
    hasWaterSignals ? "water" : null,
    "distance",
    hasSurfaceSignals ? "surface" : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  const leashCoverageText = hasLeashSignals
    ? "Many listings include leash-policy details, so you can compare requirements directly from the list."
    : "Leash information appears where available, so treat missing policy details as unknown and confirm locally.";
  const cityFaqItems = [
    {
      question: `Where can I find dog-friendly hikes in ${cityLabel}?`,
      answer: `${cityLabel} trail options are grouped here in one place as a ${inventoryTone}, with direct links to each trail page. Start with the map or card list, then open individual trails to compare ${signalSummary} before deciding where to hike with your dog.`,
    },
    {
      question: `Are there dog-friendly walking trails in ${cityLabel}?`,
      answer: `Yes. This city directory currently includes ${systemCount} dog-friendly ${systemCount === 1 ? "trail" : "trails"} and walking paths. Use the filters to narrow by easy walks and distance bands${hasSurfaceSignals ? ", plus surface type" : ""}, then compare trail details to match your dog’s comfort and energy level.`,
    },
    {
      question: `Are leash rules the same on every trail in ${cityLabel}?`,
      answer: `No. Leash expectations can vary trail to trail in ${cityLabel}. ${leashCoverageText} Use leash-related filters and confirm final rules on each trail page before heading out.`,
    },
    {
      question: `Can I filter trails in ${cityLabel} by shade, water, or distance?`,
      answer: `Yes. You can filter this ${cityLabel} list by ${filterCoverageText}, plus swim suitability and leash style, then sort by recommendation, distance, or shade. The filters help you narrow options quickly before opening full trail pages for deeper planning.`,
    },
  ];
  const cityFaqSchema = faqPageSchema({
    path: cityPath,
    items: cityFaqItems,
  });

  return (
    <section>
      <JsonLd
        id="city-schema"
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: stateName, path: `/${encodeURIComponent(stateLabel)}` },
            { name: cityLabel, path: cityPath },
          ]),
          collectionPageSchema({
            name: `Dog-Friendly Trails in ${cityLabel}, ${stateLabel}`,
            description: `Directory listing of dog-friendly hiking trails in ${cityLabel}, ${stateName}.`,
            path: cityPath,
            about: {
              name: `${cityLabel}, ${stateName}`,
              path: cityPath,
            },
          }),
          ...(trailListSchema ? [trailListSchema] : []),
          ...(cityFaqSchema ? [cityFaqSchema] : []),
        ]}
      />
      <nav aria-label="Breadcrumb" style={{ marginBottom: "0.5rem" }}>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", gap: "0.4rem", fontSize: "0.8125rem", color: "#6b7280" }}>
          <li><Link href="/" style={{ color: "#64748b", textDecoration: "none" }}>Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href={`/${encodeURIComponent(stateLabel)}`} style={{ color: "#64748b", textDecoration: "none" }}>{stateName}</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{cityLabel}</li>
        </ol>
      </nav>
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          background: "linear-gradient(135deg, #f0fdf4 0%, #f7fee7 55%, #ffffff 100%)",
          padding: "1rem 1.25rem",
          marginBottom: "1.25rem",
        }}
      >
        <Link
          href={`/${encodeURIComponent(stateLabel)}`}
          className="trail-back-link"
          style={{ fontSize: "0.8rem", color: "#6b7280", textDecoration: "none", display: "inline-block", marginBottom: "0.45rem" }}
        >
          ← Back to {stateName}
        </Link>

        {/* Title + stats row */}
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
            Dog-Friendly Trails in {cityLabel}
          </h1>

          <div style={{ display: "flex", gap: "1.25rem", flexShrink: 0, paddingBottom: "0.1rem" }}>
            {totalMiles > 0 && (
              <CityStatPill value={formatMiles(totalMiles)} label="total mi" />
            )}
            <CityStatPill
              value={String(systemCount)}
              label={systemCount === 1 ? "system" : "systems"}
            />
            {shadeLabel && <CityStatPill value={shadeLabel} label="shade" />}
          </div>
        </div>

        {/* Subtitle */}
        <p style={{ fontSize: "0.8125rem", color: "#6b7280", marginTop: "0.5rem", lineHeight: 1.5 }}>
          {intro}
        </p>
        <p style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.35rem", lineHeight: 1.5 }}>
          {browseHelp}
        </p>
      </div>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          background: "#fff",
          padding: "0.9rem 1rem",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", margin: 0, color: "#111827" }}>
          Dog-Friendly Hikes, Trails, and Walking Paths in {cityLabel}
        </h2>
        <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.35rem 0 0", lineHeight: 1.6 }}>
          If you&apos;re comparing dog-friendly hikes in {cityLabel}, this page brings local trail options into one
          place so you can evaluate them side by side. You can review {systemCount} dog-friendly{" "}
          {systemCount === 1 ? "trail" : "trails"} and walking paths, then open each trail page for detailed
          leash rules, shade coverage, water access, trail length, and terrain signals. Instead of scanning generic
          listings, use these city-level comparisons to narrow down which routes best match your dog&apos;s comfort,
          energy level, and preferred walking or hiking conditions.
        </p>
      </section>

      {dogTypeLinks.length > 0 && (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "14px",
            background: "#fff",
            padding: "0.9rem 1rem",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "1.05rem", margin: 0, color: "#111827" }}>
            Browse by Dog Type
          </h2>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.3rem 0 0.6rem", lineHeight: 1.5 }}>
            Open focused trail lists for common dog-specific hiking needs in {cityLabel}.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.45rem" }}>
            {dogTypeLinks.map((entry) => {
              const href = buildDogTypePath({
                state: stateLabel,
                city: cityLabel,
                routeSlug: entry.intent.routeSlug,
              });
              return (
                <li key={entry.intent.routeSlug}>
                  <Link href={href} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
                    {entry.intent.headingLabel} ({entry.matchingCount})
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {geoLinks.length > 0 && (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "14px",
            background: "#fff",
            padding: "0.9rem 1rem",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "1.05rem", margin: 0, color: "#111827" }}>
            Browse by Area
          </h2>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.3rem 0 0.6rem", lineHeight: 1.5 }}>
            Spatial trail clusters for choosing hikes in specific parts of {cityLabel}.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.45rem" }}>
            {geoLinks.map((cluster) => {
              const href = buildGeoClusterPath({
                state: stateLabel,
                city: cityLabel,
                clusterSlug: cluster.slug,
              });
              return (
                <li key={cluster.slug}>
                  <Link href={href} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
                    {cluster.label} dog trails ({cluster.matchingCount})
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {dogNeedLinks.length > 0 && (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "14px",
            background: "#fff",
            padding: "0.9rem 1rem",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ fontSize: "1.05rem", margin: 0, color: "#111827" }}>
            Explore by Dog Need
          </h2>
          <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.3rem 0 0.6rem", lineHeight: 1.5 }}>
            Open curated trail lists for common dog-hiking priorities in {cityLabel}.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            {dogNeedLinks.map((entry) => {
              const href = buildLongTailCityPath({
                state: stateLabel,
                city: cityLabel,
                intent: entry.intent.slug,
              });
              return (
                <li key={entry.intent.slug}>
                  <Link
                    href={href}
                    style={{
                      display: "inline-block",
                      fontSize: "0.8rem",
                      color: "#166534",
                      textDecoration: "none",
                      fontWeight: 600,
                      border: "1px solid #bbf7d0",
                      background: "#f0fdf4",
                      borderRadius: "999px",
                      padding: "0.25rem 0.6rem",
                      lineHeight: 1.35,
                    }}
                  >
                    {entry.intent.shortLabel}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Map ─────────────────────────────────────────────────────────── */}
      {mapPins.length > 0 && (
        <div className="city-map-wrap" style={{ marginBottom: "1.75rem" }}>
          <CityTrailMapClient pins={mapPins} />
        </div>
      )}

      {!db && <p style={{ marginBottom: "1rem" }}>{instantDbMissingEnvMessage()}</p>}

      {/* ── Trail cards ─────────────────────────────────────────────────── */}
      <section style={{ marginBottom: "0.75rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: 0, color: "#111827" }}>
          Dog-Friendly Hikes and Walking Trails in {cityLabel}
        </h2>
        <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.35rem 0 0", lineHeight: 1.5 }}>
          This directory lists {systemCount} dog-friendly {systemCount === 1 ? "trail" : "trails"} and
          walking paths in {cityLabel}. Compare leash rules, shade coverage, water access, terrain, and
          trail distance before choosing the best hike for your dog.
        </p>
      </section>
      <Suspense fallback={null}>
        <CityTrailCardList trails={trailCards} />
      </Suspense>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: "14px",
          background: "#fff",
          padding: "0.95rem 1rem",
          marginTop: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "1.05rem", margin: 0, color: "#111827" }}>
          FAQs About Dog-Friendly Trails in {cityLabel}
        </h2>
        <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.65rem" }}>
          {cityFaqItems.map((item) => (
            <article key={item.question}>
              <h3 style={{ fontSize: "0.9rem", margin: 0, color: "#111827" }}>
                {item.question}
              </h3>
              <p style={{ fontSize: "0.8rem", color: "#6b7280", margin: "0.28rem 0 0", lineHeight: 1.55 }}>
                {item.answer}
              </p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function CityStatPill({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#14532d", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: "0.72rem", color: "#6b7280", fontWeight: 500, marginTop: "0.1rem" }}>
        {label}
      </div>
    </div>
  );
}
