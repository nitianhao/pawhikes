import type { Metadata } from "next";
import Link from "next/link";
import { getAdminDbSafe } from "@/lib/instant/safeAdmin";
import { search } from "@/lib/search/search";
import { tokenize } from "@/lib/search/tokenize";
import { DOG_NEED_MAP } from "@/lib/search/dogNeeds";
import type { SearchEntry, SearchResult } from "@/lib/search/types";
import { DogNeedShortcuts } from "@/components/home/DogNeedShortcuts";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { slugifyCity } from "@/lib/slug";
import { canonicalTrailSlug, normalizeState } from "@/lib/trailSlug";

async function loadEntries(): Promise<SearchEntry[]> {
  const db = await getAdminDbSafe();
  if (!db) return [];

  const result = await db.query({
    trailSystems: {
      $: {
        limit: 5000,
      },
    },
  });

  const systems: Record<string, unknown>[] = (() => {
    const r = result as Record<string, unknown>;
    const v = r?.trailSystems;
    if (Array.isArray(v)) return v as Record<string, unknown>[];
    const nested = (v as Record<string, unknown>)?.data;
    return Array.isArray(nested) ? (nested as Record<string, unknown>[]) : [];
  })();

  return systems
    .map((s): SearchEntry | null => {
      const name = String(s.name ?? "").trim();
      const city = String(s.city ?? "").trim();
      const rawState = String(s.state ?? "").trim();
      if (!name || !city) return null;
      const len = typeof s.lengthMilesTotal === "number" ? s.lengthMilesTotal : null;
      if (len === null || len <= 1) return null;

      const state = normalizeState(rawState);
      const citySlug = slugifyCity(city);
      const slug = canonicalTrailSlug({
        name: s.name as string ?? null,
        id: s.id as string ?? null,
        extSystemRef: s.extSystemRef as string ?? null,
      });

      return {
        slug,
        name,
        city,
        state,
        citySlug,
        len,
        leash: typeof s.leashPolicy === "string" ? s.leashPolicy : null,
        shade: typeof s.shadeClass === "string" ? s.shadeClass : null,
        gradeP90: typeof s.gradeP90 === "number" ? s.gradeP90 : null,
        waterScore: typeof s.waterNearScore === "number" ? s.waterNearScore : null,
        paved: typeof s.pavedPercentProxy === "number" ? s.pavedPercentProxy : null,
        crowdScore: typeof s.crowdProxyScore === "number" ? s.crowdProxyScore : null,
        tokens: [...new Set([...tokenize(name), ...tokenize(city)])],
      };
    })
    .filter((e): e is SearchEntry => e !== null);
}

function detectActiveNeeds(query: string): string[] {
  const tokens = tokenize(query);
  return tokens.filter(t => t in DOG_NEED_MAP);
}

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: "14px",
  background: "#fff",
  padding: "1.2rem",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const rawQ = params.q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? "";
  const query = String(q).trim();

  const entries = await loadEntries();
  const results: SearchResult[] = query ? search(query, entries, 50) : [];
  const activeNeeds = detectActiveNeeds(query);

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <h1 style={{ fontSize: "1.25rem", margin: 0, color: "#111827" }}>Trail search</h1>
      <section style={card}>
        <form method="get" action="/search" style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search trails, cities, or dog needs"
            aria-label="Search trails"
            style={{
              flex: "1 1 18rem",
              minWidth: "12rem",
              height: "44px",
              border: "1px solid #bbf7d0",
              borderRadius: "12px",
              padding: "0 0.85rem",
              fontSize: "0.95rem",
              outline: "none",
            }}
          />
          <button
            type="submit"
            style={{
              height: "44px",
              borderRadius: "12px",
              border: "1px solid #16a34a",
              background: "#16a34a",
              color: "#fff",
              fontWeight: 600,
              padding: "0 1rem",
              cursor: "pointer",
            }}
          >
            Search
          </button>
          {query && (
            <Link href="/search" style={{ alignSelf: "center", color: "#166534", fontSize: "0.875rem", textDecoration: "none" }}>
              Clear
            </Link>
          )}
        </form>

        {query && (
          <p style={{ marginTop: "0.8rem", fontSize: "0.875rem", color: "#6b7280" }}>
            {results.length === 0
              ? `No trails found for "${query}"`
              : `${results.length} trail${results.length === 1 ? "" : "s"} for "${query}"`}
            {activeNeeds.length > 0 && (
              <span style={{ marginLeft: "0.4rem" }}>
                {activeNeeds.map(n => (
                  <span
                    key={n}
                    style={{
                      display: "inline-block",
                      marginLeft: "0.3rem",
                      fontSize: "0.72rem",
                      fontWeight: 700,
                      padding: "0.15rem 0.45rem",
                      borderRadius: "999px",
                      background: "#dcfce7",
                      color: "#166534",
                      border: "1px solid #bbf7d0",
                      textTransform: "capitalize",
                    }}
                  >
                    {n}
                  </span>
                ))}
              </span>
            )}
          </p>
        )}
      </section>

      {query && results.length > 0 && (
        <section style={card}>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {results.map(r => (
              <TrailRow key={r.slug} result={r} />
            ))}
          </div>
        </section>
      )}

      {query && results.length === 0 && (
        <section style={{ ...card, color: "#374151" }}>
          <p style={{ marginBottom: "0.6rem" }}>
            Try a dog need keyword to filter trails:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {["easy", "shade", "water", "off-leash", "senior", "long", "smooth"].map(k => (
              <Link
                key={k}
                href={`/search?q=${encodeURIComponent(k)}`}
                style={{
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  padding: "0.25rem 0.65rem",
                  borderRadius: "999px",
                  border: "1px solid #bbf7d0",
                  background: "#f0fdf4",
                  color: "#166534",
                  textDecoration: "none",
                }}
              >
                {k}
              </Link>
            ))}
          </div>
        </section>
      )}

      {!query && <DogNeedShortcuts />}
    </div>
  );
}

function TrailRow({ result }: { result: SearchResult }) {
  const href = `/${encodeURIComponent(result.state)}/${encodeURIComponent(result.citySlug)}/${encodeURIComponent(result.slug)}`;

  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.7rem 0",
    borderBottom: "1px solid #f0fdf4",
    textDecoration: "none",
  };

  const nameStyle: React.CSSProperties = {
    flex: 1,
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#111827",
    minWidth: 0,
  };

  const metaStyle: React.CSSProperties = {
    fontSize: "0.8rem",
    color: "#6b7280",
    flexShrink: 0,
  };

  const chipStyle: React.CSSProperties = {
    flexShrink: 0,
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "0.15rem 0.45rem",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #bbf7d0",
  };

  const meta = [
    result.city,
    result.state,
    result.len != null ? `${result.len.toFixed(1)} mi` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={href} style={row}>
      <span style={nameStyle}>{result.name}</span>
      <span style={metaStyle}>{meta}</span>
      {result.leash === "off" && <span style={chipStyle}>Off-leash</span>}
      {result.shade === "high" && <span style={{ ...chipStyle, background: "#bbf7d0", color: "#14532d" }}>High shade</span>}
    </Link>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const rawQ = params.q;
  const q = ((Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? "").trim();
  const title = q ? `Search "${q}"` : "Search Trails";
  return buildPageMetadata({
    title,
    description:
      "Search dog-friendly trails by name, city, or dog needs like shade, water access, and off-leash policy.",
    pathname: "/search",
    index: false,
  });
}
