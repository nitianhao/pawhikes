import Link from "next/link";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import { timed, logPayloadIfEnabled } from "@/lib/perf";
import { buildTrailSystemPageModel } from "@/lib/trailSystems/pageModel";
import { formatValue } from "@/lib/trailSystems/formatters";
import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";
import { slugifyCity } from "@/lib/slug";

type TrailSystemRecord = Record<string, any>;

function parseFirstString(v: string | string[] | undefined): string | null {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return null;
}

function parseLimit(v: string | string[] | undefined, fallback: number): number {
  const raw = parseFirstString(v);
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const int = Math.floor(n);
  if (int <= 0) return fallback;
  return Math.min(int, 2000);
}

async function loadTrailSystemsForCityState(args: {
  city: string;
  state: string;
  limit: number;
}): Promise<TrailSystemRecord[]> {
  const db = await getAdminDbSafe();
  if (!db) return [];

  const city = String(args.city ?? "").trim();
  const state = String(args.state ?? "").trim();
  const limit = args.limit;

  const labelFiltered = "db:trailSystems where city+state (debug)";
  const labelFallback = "db:trailSystems list fallback (debug)";
  try {
    const res = await timed(labelFiltered, () =>
      db.query({
        trailSystems: { $: { where: { city, state }, limit } },
      } as any)
    );
    logPayloadIfEnabled(labelFiltered, res);
    const systems = Array.isArray((res as any)?.trailSystems)
      ? (res as any).trailSystems
      : (res as any)?.trailSystems?.data ?? [];
    return Array.isArray(systems) ? systems : [];
  } catch {
    // ignore
  }

  try {
    const res = await timed(labelFallback, () =>
      db.query({ trailSystems: { $: { limit: 5000 } } })
    );
    logPayloadIfEnabled(labelFallback, res);
    const systems = Array.isArray((res as any)?.trailSystems)
      ? (res as any).trailSystems
      : (res as any)?.trailSystems?.data ?? [];
    const list: TrailSystemRecord[] = Array.isArray(systems) ? systems : [];
    const cityLow = city.toLowerCase();
    const stateLow = state.toLowerCase();
    return list
      .filter((s) => String(s?.city ?? "").trim().toLowerCase() === cityLow)
      .filter((s) => String(s?.state ?? "").trim().toLowerCase() === stateLow)
      .slice(0, limit);
  } catch {
    return [];
  }
}

function buildSystemHref(sys: TrailSystemRecord, fallbackCity: string, fallbackState: string): string {
  const state = normalizeState(String(sys?.state ?? fallbackState ?? ""));
  const citySlug = slugifyCity(String(sys?.city ?? fallbackCity ?? ""));
  const slug = canonicalTrailSlug({
    name: sys?.name ?? null,
    id: sys?.id ?? null,
    extSystemRef: sys?.extSystemRef ?? null,
  });
  return `/${encodeURIComponent(state)}/${encodeURIComponent(citySlug)}/${encodeURIComponent(slug)}`;
}

function glanceMap(items: Array<{ key: string; label: string; kind?: string; value: any }>) {
  const m = new Map<string, { key: string; label: string; kind?: string; value: any }>();
  for (const it of items) m.set(it.key, it);
  return m;
}

function displayFromItem(it: { kind?: string; value: any } | undefined, fallback = "—"): string {
  if (!it) return fallback;
  return formatValue(it).display || fallback;
}

