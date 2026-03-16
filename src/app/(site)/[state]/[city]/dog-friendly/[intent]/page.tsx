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
import {
  buildLongTailCityPath,
  evaluateLongTailIntentsForCity,
  getLongTailIntentBySlug,
  longTailDescription,
  longTailHeading,
  longTailTitle,
  trailHrefForCityTrail,
  type LongTailTrailRecord,
} from "@/lib/seo/longTail";
import { getTrailSystemsIndex, type TrailSystemsIndexRecord } from "@/lib/data/trailSystemsIndex";
import type { TrailCardData } from "@/components/city/CityTrailCardList.client";
import { CityTrailCardList } from "@/components/city/CityTrailCardList.client";

export const revalidate = 1800;

function cityTrails(
  systems: TrailSystemsIndexRecord[],
  stateCode: string,
  cityName: string
): LongTailTrailRecord[] {
  const state = stateCode.toLowerCase();
  const city = cityName.toLowerCase();
  return systems.filter((trail) => {
    const trailState = String(trail.state ?? "").trim().toLowerCase();
    const trailCity = String(trail.city ?? "").trim().toLowerCase();
    const length = typeof trail.lengthMilesTotal === "number" ? trail.lengthMilesTotal : 0;
    return (
      length > 1 &&
      (trailState === state || (!trailState && state === "unknown")) &&
      (trailCity === city || (!trailCity && city === "unknown city"))
    );
  });
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

function asTrailCard(
  trail: LongTailTrailRecord,
  stateCode: string,
  cityName: string,
  stateName: string
): TrailCardData {
  return {
    id: String(trail.id ?? `${trail.name ?? "trail"}-${trail.extSystemRef ?? "na"}`),
    name: String(trail.name ?? "Unnamed trail"),
    href: trailHrefForCityTrail({ state: stateCode, city: cityName, trail }),
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
    surfaceSignal: surfaceSignalFromSummary(trail.surfaceSummary),
  };
}

async function loadPageData(input: {
  stateRaw: string;
  cityRaw: string;
  intentRaw: string;
}) {
  const stateCode = normalizeState(input.stateRaw);
  const cityName = deslugifyCity(input.cityRaw);
  const citySlug = slugifyCity(cityName);
  const intentSlug = input.intentRaw.toLowerCase();
  const intent = getLongTailIntentBySlug(intentSlug);
  if (!intent) return { intent: null };

  const systems = await getTrailSystemsIndex();
  const trails = cityTrails(systems, stateCode, cityName);
  const evaluations = evaluateLongTailIntentsForCity(trails);
  const current = evaluations.find((item) => item.intent.slug === intent.slug) ?? null;

  return {
    intent,
    stateCode,
    cityName,
    citySlug,
    trails,
    evaluations,
    current,
    systems,
  };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ state: string; city: string; intent: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const p = await params;
  const rawState = safeDecodeURIComponent(p.state);
  const rawCity = safeDecodeURIComponent(p.city);
  const rawIntent = safeDecodeURIComponent(p.intent);

  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(rawCity)) {
    return buildPageMetadata({
      title: "Page not found",
      description: "This trail listing route is invalid.",
      pathname: `/${encodeURIComponent(rawState)}/${encodeURIComponent(rawCity)}/dog-friendly/${encodeURIComponent(rawIntent)}`,
      index: false,
    });
  }

  const data = await loadPageData({ stateRaw: rawState, cityRaw: rawCity, intentRaw: rawIntent });
  if (!data.intent || !data.current || !data.current.renderable) {
    return buildPageMetadata({
      title: "Page not found",
      description: "This trail listing route is not available.",
      pathname: `/${encodeURIComponent(normalizeState(rawState))}/${encodeURIComponent(slugifyCity(rawCity))}/dog-friendly/${encodeURIComponent(rawIntent.toLowerCase())}`,
      index: false,
    });
  }

  const canonicalPath = buildLongTailCityPath({
    state: data.stateCode,
    city: data.cityName,
    intent: data.intent.slug,
  });
  const query = (await searchParams) ?? {};
  const hasQueryVariants = hasNonCanonicalQueryParams(query);
  const indexable = !hasQueryVariants && data.current.indexable;
  const stateName = resolveStateName(data.stateCode);

  return buildPageMetadata({
    title: longTailTitle({
      intent: data.intent,
      cityName: data.cityName,
      stateName,
      matchingCount: data.current.matchingCount,
    }),
    description: longTailDescription({
      intent: data.intent,
      cityName: data.cityName,
      stateName,
      matchingCount: data.current.matchingCount,
      cityTrailCount: data.current.cityTrailCount,
    }),
    pathname: canonicalPath,
    index: indexable,
    ogImages: pickDirectoryOgImage({
      systems: data.current.matchingTrails,
      pageLabel: `${data.intent.shortLabel} in ${data.cityName}`,
    }),
  });
}

