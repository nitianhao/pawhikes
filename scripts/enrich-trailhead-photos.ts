#!/usr/bin/env npx tsx
/**
 * Enrich trailHeads with one photo from the Google Places API (New).
 * Fetches Place details with photos, picks the first photo, calls getMedia to get a photoUri,
 * and writes googlePhotoName + googlePhotoUri to the trailhead.
 *
 * Skips trailheads that already have googlePhotoUri or googlePhotoName set.
 * By default processes all eligible trailheads (no limit). Use --limit N to cap.
 *
 * Usage:
 *   npx tsx scripts/enrich-trailhead-photos.ts
 *   npx tsx scripts/enrich-trailhead-photos.ts --write
 *   npx tsx scripts/enrich-trailhead-photos.ts --limit 10 --write
 */

import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

function loadEnvLocal(rootDir: string): void {
  const envPath = join(rootDir, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvLocal(ROOT);

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const limitArg = typeof args.limit === "string" ? parseInt(args.limit, 10) : undefined;
const write = !!args.write;

const appId = process.env.INSTANT_APP_ID || process.env.INSTANTDB_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANTDB_ADMIN_TOKEN;
const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!appId || !adminToken) {
  console.error("Missing INSTANT_APP_ID or INSTANT_ADMIN_TOKEN in .env.local");
  process.exit(1);
}
if (!googleApiKey || googleApiKey.trim() === "" || googleApiKey === "__PASTE_YOUR_KEY_HERE__") {
  console.error("Missing GOOGLE_MAPS_API_KEY in .env.local");
  process.exit(1);
}

const GOOGLE_BASE = "https://places.googleapis.com/v1";
const API_MIN_DELAY_MS = 300;
const PHOTO_MAX_HEIGHT_PX = 400;

let lastApiCallAt = 0;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function throttle(): Promise<void> {
  const now = Date.now();
  if (now - lastApiCallAt < API_MIN_DELAY_MS) await sleep(API_MIN_DELAY_MS - (now - lastApiCallAt));
  lastApiCallAt = Date.now();
}

type PlaceWithPhotos = {
  id?: string;
  name?: string;
  photos?: Array<{ name?: string; widthPx?: number; heightPx?: number }>;
};

type PhotoMediaResponse = {
  name?: string;
  photoUri?: string;
};

async function getPlaceWithPhotos(placeId: string): Promise<PlaceWithPhotos> {
  await throttle();
  const res = await fetch(`${GOOGLE_BASE}/places/${encodeURIComponent(placeId)}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": googleApiKey!,
      "X-Goog-FieldMask": "id,name,photos",
    },
  });
  if (!res.ok) throw new Error(`Place details failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<PlaceWithPhotos>;
}

async function getPhotoMedia(photoName: string): Promise<PhotoMediaResponse> {
  await throttle();
  const mediaName = photoName.endsWith("/media") ? photoName : `${photoName}/media`;
  const url = `${GOOGLE_BASE}/${mediaName}?maxHeightPx=${PHOTO_MAX_HEIGHT_PX}&skipHttpRedirect=true`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": googleApiKey!,
    },
  });
  if (!res.ok) throw new Error(`getMedia failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<PhotoMediaResponse>;
}

function entityList(res: unknown, name: string): unknown[] {
  const r = res as Record<string, unknown>;
  const raw = r?.[name];
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && "data" in raw) return (raw as { data: unknown[] }).data ?? [];
  return [];
}

async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });
  console.log("Enrich trailhead photos (Google Places API)\n");
  console.log("Config: limit=%s, write=%s\n", limitArg ?? "all", write);

  const thRes = await db.query({ trailHeads: { $: { limit: 50000 } } });
  const heads = entityList(thRes, "trailHeads") as Array<{
    id: string;
    googlePlaceId?: string;
    googlePhotoUri?: string;
    googlePhotoName?: string;
    name?: string;
    trailSlug?: string;
  }>;
  const withPlaceId = heads.filter((h) => h.googlePlaceId && String(h.googlePlaceId).trim() !== "");
  const notYetEnriched = withPlaceId.filter(
    (h) =>
      !(h.googlePhotoUri && String(h.googlePhotoUri).trim() !== "") &&
      !(h.googlePhotoName && String(h.googlePhotoName).trim() !== "")
  );
  const toProcess =
    limitArg != null && Number.isFinite(limitArg) && limitArg > 0
      ? notYetEnriched.slice(0, limitArg)
      : notYetEnriched;

  if (withPlaceId.length === 0) {
    console.log("No trailHeads with googlePlaceId found. Nothing to do.");
    return;
  }

  const skipped = withPlaceId.length - notYetEnriched.length;
  if (skipped > 0) {
    console.log("Skipping %s already enriched (have googlePhotoUri/googlePhotoName).", skipped);
  }
  if (toProcess.length === 0) {
    console.log("No trailHeads left to process. Done.");
    return;
  }

  console.log("Processing %s trailhead(s).\n", toProcess.length);

  for (const head of toProcess) {
    const placeId = head.googlePlaceId!.trim();
    const label = head.name || head.trailSlug || head.id;
    console.log("--- %s ---", label);
    console.log("  placeId: %s", placeId);

    try {
      const place = await getPlaceWithPhotos(placeId);
      const photos = place.photos;
      if (!photos || photos.length === 0) {
        console.log("  photos: none");
        continue;
      }

      const firstPhoto = photos[0];
      const photoName = firstPhoto?.name;
      if (!photoName || typeof photoName !== "string") {
        console.log("  photos: first photo has no name");
        continue;
      }

      console.log("  photoName: %s", photoName);

      const media = await getPhotoMedia(photoName);
      const photoUri = media.photoUri;
      if (!photoUri) {
        console.log("  photoUri: (empty)");
        continue;
      }

      console.log("  photoUri: %s", photoUri);

      if (write) {
        await db.transact([
          (db as any).tx.trailHeads[head.id].update({
            googlePhotoName: photoName,
            googlePhotoUri: photoUri,
          }),
        ]);
        console.log("  written: googlePhotoName, googlePhotoUri");
      } else {
        console.log("  [dry run] would write googlePhotoName, googlePhotoUri");
      }
    } catch (err) {
      console.error("  error:", err instanceof Error ? err.message : err);
    }

    console.log("");
  }

  console.log("Done.");
  if (!write) console.log("Run with --write to persist.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
