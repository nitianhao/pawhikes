// Data source: InstantDB `trailSystems` entity.
// Expected fields: `state` (string, optional), `slug` (string), `name` (string), `city` (string, optional).

import Link from "next/link";
import type { Metadata } from "next";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { timed, logPayloadIfEnabled } from "@/lib/perf";
import { normalizeState } from "@/lib/trailSlug";

type TrailSystemRecord = Record<string, any>;

const DB_LABEL = "db:trailSystems list (home)";

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

export default async function SiteHomePage() {
  let systems: TrailSystemRecord[] = [];
  const db = await getAdminDbSafe();

  try {
    if (db) systems = await loadTrailSystems();
  } catch {
    // If data fails to load, show a simple message but keep the page rendering.
  }

  const states = await timed("compute:stateMap+sort (home)", async () => {
    const stateMap = new Map<
      string,
      {
        code: string;
        label: string;
        count: number;
      }
    >();
    for (const system of systems) {
      const rawState = String(system.state ?? "").trim();
      const code = rawState || "unknown";
      const label = rawState || "Unknown state";
      const entry = stateMap.get(code) ?? { code, label, count: 0 };
      entry.count += 1;
      stateMap.set(code, entry);
    }
    return Array.from(stateMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  });

  const hasStates = states.length > 0;
  const hasDb = Boolean(db);

  return (
    <section>
      <h1 style={{ fontSize: "1.6rem", marginBottom: "0.75rem" }}>
        Browse dog-friendly trails
      </h1>
      <p style={{ margin: "0 0 1.25rem 0", color: "#4b5563" }}>
        Start by choosing a state. We&apos;ll drill into cities and trails from
        there.
      </p>

      {!hasDb && (
        <p style={{ marginBottom: "1.25rem" }}>
          {instantDbMissingEnvMessage()}
        </p>
      )}

      {!hasStates && (
        <p>
          No trail systems found yet. Make sure your InstantDB has{" "}
          <code>trailSystems</code> records with a <code>state</code> field.
        </p>
      )}

      {hasStates && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(10rem, 1fr))",
            gap: "0.75rem",
          }}
        >
          {states.map((state) => (
            <li key={state.code}>
              <Link
                href={`/${encodeURIComponent(normalizeState(state.code))}`}
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
                  {state.label}
                </div>
                <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                  {state.count} trail system
                  {state.count === 1 ? "" : "s"}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "Dog-Friendly Hiking Trails",
    description:
      "Find dog-friendly hiking trails with quick intel on leash policy, shade, swim access, and paw-safety surface notes.",
  };
}

