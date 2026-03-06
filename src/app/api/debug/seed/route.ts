import { NextResponse } from "next/server";
import { id } from "@instantdb/admin";
import { adminDb } from "@/lib/instant/admin";

export async function POST() {
  try {
    const systemId = id();
    const trailId = id();
    const trailheadId = id();
    const systemSlug = "debug-trail-system";

    await adminDb.transact([
      adminDb.tx.trailSystems[systemId].update({
        name: "Debug Trail System",
        slug: systemSlug,
        city: "Austin",
        state: "TX",
        extDataset: "debug",
        extSystemRef: `sys:${systemId}`,
      }),
      adminDb.tx.trails[trailId].update({
        name: "Debug Trail",
        systemRef: systemId,
        systemSlug,
        city: "Austin",
        state: "TX",
      }),
      adminDb.tx.trailHeads[trailheadId].update({
        name: "Debug Trailhead",
        trailSlug: systemSlug,
        systemRef: systemId,
      }),
    ]);

    const data = await adminDb.query({
      trailSystems: {},
      trails: {},
      trailHeads: {},
    });

    return NextResponse.json({
      ok: true,
      message: "Seed complete",
      inserted: { systemId, trailId, trailheadId },
      data,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error during seed";
    if (
      message.includes("INSTANTDB_APP_ID") ||
      message.includes("INSTANTDB_ADMIN_TOKEN")
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing InstantDB env vars. Add INSTANTDB_APP_ID and INSTANTDB_ADMIN_TOKEN to .env.local",
        },
        { status: 500 }
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
