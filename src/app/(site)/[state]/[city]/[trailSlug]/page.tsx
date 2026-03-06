// Data source: InstantDB `trailSystems` + `trailHeads` (full page via getTrailSystemAndHeadsForPage).
// This page renders enriched `trailSystems` in ordered debug-friendly sections.

import type { ReactNode } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Calendar, Medal, Navigation, Sun, TreePine, Users } from "lucide-react";
import {
  getTrailSystemForPage,
  getTrailSystemHeadsAndSegmentsForPage,
  type TrailSystemLookup,
} from "@/lib/data/trailSystem";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { extractAmenityPoints, extractParkingPoints } from "@/lib/geo/amenities";
import { timed } from "@/lib/perf";
import { safeDecodeURIComponent } from "@/lib/slug";
import { ObjectRenderer } from "@/components/ui/ObjectRenderer";
import { RulesAndSafetySection } from "@/components/trail/RulesAndSafetySection";
import { AmenitiesGrid } from "@/components/trail/AmenitiesGrid";
import { CrowdSection } from "@/components/trail/CrowdSection";
import { ShadeSection, getShadeShortLabel, getShadeTierLabel } from "@/components/trail/ShadeSection";
import { SurfaceSection } from "@/components/trail/SurfaceSection";
import { WaterSection } from "@/components/trail/WaterSection";
import { LightingSection } from "@/components/trail/LightingSection";
import { MudRiskSection } from "@/components/trail/MudRiskSection";
import { AfterDarkSection } from "@/components/trail/AfterDarkSection";
import { SafetySection } from "@/components/trail/SafetySection";
import { HazardsSection } from "@/components/trail/HazardsSection";
import { HikeHighlightsSection } from "@/components/trail/HikeHighlightsSection.client";
import { HighlightProfileChart } from "@/components/trail/HighlightProfileChart";
import { ElevationWidthSection } from "@/components/trail/ElevationWidthSection";
import { ParkingSection } from "@/components/trail/ParkingSection";
import { RouteAmenitiesSection } from "@/components/trail/RouteAmenitiesSection";
import { TrailheadsSection } from "@/components/trail/TrailheadsSection";
import { SwimSection } from "@/components/trail/SwimSection";
import { WinterSection } from "@/components/trail/WinterSection";
import { DogTypesSection } from "@/components/trail/DogTypesSection";
import { TrailSegmentsMapClient } from "@/components/trail/TrailSegmentsMap.client";
import { DogPolicyBanner } from "@/components/trail/DogPolicyBanner";
import { InsightCard } from "@/components/ui/InsightCard";
import { MetricGrid, TrailIcons, DistanceIcon, LeashIcon } from "@/components/ui/TrailPictograms";
import { TrailDashboard } from "@/components/trail/TrailDashboard";
import { CollapsibleSectionHashOpener } from "@/components/ui/CollapsibleSectionHashOpener.client";
import { formatValue, humanizeKey } from "@/lib/trailSystems/formatters";
import { buildTrailSystemPageModel } from "@/lib/trailSystems/pageModel";
import { normalizeHighlights } from "@/lib/highlights/highlights.utils";
import { FaqSection } from "@/components/trail/FaqSection";
import type { TrailHeadRow } from "@/lib/data/trailSystem";

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

function waterSummaryLabel(pct: number | null | undefined): string {
  if (pct == null) return "Unknown";
  if (pct < 0.2) return "None";
  if (pct < 0.5) return "Some";
  if (pct < 0.8) return "Moderate";
  return "Good";
}

function lightingSummaryLabel(
  litPercentKnown: number | null | undefined,
  litYesSamples: number | null | undefined,
  totalSamples: number | null | undefined
): string {
  if (litPercentKnown == null || litPercentKnown < 0.01) return "Unknown";
  if (litYesSamples != null && totalSamples != null && totalSamples > 0) {
    const pct = (litYesSamples / totalSamples) * 100;
    if (pct < 10) return "None";
    if (pct < 50) return "Partial";
    return "Good";
  }
  return "Unknown";
}