export default async function DebugTrailSystemsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV === "production") {
    return (
      <section>
        <h1>TrailSystems Debug</h1>
        <p>Not available in production.</p>
      </section>
    );
  }

  const sp = (await (searchParams ?? Promise.resolve({}))) as Record<
    string,
    string | string[] | undefined
  >;

  const city = (parseFirstString(sp.city) ?? "Austin").trim() || "Austin";
  const state = (parseFirstString(sp.state) ?? "TX").trim() || "TX";
  const limit = parseLimit(sp.limit, 200);

  const db = await getAdminDbSafe();
  if (!db) {
    return (
      <section>
        <h1>TrailSystems Debug — {city}, {state}</h1>
        <p>{instantDbMissingEnvMessage()}</p>
      </section>
    );
  }

  const sysList = await loadTrailSystemsForCityState({ city, state, limit });

  const rows = await timed("compute:rows map+sort (debug trailSystems)", async () => {
    const out = sysList.map((sys) => {
    const model = buildTrailSystemPageModel(sys);
    const gm = glanceMap(model.glance);
    const ratio =
      model.completeness.totalKeys > 0
        ? model.completeness.mappedKeys / model.completeness.totalKeys
        : 1;

    // Shade column: prefer glance shadeProxyPercent, else fall back to sys shade fields.
    const shadeItem =
      gm.get("shadeProxyPercent") ??
      (typeof (sys as any)?.shadePercentage === "number"
        ? { key: "shadePercentage", value: (sys as any).shadePercentage, kind: "percent" }
        : typeof (sys as any)?.shadePct === "number"
        ? { key: "shadePct", value: (sys as any).shadePct, kind: "percent" }
        : typeof (sys as any)?.shadePercent === "number"
        ? { key: "shadePercent", value: (sys as any).shadePercent, kind: "percent" }
        : undefined);

    return {
      sys,
      model,
      href: buildSystemHref(sys, city, state),
      ratio,
      name: model.identity.name || String(sys?.name ?? sys?.slug ?? sys?.id ?? "Trail system"),
      completenessLabel: `${model.completeness.mappedKeys}/${model.completeness.totalKeys}`,
      errors: model.qa.errors.length,
      warnings: model.qa.warnings.length,
      unmapped: model.completeness.unmappedKeys,
      hasElev: Number.isFinite((sys as any)?.elevationGainFt),
      cols: {
        lengthMilesTotal: displayFromItem(gm.get("lengthMilesTotal")),
        elevationGainFt: displayFromItem(gm.get("elevationGainFt")),
        accessRulesClass: displayFromItem(gm.get("accessRulesClass")),
        amenitiesIndexScore: displayFromItem(gm.get("amenitiesIndexScore")),
        hazardsClass: displayFromItem(gm.get("hazardsClass")),
        hazardsScore: displayFromItem(gm.get("hazardsScore")),
        waterNearScore: displayFromItem(gm.get("waterNearScore")),
        asphaltPercent: displayFromItem(gm.get("asphaltPercent")),
        naturalSurfacePercent: displayFromItem(gm.get("naturalSurfacePercent")),
        shadePercent: displayFromItem(shadeItem as any),
        nightScore: displayFromItem(gm.get("nightScore")),
        winterScore: displayFromItem(gm.get("winterScore")),
        smallDog: displayFromItem(gm.get("personalization.smallDogScore")),
        senior: displayFromItem(gm.get("personalization.seniorSafeScore")),
        energy: displayFromItem(gm.get("personalization.highEnergyScore")),
      },
    };
  });
    out.sort((a, b) => {
      if (a.ratio !== b.ratio) return a.ratio - b.ratio;
      if (a.errors !== b.errors) return b.errors - a.errors;
      if (a.warnings !== b.warnings) return b.warnings - a.warnings;
      return a.name.localeCompare(b.name);
    });
    return out;
  });

  return (
    <section>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
        TrailSystems Debug — {city}, {state}
      </h1>
      <p style={{ margin: "0 0 1rem 0", color: "#4b5563" }}>
        Showing {rows.length} systems (limit {limit})
      </p>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: "1200px", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Name</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Completeness</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Errors</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Warnings</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Unmapped</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Length mi</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Elev gain ft</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Access class</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Amenities</th>
            <th style={{ textAlign: "left", padding: "0.5rem" }}>Hazards class</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Hazards score</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Water score</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Asphalt %</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Natural %</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Shade %</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Night</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Winter</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Small</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Senior</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>Energy</th>
            <th style={{ textAlign: "right", padding: "0.5rem" }}>hasElev</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.sys?.id ?? row.href)} style={{ borderTop: "1px solid #e5e7eb" }}>
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>
                <Link href={row.href}>{row.name}</Link>
              </td>
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>{row.completenessLabel}</td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.errors}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.warnings}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.unmapped}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.lengthMilesTotal}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.elevationGainFt}
              </td>
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>{row.cols.accessRulesClass}</td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.amenitiesIndexScore}
              </td>
              <td style={{ padding: "0.5rem", verticalAlign: "top" }}>{row.cols.hazardsClass}</td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.hazardsScore}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.waterNearScore}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.asphaltPercent}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.naturalSurfacePercent}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.shadePercent}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.nightScore}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.winterScore}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.smallDog}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.senior}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.cols.energy}
              </td>
              <td style={{ padding: "0.5rem", textAlign: "right", verticalAlign: "top" }}>
                {row.hasElev ? "true" : "false"}
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </section>
  );
}

