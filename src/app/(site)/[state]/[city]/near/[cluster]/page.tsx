import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { deslugifyCity, safeDecodeURIComponent, slugifyCity } from "@/lib/slug";
import { normalizeState, canonicalTrailSlug } from "@/lib/trailSlug";
import { getTrailSystemsIndex, type TrailSystemsIndexRecord } from "@/lib/data/trailSystemsIndex";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbSchema, collectionPageSchema } from "@/lib/seo/schema";
import { resolveStateName } from "@/lib/seo/entities";
import { hasNonCanonicalQueryParams, isWellFormedCityParam, isWellFormedStateParam } from "@/lib/seo/indexation";
import { pickDirectoryOgImage } from "@/lib/seo/media";
import { CityTrailCardList } from "@/components/city/CityTrailCardList.client";
import type { TrailCardData } from "@/components/city/CityTrailCardList.client";
import { buildGeoClusterPath, getGeoClustersForCity } from "@/lib/seo/geographic";

export const revalidate = 1800;

function formatDistance(miles: unknown): string {
  if (typeof miles !== "number" || !Number.isFinite(miles) || miles <= 0) return "—";
  return `${miles.toFixed(1)} mi`;
}

function toTrailCard(trail: TrailSystemsIndexRecord, stateCode: string, cityName: string, stateName: string): TrailCardData {
  const trailSlug = canonicalTrailSlug({
    name: trail.name ?? null,
    id: trail.id ?? null,
    extSystemRef: trail.extSystemRef ?? null,
  });
  return {
    id: String(trail.id ?? trailSlug),
    name: String(trail.name ?? "Unnamed trail"),
    href: `/${encodeURIComponent(stateCode)}/${encodeURIComponent(slugifyCity(cityName))}/${encodeURIComponent(trailSlug)}`,
    cityName,
    stateName,
    distance: formatDistance(trail.lengthMilesTotal),
    distanceMiles: typeof trail.lengthMilesTotal === "number" ? trail.lengthMilesTotal : null,
    dogsAllowed: trail.dogsAllowed ? String(trail.dogsAllowed) : null,
    leashPolicy: trail.leashPolicy ? String(trail.leashPolicy) : null,
    shade: typeof trail.shadeProxyPercent === "number" ? `${Math.round(trail.shadeProxyPercent * 100)}%` : null,
    shadePct: typeof trail.shadeProxyPercent === "number" ? trail.shadeProxyPercent : null,
    heat: trail.heatRisk ? String(trail.heatRisk) : null,
    waterNearPct: typeof trail.waterNearPercent === "number" ? trail.waterNearPercent : null,
    swimLikely: typeof trail.swimLikely === "boolean" ? trail.swimLikely : null,
    elevationGainFt: typeof trail.elevationGainFt === "number" ? trail.elevationGainFt : null,
  };
}

