// Data source: InstantDB `trailSystems` + `trailHeads` (full page via getTrailSystemAndHeadsForPage).
// This page renders enriched `trailSystems` in ordered debug-friendly sections.

import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  getTrailSystemForPage,
  getTrailSystemHeadsAndSegmentsForPage,
  type TrailSystemLookup,
} from "@/lib/data/trailSystem";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { extractAmenityPoints, extractParkingPoints } from "@/lib/geo/amenities";
import { timed } from "@/lib/perf";
import { safeDecodeURIComponent, slugifyCity } from "@/lib/slug";
import { ObjectRenderer } from "@/components/ui/ObjectRenderer";
import { RulesAndSafetySection } from "@/components/trails/RulesAndSafetySection";
import { getShadeShortLabel } from "@/components/trail/ShadeSection";
import { TrailHero } from "@/components/trail/TrailHero";
import { DogFitSnapshot } from "@/components/trail/DogFitSnapshot";
import { SafetyConditionsSnapshot } from "@/components/trail/SafetyConditionsSnapshot";
import { CollapsibleSectionHashOpener } from "@/components/ui/CollapsibleSectionHashOpener.client";
import { TerrainComfortSection } from "@/components/trails/TerrainComfortSection";
import { AccessEntrySection } from "@/components/trails/AccessEntrySection";
import { MapSpatialSection } from "@/components/trails/MapSpatialSection";
import { ExploreMoreSection } from "@/components/trails/ExploreMoreSection";
import { formatValue, humanizeKey } from "@/lib/trailSystems/formatters";
import { buildTrailSystemPageModel } from "@/lib/trailSystems/pageModel";
import { normalizeHighlights } from "@/lib/highlights/highlights.utils";
import { isActionableExit, normalizeBailoutPoints } from "@/lib/bailouts/bailouts.utils";
import { TrailFaqSection } from "@/components/trails/TrailFaqSection";
import { normalizeVisibleFaqs } from "@/components/trails/TrailFaqSection";
import { RelatedTrailsSection } from "@/components/trails/RelatedTrailsSection";
import { DogSuitabilitySummary } from "@/components/trails/DogSuitabilitySummary";
import { SectionNav } from "@/components/trail/SectionNav.client";
import type { TrailHeadRow } from "@/lib/data/trailSystem";
import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import {
  breadcrumbSchema,
  faqPageSchema,
  trailPlaceSchema,
  trailWebPageSchema,
} from "@/lib/seo/schema";
import {
  accessFallbackCopy,
  rulesSafetyFallbackCopy,
  terrainFallbackCopy,
} from "@/lib/seo/contentTemplates";
import { normalizeEntityName, resolveStateName } from "@/lib/seo/entities";
import { pickTrailOgImage } from "@/lib/seo/media";
import {
  evaluateTrailIndexability,
  isWellFormedCityParam,
  isWellFormedStateParam,
} from "@/lib/seo/indexation";
import { getTrailSystemsIndex } from "@/lib/data/trailSystemsIndex";
import { resolveRelatedTrails } from "@/lib/trails/relatedTrails";
import { trailDescription as trailMetaDescription, trailTitle as trailMetaTitle } from "@/lib/seo/ctr";
export const revalidate = 3600;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX8_RE = /^[0-9a-f]{8}$/i;
const HEX16_32_RE = /^[0-9a-f]{16,32}$/i;

function extractLookupFromTrailSlug(trailSlug: string): TrailSystemLookup | null {
  const slug = String(trailSlug ?? "").trim();
  const candidate = slug.split("-").pop()?.trim() ?? "";
  if (UUID_RE.test(candidate)) return { kind: "id", value: candidate };
  if (HEX8_RE.test(candidate)) return { kind: "idTail", value: candidate.toLowerCase() };
  if (HEX16_32_RE.test(candidate)) return { kind: "id", value: candidate.toLowerCase() };
  return null;
}

