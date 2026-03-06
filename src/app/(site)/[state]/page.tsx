// Data source: InstantDB `trailSystems` entity.
// Expected fields: `state` (string, optional), `city` (string, optional), `slug` (string), `name` (string).

import Link from "next/link";
import type { Metadata } from "next";
import { safeDecodeURIComponent, slugifyCity } from "@/lib/slug";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { timed, logPayloadIfEnabled } from "@/lib/perf";
import { normalizeState } from "@/lib/trailSlug";

type TrailSystemRecord = Record<string, any>;

const DB_LABEL = "db:trailSystems list (state)";

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

export default async function StatePage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state } = await params;
  const rawState = safeDecodeURIComponent(state);
  const stateLabel = normalizeState(rawState);

  let systems: TrailSystemRecord[] = [];
  const db = await getAdminDbSafe();
  try {
    if (db) systems = await loadTrailSystems();
  } catch {
    // Keep rendering even if data fails.
  }

  const normalizedTargetState = stateLabel.toLowerCase();

  const { systemsInState, cities } = await timed(
    "compute:filter+cityMap+sort (state)",
    async () => {
      const systemsInState = systems.filter((system) => {
        const systemState = String(system.state ?? "").trim();
        if (!systemState) return normalizedTargetState === "unknown";
        return systemState.toLowerCase() === normalizedTargetState;
      });
      const cityMap = new Map<
        string,
        { slug: string; label: string; count: number }
      >();
      for (const system of systemsInState) {
        const length = typeof system.lengthMilesTotal === "number" ? system.lengthMilesTotal : 0;
        if (length <= 1) continue;
        const rawCity = String(system.city ?? "").trim();
        const label = rawCity || "Unknown city";
        const slug = slugifyCity(label);
        const entry = cityMap.get(slug) ?? { slug, label, count: 0 };
        entry.count += 1;
        cityMap.set(slug, entry);
      }
      const cities = Array.from(cityMap.values()).sort((a, b) =>
        a.label.localeCompare(b.label)
      );
      return { systemsInState, cities };
    }
  );

  const hasCities = cities.length > 0;

  if (!hasCities) {
    return (
      <section>
        <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
          No cities found for {stateLabel || "Unknown state"}
        </h1>
        {!db && <p style={{ marginBottom: "0.75rem" }}>{instantDbMissingEnvMessage()}</p>}
        <p style={{ marginBottom: "0.75rem" }}>
          We couldn&apos;t find any trail systems for this state.
        </p>
        <p>
          <Link href="/">Go back home</Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>
        Cities in {stateLabel || "Unknown state"}
      </h1>
      {!db && <p style={{ marginBottom: "1rem" }}>{instantDbMissingEnvMessage()}</p>}
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(12rem, 1fr))",
          gap: "0.75rem",
        }}
      >
        {cities.map((city) => (
          <li key={city.slug}>
            <Link
              href={`/${encodeURIComponent(stateLabel)}/${encodeURIComponent(
                city.slug
              )}`}
              style={{
                display: "block",
                padding: "0.75rem 0.9rem",
                borderRadius: "0.75rem",
                border: "1px solid #e5e7eb",
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: "0.15rem",
                }}
              >
                {city.label}
              </div>
              <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                {city.count} trail system
                {city.count === 1 ? "" : "s"}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: "1rem" }}>
        <Link href="/">Back to all states</Link>
      </p>
    </section>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state } = await params;
  const rawState = safeDecodeURIComponent(state);
  const stateLabel = normalizeState(rawState);

  return {
    title: `Dog-Friendly Hiking Trails in ${stateLabel}`,
    description:
      "Browse dog-friendly trails by city with quick info on leash policy, shade, swim access, and paw-safety surface notes.",
  };
}