async function loadGeoPageData(input: { stateRaw: string; cityRaw: string; clusterRaw: string }) {
  const stateCode = normalizeState(input.stateRaw);
  const cityName = deslugifyCity(input.cityRaw);
  const citySlug = slugifyCity(cityName);
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
  const clusters = getGeoClustersForCity({ cityName, trails: trailsInCity });
  const cluster = clusters.find((item) => item.slug === input.clusterRaw.toLowerCase()) ?? null;
  return { stateCode, cityName, citySlug, trailsInCity, clusters, cluster };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ state: string; city: string; cluster: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const p = await params;
  const rawState = safeDecodeURIComponent(p.state);
  const rawCity = safeDecodeURIComponent(p.city);
  const rawCluster = safeDecodeURIComponent(p.cluster);
  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(rawCity)) {
    return buildPageMetadata({
      title: "Page not found",
      description: "This geographic listing route is invalid.",
      pathname: `/${encodeURIComponent(rawState)}/${encodeURIComponent(rawCity)}/near/${encodeURIComponent(rawCluster)}`,
      index: false,
    });
  }
  const data = await loadGeoPageData({ stateRaw: rawState, cityRaw: rawCity, clusterRaw: rawCluster });
  if (!data.cluster || !data.cluster.renderable) {
    return buildPageMetadata({
      title: "Page not found",
      description: "This geographic listing route is not available.",
      pathname: `/${encodeURIComponent(data.stateCode)}/${encodeURIComponent(data.citySlug)}/near/${encodeURIComponent(rawCluster.toLowerCase())}`,
      index: false,
    });
  }
  const canonicalPath = buildGeoClusterPath({
    state: data.stateCode,
    city: data.cityName,
    clusterSlug: data.cluster.slug,
  });
  const query = (await searchParams) ?? {};
  const stateName = resolveStateName(data.stateCode);
  const hasQueryVariants = hasNonCanonicalQueryParams(query);
  return buildPageMetadata({
    title: `Dog-Friendly Trails in ${data.cluster.label}, ${stateName}`,
    description: `${data.cluster.matchingCount} dog-friendly trails in the ${data.cluster.label} area. Compare leash policy, shade, water access, and route effort before you go.`,
    pathname: canonicalPath,
    index: !hasQueryVariants && data.cluster.indexable,
    ogImages: pickDirectoryOgImage({
      systems: data.trailsInCity.filter((trail) => data.cluster?.trailIds.includes(String(trail.id ?? ""))),
      pageLabel: `Dog-friendly trails in ${data.cluster.label}`,
    }),
  });
}

export default async function GeoClusterPage({
  params,
}: {
  params: Promise<{ state: string; city: string; cluster: string }>;
}) {
  const p = await params;
  const rawState = safeDecodeURIComponent(p.state);
  const rawCity = safeDecodeURIComponent(p.city);
  const rawCluster = safeDecodeURIComponent(p.cluster);
  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(rawCity)) notFound();

  const data = await loadGeoPageData({ stateRaw: rawState, cityRaw: rawCity, clusterRaw: rawCluster });
  if (!data.cluster || !data.cluster.renderable) notFound();

  const canonicalPath = buildGeoClusterPath({
    state: data.stateCode,
    city: data.cityName,
    clusterSlug: data.cluster.slug,
  });
  if (rawState !== data.stateCode || rawCity !== data.citySlug || rawCluster !== data.cluster.slug) {
    permanentRedirect(canonicalPath);
  }

  const stateName = resolveStateName(data.stateCode);
  const cityPath = `/${encodeURIComponent(data.stateCode)}/${encodeURIComponent(data.citySlug)}`;
  const matchingTrails = data.trailsInCity.filter((trail) => data.cluster?.trailIds.includes(String(trail.id ?? "")));
  const cards = matchingTrails.map((trail) => toTrailCard(trail, data.stateCode, data.cityName, stateName));

  return (
    <section>
      <JsonLd
        id="geo-cluster-schema"
        data={[
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: stateName, path: `/${encodeURIComponent(data.stateCode)}` },
            { name: data.cityName, path: cityPath },
            { name: `${data.cluster.label} dog trails`, path: canonicalPath },
          ]),
          collectionPageSchema({
            name: `Dog-Friendly Trails in ${data.cluster.label}, ${stateName}`,
            description: `${data.cluster.matchingCount} dog-friendly trails grouped by real spatial proximity in ${data.cluster.label}.`,
            path: canonicalPath,
            about: { name: `${data.cluster.label}, ${stateName}`, path: cityPath },
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
          <li aria-current="page">{data.cluster.label}</li>
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
          Dog-Friendly Trails in {data.cluster.label}, {stateName}
        </h1>
        <p style={{ fontSize: "0.84rem", color: "#6b7280", marginTop: "0.55rem", lineHeight: 1.55 }}>
          This page groups trails by real spatial proximity in the {data.cluster.label} area to help you choose hikes closer to where you want to start.
        </p>
      </div>

      <CityTrailCardList trails={cards} />
    </section>
  );
}