export default async function CityLongTailPage({
  params,
}: {
  params: Promise<{ state: string; city: string; intent: string }>;
}) {
  const p = await params;
  const rawState = safeDecodeURIComponent(p.state);
  const rawCity = safeDecodeURIComponent(p.city);
  const rawIntent = safeDecodeURIComponent(p.intent);

  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(rawCity)) notFound();

  const data = await loadPageData({ stateRaw: rawState, cityRaw: rawCity, intentRaw: rawIntent });
  if (!data.intent || !data.current || !data.current.renderable) notFound();

  const canonicalPath = buildLongTailCityPath({
    state: data.stateCode,
    city: data.cityName,
    intent: data.intent.slug,
  });
  const cityPath = `/${encodeURIComponent(data.stateCode)}/${encodeURIComponent(data.citySlug)}`;
  if (
    rawState !== data.stateCode ||
    rawCity !== data.citySlug ||
    rawIntent !== data.intent.slug
  ) {
    permanentRedirect(canonicalPath);
  }

  const stateName = resolveStateName(data.stateCode);
  const heading = longTailHeading({
    intent: data.intent,
    cityName: data.cityName,
    stateName,
  });
  const intro = longTailDescription({
    intent: data.intent,
    cityName: data.cityName,
    stateName,
    matchingCount: data.current.matchingCount,
    cityTrailCount: data.current.cityTrailCount,
  });
  const trailCards = data.current.matchingTrails.map((trail) =>
    asTrailCard(trail, data.stateCode, data.cityName, stateName)
  );
  const relatedIndexableIntents = data.evaluations
    .filter((item) => item.intent.slug !== data.intent.slug && item.indexable)
    .slice(0, 2);

  return (
    <section>
      <JsonLd
        id="city-long-tail-schema"
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: stateName, path: `/${encodeURIComponent(data.stateCode)}` },
            { name: data.cityName, path: cityPath },
            { name: data.intent.shortLabel, path: canonicalPath },
          ]),
          collectionPageSchema({
            name: heading,
            description: intro,
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
          <li aria-current="page">{data.intent.shortLabel}</li>
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
          {heading}
        </h1>
        <p style={{ fontSize: "0.84rem", color: "#6b7280", marginTop: "0.55rem", lineHeight: 1.55 }}>
          {intro}
        </p>
        <p style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.35rem", lineHeight: 1.5 }}>
          {data.intent.whyItMatters} Compare the matching trails below and open each trail page for full dog-policy, access, and terrain details.
        </p>
        {relatedIndexableIntents.length > 0 && (
          <p style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.5rem", lineHeight: 1.5 }}>
            Also browse{" "}
            {relatedIndexableIntents.map((item, index) => {
              const href = buildLongTailCityPath({
                state: data.stateCode,
                city: data.cityName,
                intent: item.intent.slug,
              });
              return (
                <span key={item.intent.slug}>
                  {index > 0 ? ", " : ""}
                  <Link href={href} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
                    {item.intent.shortLabel.toLowerCase()}
                  </Link>
                </span>
              );
            })}
            .
          </p>
        )}
      </div>

      <Suspense fallback={null}>
        <CityTrailCardList trails={trailCards} />
      </Suspense>
    </section>
  );
}
