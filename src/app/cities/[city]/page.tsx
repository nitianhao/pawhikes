import Link from "next/link";
import type { Metadata } from "next";
import { getAdminDbSafe, instantDbMissingEnvMessage } from "@/lib/instant/safeAdmin";
import CityTrailsList from "../_components/CityTrailsList";
import { safeDecodeURIComponent } from "@/lib/slug";
import { buildPageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const citySlug = safeDecodeURIComponent(city);
  const cityLabel = citySlug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");

  return buildPageMetadata({
    title: `${cityLabel} Trails`,
    description: "Legacy city route.",
    pathname: `/cities/${encodeURIComponent(citySlug)}`,
    index: false,
  });
}

export default async function CityPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const citySlug = safeDecodeURIComponent(city);
  const cityLabel = citySlug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");

  const db = await getAdminDbSafe();
  if (!db) {
    return (
      <main style={{ padding: "2rem", maxWidth: "48rem" }}>
        <h1>{cityLabel}</h1>
        <p style={{ marginTop: "0.75rem" }}>{instantDbMissingEnvMessage()}</p>
        <p style={{ marginTop: "0.75rem" }}>
          <Link href="/">Back home</Link>
        </p>
      </main>
    );
  }

  const res = await db.query({ trailSystems: { $: { limit: 5000 } } });
  const allSystems = Array.isArray((res as any).trailSystems)
    ? (res as any).trailSystems
    : (res as any).trailSystems?.data ?? [];

  const systems = allSystems.filter((s: Record<string, any>) =>
    String(s.city ?? "")
      .toLowerCase()
      .includes(cityLabel.toLowerCase())
  );

  return <CityTrailsList cityLabel={cityLabel} systems={systems} />;
}