function afterDarkSummaryLabel(
  litPercentKnown: number | null | undefined,
  litYesSamples: number | null | undefined,
  totalSamples: number | null | undefined
): string {
  const lighting = lightingSummaryLabel(litPercentKnown, litYesSamples, totalSamples);
  if (lighting === "Good") return "More ready";
  if (lighting === "Partial") return "Some readiness";
  if (lighting === "None") return "Low readiness";
  return "Check details";
}

function swimSummaryLabel(
  swimLikely: boolean | null | undefined,
  swimAccessPointsCount: number | null | undefined
): string {
  const count = typeof swimAccessPointsCount === "number" && Number.isFinite(swimAccessPointsCount)
    ? Math.round(swimAccessPointsCount)
    : 0;
  if (swimLikely === true) return "Likely";
  if (count > 0) return "Possible";
  if (swimLikely === false) return "Low";
  return "Unknown";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string; city: string; trailSlug: string }>;
}): Promise<Metadata> {
  const p = await params;
  const rawTrailSlug = safeDecodeURIComponent(p.trailSlug);
  const lookup = extractLookupFromTrailSlug(rawTrailSlug);
  if (!lookup) return { title: "Trail not found" };

  const trail = await getTrailSystemForPage(lookup);
  if (!trail) return { title: "Trail not found" };

  return { title: String(trail.name ?? "Trail") };
}