function renderItemsTable(items: Array<{ key: string; label: string; kind?: string; value: any }>) {
  const filtered = items.filter((item) => item.key !== "trailheadPOIs");
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <tbody>
        {filtered.map((item) => {
          const { display, raw, isJsonLike } = formatValue(item);
          return (
            <tr key={item.key} style={{ borderTop: "1px solid #e5e7eb" }}>
              <td style={{ padding: "0.5rem", verticalAlign: "top", width: "28%" }}>
                <strong>{item.label}</strong>
                <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  <code>{item.key}</code>
                </div>
              </td>
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                {isJsonLike ? (
                  <ObjectRenderer
                    data={raw ?? item.value}
                    maxDepth={4}
                    renderMode={
                      ["swimAccessPoints", "hazardPoints", "hazardPointsSample", "accessPoints", "bailoutPoints"].includes(item.key)
                        ? "poi"
                        : undefined
                    }
                  />
                ) : (
                  <span>{display}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function issueValuePreview(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value) || typeof value === "object") {
    return formatValue({ value }).display;
  }
  return String(value);
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// Elevation gain per mile (ft/mi): recalibrated so rolling trails (~70–120 ft/mi) stay Easy/Moderate.
function getElevationProfile(ftPerMile: number): {
  emoji: string;
  label: "Mostly Flat" | "Rolling Hills" | "Challenging Climb" | "Steep Workout";
  explanation: string;
} {
  if (ftPerMile < 150) {
    return {
      emoji: "🟢",
      label: "Mostly Flat",
      explanation: "Gentle terrain with minimal climbing. Good for easy outings and many senior dogs.",
    };
  }
  if (ftPerMile < 450) {
    return {
      emoji: "🟡",
      label: "Rolling Hills",
      explanation: "Steady ups and downs. Most active dogs will enjoy this, but seniors may tire.",
    };
  }
  if (ftPerMile < 750) {
    return {
      emoji: "🟠",
      label: "Challenging Climb",
      explanation: "Frequent climbing effort. Better for fit dogs comfortable with longer uphill stretches.",
    };
  }
  return {
    emoji: "🔴",
    label: "Steep Workout",
    explanation: "Strong uphill effort for much of the route. Best for very fit dogs with planned rest breaks.",
  };
}

function clampUnit(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

function conditionLabel(
  value: string | number | null | undefined,
  fallback: string
): string {
  if (value == null || value === "") return fallback;
  const s = String(value).trim();
  if (!s) return fallback;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function matchesSystem(
  head: TrailHeadRow,
  system: { systemRef?: string; extSystemRef?: string; slug?: string } | null
): boolean {
  if (!system) return false;
  const systemRef =
    (system as { systemRef?: string }).systemRef ??
    (system as { extSystemRef?: string }).extSystemRef;
  if (systemRef != null && systemRef !== "" && head.systemRef === systemRef)
    return true;
  const raw = head.raw && typeof head.raw === "object" ? head.raw : {};
  const slug = (system as { slug?: string }).slug;
  if (slug != null && (raw as { systemSlug?: string }).systemSlug === slug)
    return true;
  if (
    slug != null &&
    head.trailSlug != null &&
    String(head.trailSlug).trim() === String(slug).trim()
  )
    return true;
  return false;
}

function trailCanonicalParts(system: Record<string, unknown>) {
  const canonicalState = normalizeState(String(system.state ?? ""));
  const canonicalCity = slugifyCity(String(system.city ?? ""));
  const canonicalSlug = canonicalTrailSlug({
    name: (system.name as string | null | undefined) ?? null,
    id: (system.id as string | null | undefined) ?? null,
    extSystemRef: (system.extSystemRef as string | null | undefined) ?? null,
  });
  return { canonicalState, canonicalCity, canonicalSlug };
}

function extractPhotoUri(value: unknown, depth = 0): string | null {
  if (depth > 5) return null;
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractPhotoUri(item, depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const direct =
      extractPhotoUri(record.googlePhotoUri, depth + 1) ??
      extractPhotoUri(record.photoUrl, depth + 1) ??
      extractPhotoUri(record.imageUrl, depth + 1);
    if (direct) return direct;
    for (const nested of Object.values(record)) {
      const found = extractPhotoUri(nested, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

export async function generateStaticParams() {
  const systems = await getTrailSystemsIndex();
  return systems
    .filter((s) => typeof s.lengthMilesTotal === "number" && s.lengthMilesTotal > 1)
    .map((s) => ({
      state: normalizeState(String(s.state ?? "")),
      city: slugifyCity(String(s.city ?? "")),
      trailSlug: canonicalTrailSlug({
        name: s.name ?? null,
        id: s.id ?? null,
        extSystemRef: s.extSystemRef ?? null,
      }),
    }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string; trailSlug: string }>;
}): Promise<Metadata> {
  const p = await params;
  const state = safeDecodeURIComponent(p.state);
  const city = safeDecodeURIComponent(p.city);
  if (!isWellFormedStateParam(state) || !isWellFormedCityParam(city)) {
    return buildPageMetadata({
      title: "Trail not found",
      description: "This trail URL is invalid or no longer available.",
      pathname: `/${encodeURIComponent(state)}/${encodeURIComponent(city)}`,
      index: false,
    });
  }
  const rawTrailSlug = safeDecodeURIComponent(p.trailSlug);
  const lookup = extractLookupFromTrailSlug(rawTrailSlug);
  const fallbackPath = `/${encodeURIComponent(state)}/${encodeURIComponent(city)}/${encodeURIComponent(rawTrailSlug)}`;
  if (!lookup) {
    return buildPageMetadata({
      title: "Trail not found",
      description: "This trail URL is invalid or no longer available.",
      pathname: fallbackPath,
      index: false,
    });
  }

  const trail = await getTrailSystemForPage(lookup);
  if (!trail) {
    return buildPageMetadata({
      title: "Trail not found",
      description: "This trail could not be found in the current directory.",
      pathname: fallbackPath,
      index: false,
    });
  }

  const { canonicalState, canonicalCity, canonicalSlug } = trailCanonicalParts(trail as Record<string, unknown>);
  const pathname = `/${encodeURIComponent(canonicalState)}/${encodeURIComponent(canonicalCity)}/${encodeURIComponent(canonicalSlug)}`;
  const name = normalizeEntityName(trail.name, "Trail");
  const lengthMiles =
    typeof trail.lengthMilesTotal === "number" && Number.isFinite(trail.lengthMilesTotal)
      ? trail.lengthMilesTotal
      : null;
  const trailEval = evaluateTrailIndexability({
    name: trail.name,
    city: trail.city,
    state: trail.state,
    lengthMilesTotal: trail.lengthMilesTotal,
    dogsAllowed: trail.dogsAllowed,
    leashPolicy: trail.leashPolicy,
    shadeProxyPercent: trail.shadeProxyPercent,
    waterNearPercent: trail.waterNearPercent,
    swimLikely: trail.swimLikely,
    surfaceSummary: trail.surfaceSummary,
    elevationGainFt: trail.elevationGainFt,
    parkingCount: trail.parkingCount,
    trailheadPOIs: trail.trailheadPOIs,
    highlights: trail.highlights,
    faqs: trail.faqs,
  });
  const indexable =
    Boolean(name && canonicalState && canonicalCity && lengthMiles != null) &&
    trailEval.indexable;
  const cityLabel = typeof trail.city === "string" ? trail.city : null;
  const stateCode = typeof trail.state === "string" ? normalizeState(trail.state) : null;
  const stateLabel = stateCode ? resolveStateName(stateCode) : null;
  const ogImage = extractPhotoUri((trail as Record<string, unknown>).trailheadPOIs);
  const ogImages = pickTrailOgImage({
    trailheadPhotoUri: ogImage ?? null,
    trailName: name,
    cityName: cityLabel,
    stateName: stateLabel,
  });
  const trailSurface =
    typeof (trail.surfaceSummary as { dominant?: unknown } | null | undefined)?.dominant === "string"
      ? String((trail.surfaceSummary as { dominant?: unknown }).dominant)
      : null;

  return buildPageMetadata({
    title: trailMetaTitle({
      trailName: name,
      cityName: cityLabel,
      stateCode,
      leashPolicy: typeof trail.leashPolicy === "string" ? trail.leashPolicy : null,
    }),
    description: trailMetaDescription({
      trailName: name,
      cityName: cityLabel,
      stateName: stateLabel,
      distanceMiles: lengthMiles,
      leashPolicy: typeof trail.leashPolicy === "string" ? trail.leashPolicy : null,
      shadeClass: typeof trail.shadeClass === "string" ? trail.shadeClass : null,
      waterNearPercent: typeof trail.waterNearPercent === "number" ? trail.waterNearPercent : null,
      surface: trailSurface,
      elevationGainFt: typeof trail.elevationGainFt === "number" ? trail.elevationGainFt : null,
    }),
    pathname,
    index: indexable,
    ogType: "article",
    ogImages,
  });
}

export default async function TrailDetailPage({
  params,
}: {
  params: Promise<{ state: string; city: string; trailSlug: string }>;
}) {
  const { state, city, trailSlug } = await params;
  const rawState = safeDecodeURIComponent(state);
  const rawCity = safeDecodeURIComponent(city);
  if (!isWellFormedStateParam(rawState) || !isWellFormedCityParam(rawCity)) notFound();
  const rawTrailSlug = safeDecodeURIComponent(trailSlug);

  const lookup = extractLookupFromTrailSlug(rawTrailSlug);
  const db = await getAdminDbSafe();

  if (!db) {
    return (
      <section>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link href="/">Home</Link>
        </p>
        <h1>Trail</h1>
        <p>{instantDbMissingEnvMessage()}</p>
      </section>
    );
  }

  if (!lookup) {
    notFound();
  }

  let data: Awaited<ReturnType<typeof getTrailSystemHeadsAndSegmentsForPage>>;
  try {
    data = await getTrailSystemHeadsAndSegmentsForPage(lookup);
  } catch (err: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[trail page] getTrailSystemHeadsAndSegmentsForPage failed:", err);
    }
    return (
      <section>
        <p style={{ marginBottom: "0.75rem" }}>
          <Link href={`/${encodeURIComponent(rawState)}/${encodeURIComponent(rawCity)}`} style={{ color: "#64748b", textDecoration: "none" }}>
            ← Back to trails
          </Link>
        </p>
        <h1>Trail</h1>
        <p>Unable to load this trail. Please try again later.</p>
      </section>
    );
  }

  const { system, trailHeads, trailHeadSelection } = data;
  const mapSystemSlug = typeof system?.slug === "string" ? system.slug : null;

  if (process.env.PERF_LOG === "1") {
    console.log("[mud] trail fields", {
      id: system?.id,
      mudRisk: (system as any)?.mudRisk,
      mudRiskScore: (system as any)?.mudRiskScore,
      mudRiskReason: (system as any)?.mudRiskReason,
      mudLastComputedAt: (system as any)?.mudLastComputedAt,
      keys: system ? Object.keys(system) : null,
    });
  }
  if (!system) {
    notFound();
  }

  const { canonicalState, canonicalCity, canonicalSlug } = trailCanonicalParts(
    system as Record<string, unknown>
  );
  const canonicalPath = `/${encodeURIComponent(canonicalState)}/${encodeURIComponent(canonicalCity)}/${encodeURIComponent(canonicalSlug)}`;
  if (rawState !== canonicalState || rawCity !== canonicalCity || rawTrailSlug !== canonicalSlug) {
    permanentRedirect(canonicalPath);
  }

  const model = await timed("compute:buildTrailSystemPageModel (trail)", async () =>
    buildTrailSystemPageModel(system)
  );
  const debug = process.env.NODE_ENV !== "production";
  const totalGainFt = asFiniteNumber(system?.elevationGainFt);
  const maxFt = asFiniteNumber(system?.elevationMaxFt);
  const minFt = asFiniteNumber(system?.elevationMinFt);
  const distanceMiles =
    asFiniteNumber(system?.lengthMilesTotal) ??
    asFiniteNumber(system?.lengthMiles) ??
    asFiniteNumber(system?.lengthMi);
  const intensityFtPerMile =
    totalGainFt != null && distanceMiles != null
      ? totalGainFt / Math.max(distanceMiles, 0.1)
      : null;
  const elevationProfile =
    intensityFtPerMile != null ? getElevationProfile(intensityFtPerMile) : null;
  const headerAddressParts = [model.identity.city, model.identity.state].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  const headerAddress = headerAddressParts.length ? headerAddressParts.join(", ") : null;
  const headerCounty =
    typeof model.identity.county === "string" && model.identity.county.trim().length > 0
      ? model.identity.county.trim()
      : null;
  const headerDistance = distanceMiles != null ? `${distanceMiles.toFixed(1)} mi` : null;
  const routeTypeRaw = typeof system?.routeType === "string" ? system.routeType.trim().toLowerCase() : "";
  const loopStats = system?.loopStats as { hasLoop?: boolean } | null | undefined;
  const hasLoop =
    typeof loopStats?.hasLoop === "boolean"
      ? loopStats.hasLoop
      : routeTypeRaw === "loop";
  const loopLabel: string = hasLoop ? "Loop" : "Not a Loop";
  const routeTypeLabel =
    routeTypeRaw === "loop"
      ? "Loop"
      : routeTypeRaw === "out_and_back" || routeTypeRaw === "out and back"
        ? "Out & back"
        : routeTypeRaw === "point_to_point" || routeTypeRaw === "point to point"
          ? "Point to point"
          : routeTypeRaw
            ? routeTypeRaw.charAt(0).toUpperCase() + routeTypeRaw.slice(1).replace(/_/g, " ")
            : null;
  const headerMeta = [headerAddress, headerCounty, headerDistance, loopLabel]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" • ");
  const shadeProxyPercent = clampUnit(system?.shadeProxyPercent);
  const { amenityPoints, hasCoordinateBearingAmenities } = extractAmenityPoints(system?.trailheadPOIs);
  const parkingPoints = extractParkingPoints(system?.trailheadPOIs);
  const highlights = normalizeHighlights(system?.highlights as any);
  const bailoutSpots = normalizeBailoutPoints(system?.bailoutPoints as any)
    .filter((spot) => isActionableExit(spot))
    .map((spot) => ({
      id: spot.id,
      lat: spot.lat,
      lng: spot.lng,
      title: spot.title,
      primaryKind: spot.primaryKind,
      kinds: spot.kinds,
    }));
  const safetyVets: Array<{ osmId: string; name: string | null; kind: string; lat: number; lon: number; distanceToCentroidMeters: number; tags: Record<string, any> }> = (() => {
    const safety = (system as any)?.safety;
    const vets = Array.isArray(safety?.nearbyVets) ? safety.nearbyVets : [];
    return vets.flatMap((v: any) => {
      const coords = v?.location?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return [];
      const lon = typeof coords[0] === "number" ? coords[0] : null;
      const lat = typeof coords[1] === "number" ? coords[1] : null;
      if (lat == null || lon == null) return [];
      return [{ osmId: String(v.osmId ?? ""), name: v.name ?? null, kind: String(v.kind ?? "veterinary"), lat, lon, distanceToCentroidMeters: v.distanceToCentroidMeters ?? 0, tags: v.tags ?? {} }];
    });
  })();

  const heatRisk = (system as { heatRisk?: string } | null)?.heatRisk;
  const surfaceDominantRaw = (system?.surfaceSummary as { dominant?: string } | null | undefined)?.dominant ?? null;
  const waterNearPctRaw = clampUnit(system?.waterNearPercent);

  function buildHeroVerdict(): string {
    const miles = distanceMiles != null ? `${distanceMiles.toFixed(1)}-mile` : null;
    const route = routeTypeLabel?.toLowerCase() ?? "trail";
    const effortAdj: Record<string, string> = {
      "Mostly Flat": "flat",
      "Rolling Hills": "rolling",
      "Challenging Climb": "hilly",
      "Steep Workout": "strenuous",
    };
    const adj = elevationProfile?.label ? (effortAdj[elevationProfile.label] ?? null) : null;
    const surfaceKey = (surfaceDominantRaw ?? "").toLowerCase();
    const surfaceWord =
      /asphalt|concrete|paved/.test(surfaceKey) ? "paved" :
      /crush|gravel/.test(surfaceKey) ? "gravel and paved" :
      /dirt|grass/.test(surfaceKey) ? "natural" :
      null;
    const leadParts = [adj, miles, route].filter(Boolean).join(" ");
    const s1 = `A ${leadParts}${surfaceWord ? ` with ${surfaceWord} surfaces` : ""}.`;

    const shadeLevel = (system?.shadeClass as string | null | undefined ?? "").toLowerCase();
    const shadePct = shadeProxyPercent != null ? Math.round(shadeProxyPercent * 100) : null;
    const shadeNote =
      shadeLevel === "high" ? "Good shade throughout" :
      shadeLevel === "medium" && shadePct != null ? `Partial shade (${shadePct}% coverage)` :
      shadeLevel === "low" ? "Mostly sun-exposed" :
      null;
    const waterNote =
      (waterNearPctRaw ?? 0) >= 0.6 ? "water access along most of the route" :
      (waterNearPctRaw ?? 0) >= 0.3 ? "some water access" :
      null;
    const timing = heatRisk ? "best in the morning or evening during summer" : null;
    const s2Parts = [shadeNote, waterNote, timing].filter(Boolean);
    const s2 = s2Parts.length > 0 ? s2Parts.join("; ") + "." : null;

    return [s1, s2].filter(Boolean).join(" ");
  }

  const computedQuickVerdict = buildHeroVerdict();

  const matchedHeadsForEntry = trailHeads.filter((th) => matchesSystem(th, system));
  const primaryHead = matchedHeadsForEntry.find((th) => th.isPrimary) ?? matchedHeadsForEntry[0];
  const bestEntryName = primaryHead?.googleCanonicalName ?? primaryHead?.name ?? null;
  const bestEntryUrl = primaryHead?.googleMapsUrl ?? "#planning";

  const winterClass = (system?.winterClass as string | null | undefined)?.trim().toLowerCase();
  const winterNote = winterClass === "high" || winterClass === "medium";
  let computedSeasonGuidance: string;
  if (heatRisk && winterNote) computedSeasonGuidance = "Best in spring and fall; avoid midday in summer.";
  else if (heatRisk) computedSeasonGuidance = "Avoid midday in summer.";
  else if (winterNote) computedSeasonGuidance = "Best in spring and fall; winter can be icy or mixed.";
  else computedSeasonGuidance = "Good year-round.";

  const hasCertifiedPolicy =
    system?.dogsAllowed != null &&
    String(system.dogsAllowed).trim() !== "" &&
    system?.leashPolicy != null &&
    String(system.leashPolicy).trim() !== "" &&
    system?.policySourceUrl != null &&
    String(system.policySourceUrl).trim() !== "";

  const seo = (system as any)?.seoContent as {
    sections: {
      intro?: { a: string; b: string };
      atAGlance?: { a: string; b: string };
      trailheadsAccess?: { a: string; b: string };
      difficultyElevation?: { a: string; b: string };
      crowd?: { a: string; b: string };
      surfacePaws?: { a: string; b: string };
      shadeHeat?: { a: string; b: string };
      water?: { a: string; b: string };
      mudConditions?: { a: string; b: string };
      safetyServices?: { a: string; b: string };
      amenities?: { a: string; b: string };
    };
    faqs?: Array<{ q: string; a: string; confidence: "high" | "medium" | "low" }>;
  } | null | undefined;

  const seoText = (text: string | undefined) =>
    text && text !== "Unknown based on available data." ? text : null;
  const dominantSurfaceLabel =
    surfaceDominantRaw && typeof surfaceDominantRaw === "string"
      ? surfaceDominantRaw.charAt(0).toUpperCase() + surfaceDominantRaw.slice(1).toLowerCase()
      : null;
  const introSummary = trailMetaDescription({
    trailName: model.identity.name ?? "Trail",
    cityName: model.identity.city ?? null,
    stateName: model.identity.state ?? null,
    distanceMiles,
    leashPolicy: typeof system?.leashPolicy === "string" ? system.leashPolicy : null,
    shadeClass: typeof system?.shadeClass === "string" ? system.shadeClass : null,
    waterNearPercent: waterNearPctRaw,
    surface: dominantSurfaceLabel,
    elevationGainFt: totalGainFt,
  });
  const terrainFallback = terrainFallbackCopy({
    distanceMiles,
    elevationGainFt: totalGainFt,
    surface: dominantSurfaceLabel,
    shadeClass: typeof system?.shadeClass === "string" ? system.shadeClass : null,
    waterNearPercent: waterNearPctRaw,
  });
  const accessFallback = accessFallbackCopy({
    trailHeadCount: trailHeads.length,
    parkingCount:
      typeof (system as any)?.parkingCount === "number" && Number.isFinite((system as any)?.parkingCount)
        ? (system as any).parkingCount
        : null,
    parkingFeeKnown:
      typeof (system as any)?.parkingFeeKnown === "boolean"
        ? (system as any).parkingFeeKnown
        : null,
  });
  const rulesFallback = rulesSafetyFallbackCopy({
    hazardsClass: typeof system?.hazardsClass === "string" ? system.hazardsClass : null,
    vetCount: safetyVets.length,
  });
  const schemaDescription = introSummary;
  const cityPath = `/${encodeURIComponent(canonicalState)}/${encodeURIComponent(canonicalCity)}`;
  const canonicalStateName = resolveStateName(canonicalState);
  const trailName = normalizeEntityName(model.identity.name, "Trail");
  const cityName = normalizeEntityName(model.identity.city ?? canonicalCity, "Unknown city");
  const faqItems = normalizeVisibleFaqs(
    (seo?.faqs && seo.faqs.length > 0)
      ? seo.faqs
      : Array.isArray(system?.faqs) && (system.faqs as unknown[]).length > 0
        ? system.faqs
        : []
  );
  const relatedTrails = resolveRelatedTrails({
    currentTrail: {
      id: String(system?.id ?? ""),
      city: model.identity.city ?? canonicalCity,
      state: model.identity.state ?? canonicalState,
    },
    candidates: await getTrailSystemsIndex(),
  });
  const faqSchemaNode = faqPageSchema({
    path: canonicalPath,
    items: faqItems.map((faq) => ({ question: faq.q, answer: faq.a })),
  });
  const centroid = Array.isArray((system as any)?.centroid) ? (system as any).centroid : null;
  const geo =
    Array.isArray(centroid) &&
    centroid.length >= 2 &&
    typeof centroid[0] === "number" &&
    typeof centroid[1] === "number"
      ? { lat: centroid[1], lon: centroid[0] }
      : null;
  const trailSchemaNodes: Array<Record<string, unknown>> = [
    breadcrumbSchema([
      { name: "Home", path: "/" },
      { name: canonicalStateName, path: `/${encodeURIComponent(canonicalState)}` },
      { name: cityName, path: cityPath },
      { name: trailName, path: canonicalPath },
    ]),
    trailWebPageSchema({
      name: `${trailName} trail guide`,
      description: schemaDescription,
      path: canonicalPath,
    }),
    trailPlaceSchema({
      name: trailName,
      description: schemaDescription,
      path: canonicalPath,
      city: cityName,
      state: canonicalStateName,
      geo,
    }),
  ];
  if (faqSchemaNode) trailSchemaNodes.push(faqSchemaNode);

  return (
    <div className="trail-page-sections" style={{ width: "100%", display: "flex", flexDirection: "column" }}>
      <CollapsibleSectionHashOpener />
      <JsonLd
        id="trail-schema"
        data={trailSchemaNodes}
      />
      <nav aria-label="Breadcrumb">
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", gap: "0.4rem", fontSize: "0.8125rem", color: "#94a3b8", flexWrap: "wrap" }}>
          <li>
            <Link href="/" style={{ color: "#94a3b8", textDecoration: "none" }}>Home</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={`/${encodeURIComponent(canonicalState)}`} style={{ color: "#94a3b8", textDecoration: "none" }}>
              {canonicalStateName}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href={cityPath} className="trail-back-link" style={{ color: "#94a3b8", textDecoration: "none", fontSize: "0.8125rem", fontWeight: 500, letterSpacing: "0.01em" }}>
              {cityName}
            </Link>
          </li>
        </ol>
      </nav>

      {/* ── Utility Hero ── */}
      <TrailHero
        name={model.identity.name ?? "Trail"}
        city={model.identity.city ?? null}
        state={model.identity.state ?? null}
        county={model.identity.county ?? null}
        distanceMiles={distanceMiles}
        routeTypeLabel={routeTypeLabel}
        verdict={computedQuickVerdict}
        dogsAllowed={typeof system?.dogsAllowed === "string" ? system.dogsAllowed : null}
        leashPolicy={typeof system?.leashPolicy === "string" ? system.leashPolicy : null}
        effortLabel={elevationProfile?.label ?? null}
        shadeClass={typeof system?.shadeClass === "string" ? system.shadeClass : null}
        shadeProxyPercent={shadeProxyPercent}
        hasCertifiedPolicy={hasCertifiedPolicy}
        policySourceTitle={(system as { policySourceTitle?: string })?.policySourceTitle ?? null}
        policySourceUrl={typeof system?.policySourceUrl === "string" ? system.policySourceUrl : null}
        bestEntryName={bestEntryName}
        bestEntryUrl={bestEntryUrl}
        seasonGuidance={computedSeasonGuidance}
      />

      <p style={{ margin: "0.75rem 0 0", color: "#64748b", fontSize: "0.9rem", lineHeight: 1.6 }}>
        {introSummary} Looking for more options in{" "}
        <Link href={cityPath} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
          {model.identity.city ?? canonicalCity} dog-friendly trails
        </Link>
        {" "}or across{" "}
        <Link href={`/${encodeURIComponent(canonicalState)}`} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
          dog-friendly trails across {canonicalStateName}
        </Link>
        ? Use the sections below for dog policy, access points, shade/heat, water, terrain, and safety.
      </p>

      <SectionNav />

      {debug && model.qa.total > 0 && (
        <section style={{ marginTop: "1.25rem" }}>
            <>
              <h3>Errors ({model.qa.errors.length})</h3>
              {model.qa.errors.length === 0 ? (
                <p>None.</p>
              ) : (
                <ul>
                  {model.qa.errors.map((it, idx) => (
                    <li key={`${it.path}-${idx}`}>
                      <code>{it.path}</code> — {it.message}{" "}
                      {it.value === undefined ? null : (
                        <span>
                          (<code>{issueValuePreview(it.value)}</code>)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <h3>Warnings ({model.qa.warnings.length})</h3>
              {model.qa.warnings.length === 0 ? (
                <p>None.</p>
              ) : (
                <ul>
                  {model.qa.warnings.map((it, idx) => (
                    <li key={`${it.path}-${idx}`}>
                      <code>{it.path}</code> — {it.message}{" "}
                      {it.value === undefined ? null : (
                        <span>
                          (<code>{issueValuePreview(it.value)}</code>)
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
        </section>
      )}

      {/* ── Dog Fit Snapshot ── */}
      <div id="dogfit">
        <DogFitSnapshot
          leashDetails={(system as { leashDetails?: string })?.leashDetails ?? null}
          system={system}
        />
      </div>

      {/* ── Dog Suitability Summary ── */}
      <DogSuitabilitySummary system={system} />

      {/* ── Safety & Conditions Snapshot ── */}
      <div id="safety">
        <SafetyConditionsSnapshot
          hazardsClass={typeof system?.hazardsClass === "string" ? system.hazardsClass : null}
          hazardsReasons={system?.hazardsReasons as string | string[] | null | undefined}
          hazards={system?.hazards as Record<string, unknown> | null | undefined}
          shadeClass={typeof system?.shadeClass === "string" ? system.shadeClass : null}
          shadeProxyPercent={shadeProxyPercent}
          heatRisk={heatRisk ?? null}
          crowdClass={typeof system?.crowdClass === "string" ? system.crowdClass : null}
          crowdReasons={system?.crowdReasons as string | string[] | null | undefined}
          safetyVets={safetyVets}
          winterClass={typeof system?.winterClass === "string" ? system.winterClass : null}
          mudRisk={typeof system?.mudRisk === "string" ? system.mudRisk : null}
        />
      </div>

      {/* ── Terrain & Comfort ── */}
      <TerrainComfortSection
        elevationProfile={elevationProfile}
        elevationProfilePoints={Array.isArray(system?.elevationProfile) ? system.elevationProfile as { d: number; e: number }[] : null}
        totalGainFt={totalGainFt}
        maxFt={maxFt}
        minFt={minFt}
        lengthMiles={distanceMiles}
        gradP50={system?.gradeP50 as number | null}
        gradP90={system?.gradeP90 as number | null}
        widthSummary={system?.widthSummary as { min?: number; max?: number; p50?: number; p90?: number; unknownPct?: number } | null}
        surfaceSummary={system?.surfaceSummary}
        surfaceBreakdown={system?.surfaceBreakdown}
        roughnessRisk={system?.roughnessRisk as string | undefined}
        roughnessRiskScore={(system as any)?.roughnessRiskScore as number | undefined}
        roughnessRiskKnownSamples={(system as any)?.roughnessRiskKnownSamples as number | undefined}
        surfaceProfilePoints={Array.isArray(system?.surfaceProfile) ? system.surfaceProfile as { d: number; surface: string }[] : null}
        shadeClass={typeof system?.shadeClass === "string" ? system.shadeClass : null}
        shadeProxyPercent={shadeProxyPercent}
        shadeProxyScore={system?.shadeProxyScore as number | undefined}
        shadeSources={system?.shadeSources}
        shadeProfilePoints={Array.isArray(system?.shadeProfile) ? system.shadeProfile as { d: number; shade: number }[] : null}
        waterNearScore={system?.waterNearScore as number | undefined}
        waterNearPercent={system?.waterNearPercent as number | undefined}
        waterTypesNearby={system?.waterTypesNearby as string[] | string | undefined}
        swimLikely={system?.swimLikely as boolean | undefined}
        waterProfilePoints={Array.isArray(system?.waterProfile) ? system.waterProfile as { d: number; type: string }[] : null}
        lengthMilesTotal={system?.lengthMilesTotal as number | undefined}
        seoTerrain={seoText(seo?.sections?.difficultyElevation?.a) ?? terrainFallback.terrain}
        seoSurface={seoText(seo?.sections?.surfacePaws?.a) ?? terrainFallback.surface}
        seoShade={seoText(seo?.sections?.shadeHeat?.a) ?? terrainFallback.shade}
        seoWater={seoText(seo?.sections?.water?.a) ?? terrainFallback.water}
      />

      {/* ── Access & Entry ── */}
      <AccessEntrySection
        system={system}
        trailHeads={trailHeads}
        parkingCapacityEstimate={system?.parkingCapacityEstimate as number | null}
        parkingCount={system?.parkingCount as number | null}
        parkingFeeKnown={system?.parkingFeeKnown as boolean | null}
        amenityPoints={Array.isArray(system?.amenityPoints) ? system.amenityPoints as { d: number; kind: string }[] : null}
        lengthMilesTotal={system?.lengthMilesTotal as number | undefined}
        seoAmenities={seoText(seo?.sections?.amenities?.a) ?? accessFallback}
      />

      {/* ── Map & Route ── */}
      <MapSpatialSection
        systemSlug={mapSystemSlug}
        trailHeads={trailHeads}
        trailHeadSelection={trailHeadSelection}
        amenityPoints={amenityPoints}
        amenityCoordinatesAvailable={hasCoordinateBearingAmenities}
        parkingPoints={parkingPoints}
        highlights={highlights}
        vets={safetyVets}
        bailoutSpots={bailoutSpots}
        trailName={model.identity.name ?? null}
        cityName={model.identity.city ?? null}
        stateName={canonicalStateName}
      />

      {/* ── Explore More ── */}
      <ExploreMoreSection
        highlightsRaw={system?.highlights}
        highlightCount={highlights.length}
        highlightPoints={Array.isArray(system?.highlightPoints) ? system.highlightPoints as { d: number; kind: string; name: string | null; distM?: number }[] : null}
        lengthMilesTotal={system?.lengthMilesTotal as number | undefined}
        bailoutPointsRaw={system?.bailoutPoints as any}
        bailoutClass={typeof system?.bailoutClass === "string" ? system.bailoutClass : null}
        bailoutScore={typeof system?.bailoutScore === "number" ? system.bailoutScore : null}
        bailoutReasons={system?.bailoutReasons as string[] | string | null}
      />

      <RulesAndSafetySection
        system={system as Record<string, unknown> | null}
        city={model.identity.city}
        state={model.identity.state}
        introText={rulesFallback}
      />

      <TrailFaqSection faqs={faqItems} />

      <RelatedTrailsSection
        city={model.identity.city ?? ""}
        state={model.identity.state ?? ""}
        relatedTrails={relatedTrails}
      />
    </div>
  );
}
