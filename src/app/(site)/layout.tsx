import { Footer } from "@/components/layout/Footer";
import { SiteHeader } from "@/components/site/SiteHeader";
import { getAdminDbSafe } from "@/lib/instant/safeAdmin";
import { normalizeState } from "@/lib/trailSlug";

const mainStyle: React.CSSProperties = {
  flex: 1,
  width: "100%",
  maxWidth: "72rem",
  margin: "0 auto",
  padding: "1.5rem 1rem",
  minHeight: "60vh",
};

type TrailSystemRecord = { state?: string | null; city?: string | null };

async function getHeaderData(): Promise<{
  states: string[];
  citiesByState: Record<string, string[]>;
}> {
  const db = await getAdminDbSafe();
  if (!db) return { states: [], citiesByState: {} };

  const res = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const raw = res as unknown as {
    trailSystems?: TrailSystemRecord[] | { data?: TrailSystemRecord[] };
  };
  const maybe = raw.trailSystems;
  const systems = Array.isArray(maybe)
    ? maybe
    : maybe && typeof maybe === "object" && "data" in maybe
      ? (maybe.data ?? [])
      : [];
  const list = Array.isArray(systems) ? systems : [];

  const stateSet = new Set<string>();
  const citiesByState: Record<string, Set<string>> = {};

  for (const system of list) {
    const rawState = String(system.state ?? "").trim();
    const code = normalizeState(rawState || "unknown");
    stateSet.add(code);
    const cityLabel = String(system.city ?? "").trim() || "Unknown city";
    if (!citiesByState[code]) citiesByState[code] = new Set<string>();
    citiesByState[code].add(cityLabel);
  }

  const states = Array.from(stateSet).sort((a, b) => a.localeCompare(b));
  const citiesByStateSorted: Record<string, string[]> = {};
  for (const code of Object.keys(citiesByState)) {
    citiesByStateSorted[code] = Array.from(citiesByState[code]).sort((a, b) =>
      a.localeCompare(b)
    );
  }

  return { states, citiesByState: citiesByStateSorted };
}

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { states, citiesByState } = await getHeaderData();

  return (
    <>
      <SiteHeader states={states} citiesByState={citiesByState} />
      <main style={mainStyle}>{children}</main>
      <Footer />
    </>
  );
}
