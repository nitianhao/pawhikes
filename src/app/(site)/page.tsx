import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { slugifyCity } from "@/lib/slug";
import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import { DogNeedShortcuts } from "@/components/home/DogNeedShortcuts";
import { FeaturedTrails } from "@/components/home/FeaturedTrails";
import { HomeSearchForm } from "@/components/home/HomeSearchForm";
import type { TrailCardData } from "@/components/home/TrailCard";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { JsonLd } from "@/components/seo/JsonLd";
import { collectionPageSchema, websiteSchema } from "@/lib/seo/schema";
import { homeHeroSupport } from "@/lib/seo/contentTemplates";
import { homeDescription, homeTitle } from "@/lib/seo/ctr";
import { pickDirectoryOgImage } from "@/lib/seo/media";
import { getTrailSystemsIndex, type TrailSystemsIndexRecord } from "@/lib/data/trailSystemsIndex";

type TrailSystemRecord = TrailSystemsIndexRecord;

type NormalizedTrail = {
  id: string;
  name: string;
  stateCode: string;
  cityLabel: string;
  citySlug: string;
  trailSlug: string;
  lengthMiles: number | null;
  leashPolicy: string | null;
  shadePercent: number | null;
  waterPercent: number | null;
  surfacePrimary: string | null;
  elevationGainFt: number | null;
};

type CoverageRow = {
  key: string;
  stateCode: string;
  stateLabel: string;
  stateHref: string;
  cityLabel: string;
  citySlug: string;
  cityHref: string;
  trailCount: number;
};

type StateSummary = {
  code: string;
  label: string;
  cityCount: number;
  trailCount: number;
};

const HOME_DESCRIPTION =
  "Discover dog-friendly hiking trails with practical details on leash policy, shade, water access, surfaces, and trail logistics.";
export const revalidate = 1800;

const sectionCard: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  background: "#fff",
};