export default async function TrailDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ state: string; city: string; trailSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ state, city, trailSlug }, search] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
  ]);
  const rawState = safeDecodeURIComponent(state);
  const rawCity = safeDecodeURIComponent(city);
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
    return (
      <section>
        <h1>Trail not found</h1>
        <p>Invalid trail id (or id tail) in slug.</p>
        <p>
          <Link href={`/${encodeURIComponent(rawState)}/${encodeURIComponent(rawCity)}`}>
            Back to trails
          </Link>
        </p>
      </section>
    );
  }

  let data: Awaited<ReturnType<typeof getTrailSystemHeadsAndSegmentsForPage>>;
  try {
    data = await getTrailSystemHeadsAndSegmentsForPage(lookup);
  } catch (err) {
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

  const { system, trailHeads, trailSegments, trailHeadSelection } = data;

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
    return (
      <section>
        <h1>Trail not found</h1>
        <p>
          No <code>trailSystems</code> record found for{" "}
          <code>{lookup.kind === "id" ? "id" : "id tail"}</code>{" "}
          <code>{lookup.value}</code>.
        </p>
        <p>
          <Link href={`/${encodeURIComponent(rawState)}/${encodeURIComponent(rawCity)}`}>
            Back to trails
          </Link>
        </p>
      </section>
    );
  }

  const model = await timed("compute:buildTrailSystemPageModel (trail)", async () =>
    buildTrailSystemPageModel(system)
  );
  const debugParam = (search as Record<string, string | string[] | undefined>).debug;
  const debug =
    (typeof debugParam === "string" && debugParam === "1") ||
    process.env.NODE_ENV !== "production";
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
  const shadeTierLabel = (shadeProxyPercent != null || (system?.shadeClass != null && String(system.shadeClass).trim() !== "")) ? getShadeTierLabel(system?.shadeClass as string | undefined, shadeProxyPercent) : null;
  const crowdLabel = system?.crowdClass != null && typeof system.crowdClass === "string" ? conditionLabel(system.crowdClass, "—") : null;

  const effort = elevationProfile?.label ?? "Trail";
  const route = routeTypeLabel?.toLowerCase() ?? "route";
  const shade = getShadeShortLabel(system?.shadeClass as string | undefined, shadeProxyPercent);
  const heatNote = heatRisk ? "; avoid midday in summer." : ".";
  const computedQuickVerdict = `${effort} ${route} with ${shade}${heatNote}`.replace(/\s+\.$/, ".") || "See details below.";

  const secondarySignals: Array<{ icon: ReactNode; label: string; value: string }> = [];
  if (heatRisk) secondarySignals.push({ icon: <Sun size={14} aria-hidden />, label: "Heat", value: conditionLabel(heatRisk, "—") });
  if (shadeTierLabel) secondarySignals.push({ icon: <TreePine size={14} aria-hidden />, label: "Shade", value: shadeTierLabel });
  if (crowdLabel) secondarySignals.push({ icon: <Users size={14} aria-hidden />, label: "Crowd", value: crowdLabel });

  const matchedHeadsForEntry = trailHeads.filter((th) => matchesSystem(th, system));
  const primaryHead = matchedHeadsForEntry.find((th) => th.isPrimary) ?? matchedHeadsForEntry[0];
  const bestEntryName = primaryHead?.googleCanonicalName ?? primaryHead?.name ?? null;
  const bestEntryUrl = primaryHead?.googleMapsUrl ?? "#planning";

  const winterClass = (system?.winterClass as string | null | undefined)?.trim().toLowerCase();
  const winterNote = winterClass === "high" || winterClass === "medium";
  const litKnownSamplesValue =
    typeof system?.litKnownSamples === "number" && Number.isFinite(system.litKnownSamples)
      ? system.litKnownSamples
      : null;
  const litYesSamplesValue =
    typeof system?.litYesSamples === "number" && Number.isFinite(system.litYesSamples)
      ? system.litYesSamples
      : null;
  const litPercentKnownValue =
    typeof system?.litPercentKnown === "number" && Number.isFinite(system.litPercentKnown)
      ? system.litPercentKnown
      : null;
  const totalSampleCountValue =
    typeof system?.totalSampleCount === "number" && Number.isFinite(system.totalSampleCount)
      ? system.totalSampleCount
      : null;
  const hasLightingReported =
    (litKnownSamplesValue != null && litKnownSamplesValue > 0) ||
    (totalSampleCountValue != null &&
      totalSampleCountValue > 0 &&
      (litYesSamplesValue != null || litPercentKnownValue != null));
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

  return (
    <div style={{ width: "100%" }}>
      <CollapsibleSectionHashOpener />
      <p style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
        <Link href={`/${encodeURIComponent(rawState)}/${encodeURIComponent(rawCity)}`} style={{ color: "#64748b", textDecoration: "none" }}>
          ← Back to trails
        </Link>
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.125rem" }}>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", margin: 0, lineHeight: 1.3 }}>
          {model.identity.name || "Trail system"}
        </h1>
        {hasCertifiedPolicy && (
          <span className="certified-badge-by-title" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }} title="Certified dog policy">
            <Medal size={32} aria-hidden style={{ flexShrink: 0, color: "#b45309" }} />
            <span className="certified-badge-by-title-label">Certified dog policy</span>
          </span>
        )}
      </div>
      {headerMeta ? <p style={{ marginTop: "0.5rem", fontSize: "0.9375rem", color: "#64748b" }}>{headerMeta}</p> : null}

      <p style={{ marginTop: "0.75rem", fontSize: "1.125rem", fontWeight: 500, color: "#1e293b", maxWidth: "48rem", lineHeight: 1.4 }}>
        {seoText(seo?.sections?.intro?.a) ?? computedQuickVerdict}
      </p>

      {/* Hero stat strip */}
      {(() => {
        const leashRaw = system?.leashPolicy != null ? String(system.leashPolicy).trim() : "";
        const dogsRaw = system?.dogsAllowed != null ? String(system.dogsAllowed).trim() : "";
        const isOffLeash = /off[- ]?leash|leash[- ]?optional/i.test(leashRaw);
        const isOnLeash = /on[- ]?leash|required/i.test(leashRaw);
        const leashColor = isOffLeash ? "#15803d" : isOnLeash ? "#d97706" : "#64748b";
        const leashBg = isOffLeash ? "#dcfce7" : isOnLeash ? "#fef3c7" : "#f1f5f9";
        const dogsOk = /yes|allowed/i.test(dogsRaw);
        const dogsBanned = /no|not allowed|prohibited/i.test(dogsRaw);
        const dogsColor = dogsOk ? "#15803d" : dogsBanned ? "#dc2626" : "#64748b";
        const dogsBg = dogsOk ? "#dcfce7" : dogsBanned ? "#fee2e2" : "#f1f5f9";

        const stats = [
          ...(headerDistance ? [{
            icon: <DistanceIcon size={20} />,
            label: "Distance",
            value: headerDistance,
            bg: "#f1f5f9",
            color: "#0f172a",
          }] : []),
          ...(elevationProfile ? [{
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 3l4 8 5-5 5 15H2L8 3z" />
              </svg>
            ),
            label: "Effort",
            value: elevationProfile.label,
            bg: "#f1f5f9",
            color: "#0f172a",
          }] : []),
          ...(dogsRaw ? [{
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <ellipse cx="6.5" cy="3.5" rx="1.5" ry="2" />
                <ellipse cx="11" cy="2.5" rx="1.5" ry="2" />
                <ellipse cx="15.5" cy="3.5" rx="1.5" ry="2" />
                <ellipse cx="19" cy="7" rx="1.5" ry="2" />
                <path d="M12 8c-3.5 0-7 2.5-7 6.5 0 2.5 1.5 5 4 5.5.8.2 2 .5 3 .5s2.2-.3 3-.5c2.5-.5 4-3 4-5.5C19 10.5 15.5 8 12 8z" />
              </svg>
            ),
            label: "Dogs",
            value: dogsRaw.charAt(0).toUpperCase() + dogsRaw.slice(1).toLowerCase(),
            bg: dogsBg,
            color: dogsColor,
          }] : []),
          ...(leashRaw ? [{
            icon: <LeashIcon size={20} />,
            label: "Leash",
            value: leashRaw.charAt(0).toUpperCase() + leashRaw.slice(1).toLowerCase(),
            bg: leashBg,
            color: leashColor,
          }] : []),
        ];

        if (stats.length === 0) return null;

        return (
          <div style={{
            marginTop: "1rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.625rem",
          }}>
            {stats.map((s, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                backgroundColor: s.bg,
                borderRadius: "0.625rem",
                padding: "0.5rem 0.875rem",
                border: "1px solid #e2e8f0",
              }}>
                <span style={{ color: s.color, display: "flex", alignItems: "center" }} aria-hidden>
                  {s.icon}
                </span>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {secondarySignals.length > 0 && (
        <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {secondarySignals.map((sig, i) => (
            <span
              key={i}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                borderRadius: "9999px",
                backgroundColor: "#f1f5f9",
                color: "#334155",
                padding: "0.375rem 0.75rem",
                fontSize: "0.75rem",
                fontWeight: 500,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", color: "#475569" }}>{sig.icon}</span>
              <span>{sig.label}:</span>
              <span>{sig.value}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: "1rem", fontSize: "0.875rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Navigation size={16} aria-hidden style={{ flexShrink: 0 }} />
        <span>Best entry:</span>
        {bestEntryName ? (
          <a href={bestEntryUrl} target={bestEntryUrl.startsWith("http") ? "_blank" : undefined} rel={bestEntryUrl.startsWith("http") ? "noreferrer" : undefined} style={{ textDecoration: "underline", color: "#475569" }}>
            {bestEntryName}
          </a>
        ) : (
          <span>See trailheads below</span>
        )}
      </div>

      <div style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: "#475569", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Calendar size={16} aria-hidden style={{ flexShrink: 0 }} />
        <span>{computedSeasonGuidance}</span>
      </div>

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

      <TrailSegmentsMapClient
        segments={trailSegments}
        trailHeads={trailHeads}
        trailHeadSelection={trailHeadSelection}
        amenityPoints={amenityPoints}
        amenityCoordinatesAvailable={hasCoordinateBearingAmenities}
        parkingPoints={parkingPoints}
        highlights={highlights}
        vets={safetyVets}
      />

      <DogPolicyBanner
        dogsAllowed={typeof system?.dogsAllowed === "string" ? system.dogsAllowed : null}
        leashPolicy={typeof system?.leashPolicy === "string" ? system.leashPolicy : null}
        leashDetails={(system as { leashDetails?: string })?.leashDetails ?? null}
        policySourceUrl={typeof system?.policySourceUrl === "string" ? system.policySourceUrl : null}
        policySourceTitle={(system as { policySourceTitle?: string })?.policySourceTitle ?? null}
      />

      <InsightCard
        id="trailheads"
        title="Trailheads"
        variant="planning"
        layout="wide"
        childrenInline
      >
        <TrailheadsSection system={system} trailHeads={trailHeads} />
      </InsightCard>

      <TrailDashboard>
        <InsightCard
          id="dog-fit"
          title="Dog Fit"
          variant="dog"
          layout="wide"
          childrenInline
        >
          <DogTypesSection system={system} />
        </InsightCard>

        {seoText(seo?.sections?.difficultyElevation?.a) && (
          <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>
            {seo!.sections.difficultyElevation!.a}
          </p>
        )}
        <ElevationWidthSection
          elevationProfile={elevationProfile}
          elevationProfilePoints={Array.isArray(system?.elevationProfile) ? system.elevationProfile as { d: number; e: number }[] : null}
          totalGainFt={totalGainFt}
          maxFt={maxFt}
          minFt={minFt}
          lengthMiles={distanceMiles}
          gradP50={system?.gradeP50 as number | null}
          gradP90={system?.gradeP90 as number | null}
          widthSummary={system?.widthSummary as { min?: number; max?: number; p50?: number; p90?: number; unknownPct?: number } | null}
        />

        <InsightCard
          id="surface"
          title="Surface"
          variant="conditions"
          layout="wide"
          childrenInline
        >
          {seoText(seo?.sections?.surfacePaws?.a) && (
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>
              {seo!.sections.surfacePaws!.a}
            </p>
          )}
          <SurfaceSection
            surfaceSummary={system?.surfaceSummary}
            surfaceBreakdown={system?.surfaceBreakdown}
            roughnessRisk={system?.roughnessRisk as string | undefined}
            roughnessRiskScore={(system as any)?.roughnessRiskScore as number | undefined}
            roughnessRiskKnownSamples={(system as any)?.roughnessRiskKnownSamples as number | undefined}
            surfaceProfilePoints={Array.isArray(system?.surfaceProfile) ? system.surfaceProfile as { d: number; surface: string }[] : null}
            lengthMilesTotal={system?.lengthMilesTotal as number | undefined}
          />
        </InsightCard>

        <InsightCard
          id="shade"
          title="Shade"
          variant="conditions"
          layout="wide"
          childrenInline
        >
          {seoText(seo?.sections?.shadeHeat?.a) && (
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>
              {seo!.sections.shadeHeat!.a}
            </p>
          )}
          <ShadeSection
            shadeClass={system?.shadeClass as string | undefined}
            shadeLastComputedAt={system?.shadeLastComputedAt as number | string | undefined}
            shadeProxyPercent={system?.shadeProxyPercent as number | undefined}
            shadeProxyScore={system?.shadeProxyScore as number | undefined}
            shadeSources={system?.shadeSources}
            shadeProfilePoints={Array.isArray(system?.shadeProfile) ? system.shadeProfile as { d: number; shade: number }[] : null}
            lengthMilesTotal={system?.lengthMilesTotal as number | undefined}
          />
        </InsightCard>

        <InsightCard
          id="water"
          title="Water"
          variant="conditions"
          layout="wide"
          childrenInline
        >
          {seoText(seo?.sections?.water?.a) && (
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>
              {seo!.sections.water!.a}
            </p>
          )}
          <WaterSection
            waterNearScore={system?.waterNearScore as number | undefined}
            waterNearPercent={system?.waterNearPercent as number | undefined}
            waterTypesNearby={system?.waterTypesNearby as string[] | string | undefined}
            swimLikely={system?.swimLikely as boolean | undefined}
            waterProfilePoints={Array.isArray(system?.waterProfile) ? system.waterProfile as { d: number; type: string }[] : null}
            lengthMilesTotal={system?.lengthMilesTotal as number | undefined}
          />
        </InsightCard>

        <InsightCard
          id="conditions"
          title="Conditions"
          variant="conditions"
          layout="wide"
          childrenInline
          headline={
            shadeProxyPercent != null && shadeProxyPercent < 0.5
              ? "Most sections exposed; bring water."
              : "Mud, lighting, winter, and after-dark details below."
          }
          summaryContent={
            <MetricGrid
              wide
              items={[
                { icon: TrailIcons.lighting, label: "After Dark", value: afterDarkSummaryLabel(system?.litPercentKnown as number, system?.litYesSamples as number, system?.totalSampleCount as number), tone: "neutral" },
                { icon: TrailIcons.crowd, label: "Crowd", value: typeof system?.crowdClass === "string" ? conditionLabel(system.crowdClass, "—") : "—", tone: "neutral" },
                { icon: TrailIcons.water, label: "Swim", value: swimSummaryLabel(system?.swimLikely as boolean | null | undefined, system?.swimAccessPointsCount as number | null | undefined), tone: "neutral" },
                { icon: TrailIcons.mud, label: "Mud", value: conditionLabel(system?.mudRisk as string, "—"), tone: "neutral" },
                { icon: TrailIcons.winter, label: "Winter", value: conditionLabel(system?.winterClass as string, "Unknown"), tone: "neutral" },
                ...(hasLightingReported
                  ? [{
                      icon: TrailIcons.lighting,
                      label: "Lighting",
                      value: lightingSummaryLabel(system?.litPercentKnown as number, system?.litYesSamples as number, system?.totalSampleCount as number),
                      tone: "neutral" as const,
                    }]
                  : []),
              ]}
            />
          }
        >
          {seoText(seo?.sections?.crowd?.a) && (
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>
              {seo!.sections.crowd!.a}
            </p>
          )}
          <AfterDarkSection
            litKnownSamples={system?.litKnownSamples as number | undefined}
            litYesSamples={system?.litYesSamples as number | undefined}
            litPercentKnown={system?.litPercentKnown as number | undefined}
            totalSampleCount={system?.totalSampleCount as number | undefined}
            accessRules={system?.accessRules}
            surfaceSummary={system?.surfaceSummary}
            surfaceBreakdown={system?.surfaceBreakdown}
            hazardPoints={system?.hazardPoints}
            waterNearPercent={system?.waterNearPercent as number | undefined}
            swimLikely={system?.swimLikely as boolean | string | undefined}
          />
          <CrowdSection
            crowdClass={system?.crowdClass as string | null}
            crowdLastComputedAt={system?.crowdLastComputedAt as number | string | null}
            crowdProxyScore={system?.crowdProxyScore as number | null}
            crowdReasons={system?.crowdReasons as string | string[] | null | undefined}
            crowdSignals={system?.crowdSignals as Record<string, unknown> | null | undefined}
          />
          <SwimSection
            swimLikely={system?.swimLikely as boolean | null}
            swimAccessPointsCount={system?.swimAccessPointsCount as number | null}
            swimAccessPointsByType={system?.swimAccessPointsByType as Record<string, number> | null}
            swimAccessPoints={system?.swimAccessPoints as any[] | null}
          />
          <MudRiskSection
            mudLastComputedAt={system?.mudLastComputedAt as number | string | undefined}
            mudRisk={system?.mudRisk as string | undefined}
            mudRiskReason={system?.mudRiskReason as string | undefined}
            mudRiskScore={system?.mudRiskScore as number | undefined}
            mudRiskKnownSamples={(system as any)?.mudRiskKnownSamples as number | undefined}
            mudRiskReasons={(system as any)?.mudRiskReasons as string[] | string | undefined}
            surfaceSummary={system?.surfaceSummary}
            surfaceBreakdown={system?.surfaceBreakdown}
            waterNearPercent={system?.waterNearPercent as number | undefined}
          />
          <WinterSection
            winterClass={system?.winterClass as string | null}
            winterScore={system?.winterScore as number | null}
            winterLikelyMaintained={system?.winterLikelyMaintained as boolean | null}
            winterReasons={system?.winterReasons as string[] | string | null}
            winterLastComputedAt={system?.winterLastComputedAt as number | string | null}
          />
          {hasLightingReported && (
            <LightingSection
              litKnownSamples={system?.litKnownSamples as number | undefined}
              litYesSamples={system?.litYesSamples as number | undefined}
              litPercentKnown={system?.litPercentKnown as number | undefined}
              totalSampleCount={system?.totalSampleCount as number | undefined}
            />
          )}
        </InsightCard>

        <InsightCard
          id="planning"
          title="Planning & Entry"
          variant="planning"
          layout="wide"
          defaultOpen
        >
          {seoText(seo?.sections?.amenities?.a) && (
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>
              {seo!.sections.amenities!.a}
            </p>
          )}
          <AmenitiesGrid amenitiesCounts={system?.amenitiesCounts} />
          <RouteAmenitiesSection
            trailheadPOIs={system?.trailheadPOIs}
            amenityPoints={Array.isArray(system?.amenityPoints) ? system.amenityPoints as { d: number; kind: string }[] : null}
            lengthMilesTotal={system?.lengthMilesTotal as number | undefined}
          />
          <ParkingSection
            parkingCapacityEstimate={system?.parkingCapacityEstimate as number | null}
            parkingCount={system?.parkingCount as number | null}
            parkingFeeKnown={system?.parkingFeeKnown as boolean | null}
          />
        </InsightCard>

        <InsightCard
          id="highlights"
          title="Highlights"
          variant="highlights"
          layout="wide"
          childrenInline
          dividerBeforeDetails
          defaultOpen
          headline={
            (() => {
              const list = normalizeHighlights(system?.highlights as any);
              return list.length === 0 ? "No highlights mapped yet." : `${list.length} highlight${list.length === 1 ? "" : "s"} on or near the trail.`;
            })()
          }
        >
          {Array.isArray(system?.highlightPoints) && (system.highlightPoints as any[]).length >= 1 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase" as const,
                color: "#6b7280",
                marginBottom: "0.35rem",
              }}>
                Highlights along the trail
              </div>
              <HighlightProfileChart
                points={system.highlightPoints as { d: number; kind: string; name: string | null; distM?: number }[]}
                totalMiles={system?.lengthMilesTotal as number | undefined}
              />
            </div>
          )}
          <HikeHighlightsSection highlightsRaw={system?.highlights as any} />
        </InsightCard>

      </TrailDashboard>

      {seoText(seo?.sections?.safetyServices?.a) && (
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.9rem", color: "#374151", lineHeight: 1.6 }}>
          {seo!.sections.safetyServices!.a}
        </p>
      )}
      <RulesAndSafetySection
        system={system as Record<string, unknown> | null}
        city={model.identity.city}
        state={model.identity.state}
      />

      {(() => {
        const faqItems = (seo?.faqs && seo.faqs.length > 0)
          ? seo.faqs
          : Array.isArray(system?.faqs) && (system.faqs as unknown[]).length > 0
            ? system.faqs as any[]
            : null;
        if (!faqItems) return null;
        return (
          <InsightCard
            id="faqs"
            title="Frequently Asked Questions"
            variant="dog"
            headline="Common questions about dogs on this trail."
            childrenInline
          >
            <FaqSection faqs={faqItems} />
          </InsightCard>
        );
      })()}
    </div>
  );
}
