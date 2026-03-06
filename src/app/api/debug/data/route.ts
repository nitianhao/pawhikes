import { NextResponse } from "next/server";
import { adminDb } from "@/lib/instant/admin";

export async function GET() {
  try {
    const data = await adminDb.query({
      cities: {},
      trails: {},
      trailheads: {},
    });
    return NextResponse.json(data);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error loading data";
    if (
      message.includes("INSTANTDB_APP_ID") ||
      message.includes("INSTANTDB_ADMIN_TOKEN")
    ) {
      return NextResponse.json(
        {
          error:
            "Missing InstantDB env vars. Add INSTANTDB_APP_ID and INSTANTDB_ADMIN_TOKEN to .env.local",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
