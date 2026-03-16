import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { deslugifyCity, safeDecodeURIComponent, slugifyCity } from "@/lib/slug";
import { normalizeState } from "@/lib/trailSlug";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, collectionPageSchema } from "@/lib/seo/schema";
import { resolveStateName } from "@/lib/seo/entities";
import { pickDirectoryOgImage } from "@/lib/seo/media";
import { hasNonCanonicalQueryParams, isWellFormedCityParam, isWellFormedStateParam } from "@/lib/seo/indexation";
import type { TrailCardData } from "@/components/city/CityTrailCardList.client";
import { CityTrailCardList } from "@/components/city/CityTrailCardList.client";
import { getTrailSystemsIndex } from "@/lib/data/trailSystemsIndex";
import {
  buildDogTypePath,
  dogTypeDescription,
  dogTypeTitle,
  dogTypeTrailHref,
  evaluateDogTypeIntentsForCity,
  getDogTypeIntentByRouteSlug,
  type DogTypeRouteSlug,
  type DogTypeTrailRecord,
} from "@/lib/seo/dogType";

function formatDistance(miles: unknown): string {
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles <= 0) return "—";
  return `${miles.toFixed(1)} mi`;
}

function asTrailCard(
  trail: DogTypeTrailRecord,
  stateCode: string,
  cityName: string,
  stateName: string
): TrailCardData {
  return {
    id: String(trail.id ?? `${trail.name ?? "trail"}-${trail.extSystemRef ?? "na"}`),
    name: String(trail.name ?? "Unnamed trail"),
    href: dogTypeTrailHref({ state: stateCode, city: cityName, trail }),
    cityName,
    stateName,
    distance: formatDistance(trail.lengthMilesTotal),
    distanceMiles:
      typeof trail.lengthMilesTotal === "number" && Number.isFinite(trail.lengthMilesTotal)
        ? trail.lengthMilesTotal
        : null,
    dogsAllowed: trail.dogsAllowed ? String(trail.dogsAllowed) : null,
    leashPolicy: trail.leashPolicy ? String(trail.leashPolicy) : null,
    shade:
      typeof trail.shadeProxyPercent === "number" && Number.isFinite(trail.shadeProxyPercent)
        ? `${Math.round(trail.shadeProxyPercent * 100)}%`
        : null,
    shadePct:
      typeof trail.shadeProxyPercent === "number" && Number.isFinite(trail.shadeProxyPercent)
        ? trail.shadeProxyPercent
        : null,
    heat: trail.heatRisk ? String(trail.heatRisk) : null,
    waterNearPct:
      typeof trail.waterNearPercent === "number" && Number.isFinite(trail.waterNearPercent)
        ? trail.waterNearPercent
        : null,
    swimLikely: typeof trail.swimLikely === "boolean" ? trail.swimLikely : null,
    elevationGainFt:
      typeof trail.elevationGainFt === "number" && Number.isFinite(trail.elevationGainFt)
        ? trail.elevationGainFt
        : null,
    surfaceSignal: (() => {
      const s = trail.surfaceSummary;
      if (typeof s === "string" && s.trim()) return s.trim().toLowerCase();
      if (s && typeof s === "object" && !Array.isArray(s)) {
        const dominant = (s as { dominant?: unknown }).dominant;
        if (typeof dominant === "string" && dominant.trim()) return dominant.trim().toLowerCase();
      }
      return null;
    })(),
  };
}

async function loadDogTypePageData(input: {
  stateRaw: string;
  cityRaw: string;
  routeSlug: DogTypeRouteSlug;
}) {
  const stateCode = normalizeState(input.stateRaw);
  const cityName = deslugifyCity(input.cityRaw);
  const citySlug = slugifyCity(cityName);
  const intent = getDogTypeIntentByRouteSlug(input.routeSlug);
  if (!intent) return { intent: null };

  const systems = await getTrailSystemsIndex();
  const trailsInCity = systems.filter((trail) => {
    const trailState = String(trail.state ?? "").trim().toLowerCase();
    const trailCity = String(trail.city ?? "").trim().toLowerCase();
    const length = typeof trail.lengthMilesTotal === "number" ? trail.lengthMilesTotal : 0;
    return (
      length > 1 &&
      (trailState === stateCode.toLowerCase() || (!trailState && stateCode.toLowerCase() === "unknown")) &&
      (trailCity === cityName.toLowerCase() || (!trailCity && cityName.toLowerCase() === "unknown city"))
    );
  });
  const evaluations = evaluateDogTypeIntentsForCity(trailsInCity);
  const current = evaluations.find((entry) => entry.intent.routeSlug === intent.routeSlug) ?? null;

  return {
    intent,
    stateCode,
    cityName,
    citySlug,
    trailsInCity,
    evaluations,
    current,
  };
}

