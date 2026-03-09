import { type NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/instant/admin";

// Trail segments don't change often — cache for 1 hour in CDN / ISR cache.
export const revalidate = 3600;

const FIELDS = ["id", "name", "surface", "width", "lengthMiles", "systemSlug", "geometry"] as const;
const LIMIT = 5000;

function normalize(res: unknown) {
  const r = res as { trailSegments?: unknown[] | { data?: unknown[] } };
  const raw = Array.isArray(r?.trailSegments)
    ? r.trailSegments
    : (r?.trailSegments as { data?: unknown[] })?.data ?? [];
  return Array.isArray(raw) ? raw : [];
}

// Truncate GeoJSON coordinate arrays to 5 decimal places (~1.1 m precision).
// Reduces JSON payload size and client parse time with no visible map degradation.
function truncateCoords(v: unknown): unknown {
  if (typeof v === "number") return Math.round(v * 1e5) / 1e5;
  if (Array.isArray(v)) return v.map(truncateCoords);
  return v;
}

function truncateGeometry(geom: unknown): unknown {
  if (!geom || typeof geom !== "object") return geom;
  const g = geom as Record<string, unknown>;
  if (!("coordinates" in g)) return geom;
  return { ...g, coordinates: truncateCoords(g.coordinates) };
}

function truncateSegmentGeometry(seg: unknown): unknown {
  if (!seg || typeof seg !== "object") return seg;
  const s = seg as Record<string, unknown>;
  if (!("geometry" in s)) return seg;
  return { ...s, geometry: truncateGeometry(s.geometry) };
}

export async function GET(req: NextRequest) {
  const systemSlug = req.nextUrl.searchParams.get("systemSlug")?.trim();

  if (!systemSlug || systemSlug.length === 0 || systemSlug.length > 256) {
    return NextResponse.json({ error: "systemSlug required" }, { status: 400 });
  }

  try {
    const res = await adminDb.query({
      trailSegments: {
        $: {
          where: { systemSlug },
          limit: LIMIT,
          fields: [...FIELDS],
        },
      },
    } as Parameters<typeof adminDb.query>[0]);

    const segments = normalize(res)
      .filter((s) => (s as { systemSlug?: string }).systemSlug === systemSlug)
      .map(truncateSegmentGeometry);

    return NextResponse.json(
      { segments },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      }
    );
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[api/segments] query failed:", err);
    }
    return NextResponse.json({ error: "Failed to load segments" }, { status: 500 });
  }
}