async function loadTrailSystems(): Promise<TrailSystemRecord[]> {
  return getTrailSystemsIndex();
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length > 0 ? v : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractSurfacePrimary(surfaceSummary: unknown): string | null {
  if (!surfaceSummary || typeof surfaceSummary !== "object" || Array.isArray(surfaceSummary)) {
    return null;
  }
  const summary = surfaceSummary as { dominant?: unknown };
  if (typeof summary.dominant === "string" && summary.dominant.trim().length) {
    return summary.dominant.trim();
  }
  return null;
}

function trailLinkParts(system: TrailSystemRecord): {
  stateCode: string;
  citySlug: string;
  trailSlug: string;
  stateLabel: string;
  cityLabel: string;
} {
  const rawState = String(system.state ?? "").trim();
  const stateLabel = rawState || "Unknown state";
  const stateCode = normalizeState(rawState || "unknown");
  const cityLabel = String(system.city ?? "").trim() || "Unknown city";
  const citySlug = slugifyCity(cityLabel);
  const trailSlug = canonicalTrailSlug({
    name: system.name ?? null,
    id: system.id ?? null,
    extSystemRef: system.extSystemRef ?? null,
  });
  return { stateCode, citySlug, trailSlug, stateLabel, cityLabel };
}

function normalizeTrail(system: TrailSystemRecord): NormalizedTrail | null {
  const id = String(system.id ?? "").trim();
  const name = String(system.name ?? "").trim();
  if (!id || !name) return null;

  const { stateCode, citySlug, trailSlug, stateLabel, cityLabel } = trailLinkParts(system);

  return {
    id,
    name,
    stateCode,
    cityLabel,
    citySlug,
    trailSlug,
    lengthMiles: asNumber(system.lengthMilesTotal),
    leashPolicy: asText(system.leashPolicy),
    shadePercent: asNumber(system.shadeProxyPercent),
    waterPercent: asNumber(system.waterNearPercent),
    surfacePrimary: extractSurfacePrimary(system.surfaceSummary),
    elevationGainFt: asNumber(system.elevationGainFt),
  };
}

function buildCoverageRows(systems: TrailSystemRecord[]): CoverageRow[] {
  const map = new Map<string, CoverageRow>();
  for (const system of systems) {
    const length = asNumber(system.lengthMilesTotal) ?? 0;
    if (length <= 1) continue;
    const { stateCode, stateLabel, cityLabel, citySlug } = trailLinkParts(system);
    const key = `${stateCode}::${citySlug}`;
    const existing = map.get(key);
    if (existing) {
      existing.trailCount += 1;
      continue;
    }
    map.set(key, {
      key,
      stateCode,
      stateLabel,
      stateHref: `/${encodeURIComponent(stateCode)}`,
      cityLabel,
      citySlug,
      cityHref: `/${encodeURIComponent(stateCode)}/${encodeURIComponent(citySlug)}`,
      trailCount: 1,
    });
  }
  return Array.from(map.values()).sort((a, b) => {
    const byState = a.stateLabel.localeCompare(b.stateLabel);
    if (byState !== 0) return byState;
    return a.cityLabel.localeCompare(b.cityLabel);
  });
}

function buildStateSummaries(rows: CoverageRow[]): StateSummary[] {
  const map = new Map<string, StateSummary>();
  for (const row of rows) {
    const existing = map.get(row.stateCode);
    if (existing) {
      existing.cityCount += 1;
      existing.trailCount += row.trailCount;
      continue;
    }
    map.set(row.stateCode, {
      code: row.stateCode,
      label: row.stateLabel,
      cityCount: 1,
      trailCount: row.trailCount,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function coverageStatus(rows: CoverageRow[], totalTrails: number): string {
  if (rows.length === 0) return "Coverage update in progress as new regions are onboarded.";
  if (rows.length === 1) {
    const only = rows[0];
    return `Currently covering ${only.cityLabel}, ${only.stateCode} (${totalTrails} trail${totalTrails === 1 ? "" : "s"}), with expansion underway.`;
  }
  return `Now covering ${rows.length} cities across ${new Set(rows.map((r) => r.stateCode)).size} state${rows.length === 1 ? "" : "s"}, with more regions being added.`;
}

function topCoverageSentence(rows: CoverageRow[]): string | null {
  if (rows.length === 0) return null;
  const sample = rows
    .slice(0, 3)
    .map((row) => `${row.cityLabel}, ${row.stateCode}`)
    .join(" • ");
  return sample ? `Current coverage includes ${sample}.` : null;
}

export default async function SiteHomePage() {
  let systems: TrailSystemRecord[] = [];
  const db = await getAdminDbSafe();

  try {
    if (db) systems = await loadTrailSystems();
  } catch {
    // Keep rendering even if data fails to load.
  }

  const normalizedTrails = systems
    .map(normalizeTrail)
    .filter((trail): trail is NormalizedTrail => Boolean(trail));

  const coverageRows = buildCoverageRows(systems);
  const stateSummaries = buildStateSummaries(coverageRows);
  const totalTrails = coverageRows.reduce((sum, row) => sum + row.trailCount, 0);
  const totalCities = coverageRows.length;
  const totalStates = stateSummaries.length;

  const featuredTrails: TrailCardData[] = normalizedTrails.slice(0, 6).map((trail) => ({
    id: trail.id,
    name: trail.name,
    cityLabel: trail.cityLabel,
    stateCode: trail.stateCode,
    href: `/${encodeURIComponent(trail.stateCode)}/${encodeURIComponent(trail.citySlug)}/${encodeURIComponent(trail.trailSlug)}`,
    lengthMiles: trail.lengthMiles,
    elevationGainFt: trail.elevationGainFt,
    leashPolicy: trail.leashPolicy,
    shadePercent: trail.shadePercent,
    waterPercent: trail.waterPercent,
    surfacePrimary: trail.surfacePrimary,
  }));

  const hasDb = Boolean(db);
  const heroSupport = homeHeroSupport({ totalStates, totalCities, totalTrails });
  const coverageLine = topCoverageSentence(coverageRows);

  return (
    <section style={{ display: "grid", gap: "1.75rem" }}>
      <JsonLd
        id="website-schema"
        data={[
          websiteSchema(),
          collectionPageSchema({
            name: "Dog-Friendly Hiking Trails Directory",
            description: HOME_DESCRIPTION,
            path: "/",
          }),
        ]}
      />
      <section
        style={{
          ...sectionCard,
          padding: "1.5rem 1.5rem 1.25rem",
          background: "linear-gradient(180deg, #f0fdf4 0%, #f7fee7 58%, #ffffff 100%)",
        }}
      >
        <h1
          style={{
            fontSize: "clamp(1.5rem, 4vw, 2rem)",
            lineHeight: 1.15,
            marginBottom: "0.4rem",
            color: "#111827",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Dog-friendly hiking trails by city and state
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem", marginBottom: "1.1rem", lineHeight: 1.5 }}>
          {heroSupport}
          {" "}
          Browse by state, city, and trail to compare dog access, leash rules, shade, water, surfaces, and trailhead access before you go.
        </p>

        <Suspense>
          <HomeSearchForm />
        </Suspense>

        <div style={{ marginTop: "0.875rem", display: "flex", flexWrap: "wrap", gap: "0.4rem", alignItems: "center" }}>
          <MiniStat value={String(totalStates)} label={totalStates === 1 ? "state" : "states"} />
          <MiniStat value={String(totalCities)} label={totalCities === 1 ? "city" : "cities"} />
          <MiniStat value={String(totalTrails)} label={totalTrails === 1 ? "trail" : "trails"} />
          {coverageRows.length > 0 && (
            <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>· expanding</span>
          )}
        </div>
      </section>

      <DogNeedShortcuts />
      <FeaturedTrails trails={featuredTrails} />

      <section id="coverage" style={{ ...sectionCard, padding: "1.25rem" }}>
        <div style={{ marginBottom: "0.875rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.25rem", color: "#111827" }}>
            Browse Dog-Friendly Trails by State and City
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            Use these direct links to open city-level dog hiking trail directories.
          </p>
          {coverageLine && (
            <p style={{ color: "#6b7280", fontSize: "0.8rem", marginTop: "0.3rem" }}>
              {coverageLine}
            </p>
          )}
        </div>

        {!hasDb && (
          <p style={{ marginBottom: "0.8rem", color: "#374151" }}>
            {instantDbMissingEnvMessage()}
          </p>
        )}

        {coverageRows.length === 0 ? (
          <p style={{ color: "#4b5563" }}>
            No trail systems found yet. Add `trailSystems` records to populate coverage.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "34rem" }}>
              <thead>
                <tr>
                  <Th>State</Th>
                  <Th>City</Th>
                  <Th>Trail count</Th>
                  <Th>Open</Th>
                </tr>
              </thead>
              <tbody>
                {coverageRows.map((row) => (
                  <tr key={row.key} className="home-coverage-row">
                    <Td>
                      <Link href={row.stateHref} style={{ color: "#166534", textDecoration: "none", fontWeight: 600 }}>
                        {row.stateLabel} dog-friendly trails directory
                      </Link>
                    </Td>
                    <Td>
                      <Link href={row.cityHref} style={{ color: "#0f172a", textDecoration: "none", fontWeight: 600 }}>
                        Dog hikes in {row.cityLabel}
                      </Link>
                    </Td>
                    <Td>{row.trailCount}</Td>
                    <Td>
                      <Link href={row.cityHref} style={{ color: "#166534", textDecoration: "none", fontWeight: 500 }}>
                        See {row.cityLabel} dog-friendly trails
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section id="why-paw-hikes" style={{ ...sectionCard, padding: "1.25rem" }}>
        <div style={{ marginBottom: "0.875rem" }}>
          <h2 style={{ fontSize: "1.2rem", marginBottom: "0.25rem", color: "#111827" }}>
            Why This Dog Hiking Directory Is Different
          </h2>
          <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
            Built for people comparing places to hike with dogs, not generic trail listings.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(13rem, 1fr))",
            gap: "0.7rem",
          }}
        >
          <ValueCard
            title="Verified dog access context"
            body="Dog access and leash policy are visible in plain English so you can quickly screen trails before a drive."
          />
          <ValueCard
            title="Comfort and condition signals"
            body="Shade, water proximity, heat risk, and surface cues help match trail conditions to your dog's comfort."
          />
          <ValueCard
            title="Dog-type suitability"
            body="Structured suitability signals help compare routes for senior dogs, small dogs, and high-energy dogs."
          />
          <ValueCard
            title="Trailhead logistics"
            body="Trailhead and parking details reduce guesswork when planning dog hikes near you."
          />
        </div>
      </section>

      <section style={{ ...sectionCard, padding: "1.25rem", background: "#f8fafc" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.45rem", color: "#111827" }}>
          Coverage Quality
        </h2>
        <p style={{ color: "#475569", lineHeight: 1.6 }}>
          Paw Hikes expands city by city with structured dog-hiking records, including dog policy, shade, water, and surface context. Data is best-effort and refined as coverage grows.
        </p>
        <p style={{ marginTop: "0.55rem", color: "#475569", lineHeight: 1.6 }}>
          Always confirm local dog regulations and live trail conditions before each hike.
        </p>
      </section>
    </section>
  );
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <span
      style={{
        fontSize: "0.78rem",
        color: "#6b7280",
      }}
    >
      <span style={{ fontWeight: 600, color: "#374151" }}>{value}</span>
      {" "}{label}
    </span>
  );
}

function ValueCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="home-value-card">
      <h3 style={{ fontSize: "0.95rem", marginBottom: "0.3rem", color: "#111827" }}>{title}</h3>
      <p style={{ fontSize: "0.85rem", color: "#6b7280", lineHeight: 1.5 }}>{body}</p>
    </article>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: "left",
        fontSize: "0.8rem",
        color: "#64748b",
        fontWeight: 600,
        padding: "0.6rem 0.5rem",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{ padding: "0.65rem 0.5rem", fontSize: "0.9rem", color: "#0f172a" }}>
      {children}
    </td>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  let systems: TrailSystemRecord[] = [];
  try {
    systems = await loadTrailSystems();
  } catch {
    // Keep metadata stable if data cannot load.
  }
  const coverageRows = buildCoverageRows(systems);
  const stateSummaries = buildStateSummaries(coverageRows);
  const totalTrails = coverageRows.reduce((sum, row) => sum + row.trailCount, 0);
  const totalCities = coverageRows.length;
  const totalStates = stateSummaries.length;
  const ogImages = pickDirectoryOgImage({
    systems,
    pageLabel: "Dog-friendly hiking trails by city and state",
  });

  return buildPageMetadata({
    title: homeTitle(),
    description: homeDescription({
      stateCount: totalStates,
      cityCount: totalCities,
      trailCount: totalTrails,
    }),
    pathname: "/",
    index: true,
    ogImages,
  });
}