export async function generateDogTypeMetadata(input: {
  params: Promise<{ state: string; city: string }>;
  routeSlug: DogTypeRouteSlug;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const p = await input.params;
  const rawState = safeDecodeURIComponent(p.state);
  const rawCity = safeDecodeURIComponent(p.city);
  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(rawCity)) {
    return buildPageMetadata({
      title: "Page not found",
      description: "This listing route is invalid.",
      pathname: `/${encodeURIComponent(rawState)}/${encodeURIComponent(rawCity)}/${encodeURIComponent(input.routeSlug)}`,
      index: false,
    });
  }

  const data = await loadDogTypePageData({
    stateRaw: rawState,
    cityRaw: rawCity,
    routeSlug: input.routeSlug,
  });
  if (!data.intent || !data.current || !data.current.renderable) {
    return buildPageMetadata({
      title: "Page not found",
      description: "This listing route is not available.",
      pathname: `/${encodeURIComponent(normalizeState(rawState))}/${encodeURIComponent(slugifyCity(rawCity))}/${encodeURIComponent(input.routeSlug)}`,
      index: false,
    });
  }

  const canonicalPath = buildDogTypePath({
    state: data.stateCode,
    city: data.cityName,
    routeSlug: data.intent.routeSlug,
  });
  const query = (await input.searchParams) ?? {};
  const hasQueryVariants = hasNonCanonicalQueryParams(query);
  const stateName = resolveStateName(data.stateCode);

  return buildPageMetadata({
    title: dogTypeTitle({
      intent: data.intent,
      cityName: data.cityName,
      stateName,
    }),
    description: dogTypeDescription({
      intent: data.intent,
      cityName: data.cityName,
      stateName,
      matchingCount: data.current.matchingCount,
      cityTrailCount: data.current.cityTrailCount,
    }),
    pathname: canonicalPath,
    index: !hasQueryVariants && data.current.indexable,
    ogImages: pickDirectoryOgImage({
      systems: data.current.matches,
      pageLabel: `${data.intent.headingLabel} in ${data.cityName}`,
    }),
  });
}

export async function DogTypeLandingPage(input: {
  params: Promise<{ state: string; city: string }>;
  routeSlug: DogTypeRouteSlug;
}) {
  const p = await input.params;
  const rawState = safeDecodeURIComponent(p.state);
  const rawCity = safeDecodeURIComponent(p.city);
  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(rawCity)) notFound();

  const data = await loadDogTypePageData({
    stateRaw: rawState,
    cityRaw: rawCity,
    routeSlug: input.routeSlug,
  });
  if (!data.intent || !data.current || !data.current.renderable) notFound();

  const canonicalPath = buildDogTypePath({
    state: data.stateCode,
    city: data.cityName,
    routeSlug: data.intent.routeSlug,
  });
  const cityPath = `/${encodeURIComponent(data.stateCode)}/${encodeURIComponent(data.citySlug)}`;
  if (rawState !== data.stateCode || rawCity !== data.citySlug) {
    permanentRedirect(canonicalPath);
  }

  const stateName = resolveStateName(data.stateCode);
  const description = dogTypeDescription({
    intent: data.intent,
    cityName: data.cityName,
    stateName,
    matchingCount: data.current.matchingCount,
    cityTrailCount: data.current.cityTrailCount,
  });
  const trailCards = data.current.matches.map((trail) =>
    asTrailCard(trail, data.stateCode, data.cityName, stateName)
  );

  return (
    <section>
      <JsonLd
        id={`dog-type-${data.intent.routeSlug}-schema`}
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: stateName, path: `/${encodeURIComponent(data.stateCode)}` },
            { name: data.cityName, path: cityPath },
            { name: data.intent.headingLabel, path: canonicalPath },
          ]),
          collectionPageSchema({
            name: `${data.intent.headingLabel} in ${data.cityName}, ${stateName}`,
            description,
            path: canonicalPath,
            about: {
              name: `${data.cityName}, ${stateName}`,
              path: cityPath,
            },
          }),
        ]}
      />

      <nav aria-label="Breadcrumb" style={{ marginBottom: "0.5rem" }}>
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", gap: "0.4rem", fontSize: "0.8125rem", color: "#6b7280", flexWrap: "wrap" }}>
          <li><Link href="/" style={{ color: "#64748b", textDecoration: "none" }}>Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href={`/${encodeURIComponent(data.stateCode)}`} style={{ color: "#64748b", textDecoration: "none" }}>{stateName}</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href={cityPath} style={{ color: "#64748b", textDecoration: "none" }}>{data.cityName}</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{data.intent.headingLabel}</li>
        </ol>
      </nav>

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
          href={cityPath}
          className="trail-back-link"
          style={{ fontSize: "0.8rem", color: "#6b7280", textDecoration: "none", display: "inline-block", marginBottom: "0.45rem" }}
        >
          ← Back to all dog-friendly trails in {data.cityName}
        </Link>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827", letterSpacing: "-0.025em", lineHeight: 1.15, margin: 0 }}>
          {data.intent.headingLabel} in {data.cityName}, {stateName}
        </h1>
        <p style={{ fontSize: "0.84rem", color: "#6b7280", marginTop: "0.55rem", lineHeight: 1.55 }}>
          {description}
        </p>
      </div>

      <Suspense fallback={null}>
        <CityTrailCardList trails={trailCards} />
      </Suspense>
    </section>
  );
}
