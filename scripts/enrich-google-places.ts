#!/usr/bin/env npx tsx

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
const writeMode = !!args.write;
const dryRun = writeMode ? false : true;
const force = !!args.force;
const cityFilter = typeof args.city === "string" ? args.city : undefined;
const stateFilter = typeof args.state === "string" ? args.state : undefined;
const limitArg = typeof args.limit === "string" ? Number.parseInt(args.limit, 10) : undefined;
const radiusBiasM = typeof args.radiusBiasM === "string" ? Number.parseInt(args.radiusBiasM, 10) : 800;
const radiusDogM = typeof args.radiusDogM === "string" ? Number.parseInt(args.radiusDogM, 10) : 1500;

if (limitArg !== undefined && (!Number.isFinite(limitArg) || limitArg <= 0)) {
  console.error("Error: --limit must be a positive integer");
  process.exit(1);
}
if (!Number.isFinite(radiusBiasM) || radiusBiasM <= 0) {
  console.error("Error: --radiusBiasM must be a positive integer");
  process.exit(1);
}
if (!Number.isFinite(radiusDogM) || radiusDogM <= 0) {
  console.error("Error: --radiusDogM must be a positive integer");
  process.exit(1);
}

const appId = process.env.INSTANT_APP_ID || process.env.INSTANTDB_APP_ID;
const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANTDB_ADMIN_TOKEN;
const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!appId) {
  throw new Error("Missing INSTANT_APP_ID (or INSTANTDB_APP_ID) in .env.local");
}
if (!adminToken) {
  throw new Error("Missing INSTANT_ADMIN_TOKEN (or INSTANT_APP_ADMIN_TOKEN / INSTANTDB_ADMIN_TOKEN) in .env.local");
}
if (!googleApiKey || googleApiKey.trim() === "" || googleApiKey === "__PASTE_YOUR_KEY_HERE__") {
  throw new Error("Missing GOOGLE_MAPS_API_KEY in .env.local. Set a valid Google Maps API key before running this script.");
}

const GOOGLE_BASE = "https://places.googleapis.com/v1";
const API_MIN_DELAY_MS = 300;
const API_MAX_RETRIES = 3;
const CANONICAL_TYPES = new Set(["park", "tourist_attraction", "natural_feature"]);
const DOG_TYPES = ["veterinary_care", "pet_store", "dog_park", "cafe"] as const;

type DogType = (typeof DOG_TYPES)[number];

type TrailHead = {
  id: string;
  lat?: number;
  lon?: number;
  name?: string;
  systemRef?: string;
  raw?: { systemName?: string; systemSlug?: string; [k: string]: unknown };
  googlePlaceId?: string;
  city?: string;
  state?: string;
  [k: string]: unknown;
};

type PlaceLite = {
  id?: string;
  displayName?: { text?: string };
  types?: string[];
  primaryType?: string;
  rating?: number;
  userRatingCount?: number;
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  googleMapsUri?: string;
};

type PlaceDetails = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  businessStatus?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
  };
};

type CandidateScore = {
  place: PlaceLite;
  query: string;
  distanceM: number;
  typeMatch: boolean;
  hasReviewCount: boolean;
  score: number;
  confidence: number;
  reason: string;
};

let lastApiCallAt = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const p1 = (aLat * Math.PI) / 180;
  const p2 = (bLat * Math.PI) / 180;
  const dp = ((bLat - aLat) * Math.PI) / 180;
  const dl = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function containsTrailWord(v?: string): boolean {
  if (!v) return false;
  const n = v.toLowerCase();
  return n.includes("trail") || n.includes("trailhead");
}

function entityList(res: any, name: string): any[] {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

function hasOwnField(rows: TrailHead[], field: string): boolean {
  return rows.some((row) => Object.prototype.hasOwnProperty.call(row, field));
}

function parseStringMaybe(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

async function throttleApiCall(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastApiCallAt;
  if (elapsed < API_MIN_DELAY_MS) {
    await sleep(API_MIN_DELAY_MS - elapsed);
  }
  lastApiCallAt = Date.now();
}

async function googleRequest<T>(
  path: string,
  init: RequestInit,
  fieldMask: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= API_MAX_RETRIES; attempt++) {
    try {
      await throttleApiCall();
      const headers: Record<string, string> = {
        "X-Goog-Api-Key": googleApiKey!,
        "X-Goog-FieldMask": fieldMask,
      };
      if (init.body !== undefined) headers["Content-Type"] = "application/json";

      const resp = await fetch(`${GOOGLE_BASE}${path}`, {
        ...init,
        headers: {
          ...headers,
          ...(init.headers as Record<string, string> | undefined),
        },
      });

      if (resp.ok) {
        return (await resp.json()) as T;
      }

      const bodyText = await resp.text();
      const retryable = resp.status === 429 || (resp.status >= 500 && resp.status <= 599);
      if (retryable && attempt < API_MAX_RETRIES) {
        const waitMs = 500 * 2 ** (attempt - 1);
        await sleep(waitMs);
        continue;
      }

      throw new Error(`Google Places request failed (${resp.status}) ${bodyText}`);
    } catch (err) {
      lastError = err;
      if (attempt < API_MAX_RETRIES) {
        const waitMs = 500 * 2 ** (attempt - 1);
        await sleep(waitMs);
        continue;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Google Places request failed");
}

async function searchText(textQuery: string, lat: number, lon: number, radiusM: number): Promise<PlaceLite[]> {
  const body = {
    textQuery,
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: radiusM,
      },
    },
    maxResultCount: 10,
  };

  const res = await googleRequest<{ places?: PlaceLite[] }>(
    "/places:searchText",
    { method: "POST", body: JSON.stringify(body) },
    "places.id,places.displayName,places.types,places.primaryType,places.rating,places.userRatingCount,places.location,places.formattedAddress",
  );

  return res.places ?? [];
}

function scoreCandidate(place: PlaceLite, trailHead: TrailHead, query: string): CandidateScore | null {
  const placeId = parseStringMaybe(place.id);
  const lat = place.location?.latitude;
  const lon = place.location?.longitude;
  if (!placeId || typeof lat !== "number" || typeof lon !== "number") return null;
  if (typeof trailHead.lat !== "number" || typeof trailHead.lon !== "number") return null;

  const distanceM = haversineMeters(trailHead.lat, trailHead.lon, lat, lon);
  if (distanceM > 1200) return null;

  const types = new Set([place.primaryType, ...(place.types ?? [])].filter(Boolean) as string[]);
  const typeMatch = [...types].some((t) => CANONICAL_TYPES.has(t));

  let distanceBucket = 0.15;
  if (distanceM <= 200) distanceBucket = 0.6;
  else if (distanceM <= 500) distanceBucket = 0.45;
  else if (distanceM <= 900) distanceBucket = 0.3;

  const typeScore = typeMatch ? 0.25 : 0;
  const reviewCount = place.userRatingCount ?? 0;
  const reviewPresence = reviewCount > 0 ? 0.15 : 0;
  const reviewBoost = Math.min(reviewCount, 500) / 500;
  const ratingBoost = Math.max(0, Math.min(5, place.rating ?? 0)) / 5;
  const nameBoost = containsTrailWord(place.displayName?.text) ? 0.05 : 0;

  const score = distanceBucket + typeScore + reviewPresence + reviewBoost * 0.2 + ratingBoost * 0.1 + nameBoost;
  const confidence = Math.max(0, Math.min(1, distanceBucket + typeScore + reviewPresence));

  const reason = `query=${query};distanceM=${Math.round(distanceM)};typeMatch=${typeMatch};reviewCount=${reviewCount}`;

  return {
    place,
    query,
    distanceM,
    typeMatch,
    hasReviewCount: reviewCount > 0,
    score,
    confidence,
    reason,
  };
}

function chooseBestCandidate(trailHead: TrailHead, query: string, places: PlaceLite[]): CandidateScore | null {
  const scored: CandidateScore[] = [];
  for (const place of places) {
    const s = scoreCandidate(place, trailHead, query);
    if (s) scored.push(s);
  }
  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    const byScore = b.score - a.score;
    if (byScore !== 0) return byScore;
    const byReviews = (b.place.userRatingCount ?? 0) - (a.place.userRatingCount ?? 0);
    if (byReviews !== 0) return byReviews;
    const byRating = (b.place.rating ?? 0) - (a.place.rating ?? 0);
    if (byRating !== 0) return byRating;
    const byDistance = a.distanceM - b.distanceM;
    if (byDistance !== 0) return byDistance;
    return String(a.place.id ?? "").localeCompare(String(b.place.id ?? ""));
  });

  return scored[0];
}

async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  return googleRequest<PlaceDetails>(
    `/places/${encodeURIComponent(placeId)}`,
    { method: "GET" },
    "id,displayName,formattedAddress,googleMapsUri,websiteUri,nationalPhoneNumber,businessStatus,rating,userRatingCount,regularOpeningHours",
  );
}

async function searchNearbyDogLogistics(lat: number, lon: number, radiusM: number): Promise<{
  radiusM: number;
  totals: Record<DogType, number>;
  top: Record<DogType, Array<{ placeId: string; name: string; rating: number | null; reviewCount: number; mapsUrl: string | null; lat: number | null; lon: number | null }>>;
}> {
  const body = {
    includedTypes: [...DOG_TYPES],
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lon },
        radius: radiusM,
      },
    },
    maxResultCount: 20,
  };

  const res = await googleRequest<{ places?: PlaceLite[] }>(
    "/places:searchNearby",
    { method: "POST", body: JSON.stringify(body) },
    "places.id,places.displayName,places.primaryType,places.types,places.rating,places.userRatingCount,places.googleMapsUri,places.location",
  );

  const places = res.places ?? [];

  const totals = {
    veterinary_care: 0,
    pet_store: 0,
    dog_park: 0,
    cafe: 0,
  } satisfies Record<DogType, number>;

  const grouped: Record<DogType, Array<{ placeId: string; name: string; rating: number | null; reviewCount: number; mapsUrl: string | null; lat: number | null; lon: number | null }>> = {
    veterinary_care: [],
    pet_store: [],
    dog_park: [],
    cafe: [],
  };

  for (const p of places) {
    const placeId = parseStringMaybe(p.id);
    if (!placeId) continue;
    const allTypes = new Set([p.primaryType, ...(p.types ?? [])].filter(Boolean) as string[]);

    for (const t of DOG_TYPES) {
      if (!allTypes.has(t)) continue;
      totals[t] += 1;
      grouped[t].push({
        placeId,
        name: parseStringMaybe(p.displayName?.text) ?? "(unnamed)",
        rating: typeof p.rating === "number" ? p.rating : null,
        reviewCount: typeof p.userRatingCount === "number" ? p.userRatingCount : 0,
        mapsUrl: parseStringMaybe(p.googleMapsUri) ?? null,
        lat: typeof p.location?.latitude === "number" ? p.location.latitude : null,
        lon: typeof p.location?.longitude === "number" ? p.location.longitude : null,
      });
    }
  }

  for (const t of DOG_TYPES) {
    grouped[t].sort((a, b) => {
      const byReviews = b.reviewCount - a.reviewCount;
      if (byReviews !== 0) return byReviews;
      const byRating = (b.rating ?? 0) - (a.rating ?? 0);
      if (byRating !== 0) return byRating;
      return a.name.localeCompare(b.name);
    });
    grouped[t] = grouped[t].slice(0, 3);
  }

  return {
    radiusM,
    totals,
    top: grouped,
  };
}

async function main(): Promise<void> {
  const db = init({ appId: appId!, adminToken: adminToken! });

  console.log("=== CONFIG ===");
  console.log("mode:          ", dryRun ? "DRY RUN" : "WRITE");
  console.log("force:         ", force);
  console.log("limit:         ", limitArg ?? "(all)");
  console.log("city filter:   ", cityFilter ?? "(none)");
  console.log("state filter:  ", stateFilter ?? "(none)");
  console.log("radiusBiasM:   ", radiusBiasM);
  console.log("radiusDogM:    ", radiusDogM);
  console.log("===============\n");

  const thRes = await db.query({ trailHeads: { $: { limit: 50000 } } });
  let trailHeads: TrailHead[] = entityList(thRes, "trailHeads") as TrailHead[];

  const hasCity = hasOwnField(trailHeads, "city");
  const hasState = hasOwnField(trailHeads, "state");

  if (cityFilter && hasCity) {
    const q = cityFilter.toLowerCase();
    trailHeads = trailHeads.filter((th) => String(th.city ?? "").toLowerCase().includes(q));
  } else if (cityFilter && !hasCity) {
    console.log("--city provided but trailHeads has no city field; skipping city filter.");
  }

  if (stateFilter && hasState) {
    const q = stateFilter.toLowerCase();
    trailHeads = trailHeads.filter((th) => String(th.state ?? "").toLowerCase().includes(q));
  } else if (stateFilter && !hasState) {
    console.log("--state provided but trailHeads has no state field; skipping state filter.");
  }

  if (limitArg) {
    trailHeads = trailHeads.slice(0, limitArg);
  }

  if (trailHeads.length === 0) {
    console.log("No trailHeads matched filters.");
    return;
  }

  let processed = 0;
  let skippedMissingCoords = 0;
  let skippedExisting = 0;
  let skippedNoCandidate = 0;
  let errored = 0;

  const pendingUpdates: Array<{ id: string; payload: Record<string, unknown>; preview: Record<string, unknown> }> = [];

  for (const trailHead of trailHeads) {
    if (typeof trailHead.lat !== "number" || typeof trailHead.lon !== "number") {
      skippedMissingCoords += 1;
      continue;
    }
    if (!force && parseStringMaybe(trailHead.googlePlaceId)) {
      skippedExisting += 1;
      continue;
    }

    try {
      const systemName =
        parseStringMaybe(trailHead.raw?.systemName) ??
        parseStringMaybe(trailHead.name) ??
        parseStringMaybe(trailHead.systemRef) ??
        "trailhead";

      const q1 = `${systemName} trailhead`;
      const q2 = `${systemName} park`;

      const firstResults = await searchText(q1, trailHead.lat, trailHead.lon, radiusBiasM);
      let chosen = chooseBestCandidate(trailHead, q1, firstResults);

      if (!chosen) {
        const secondResults = await searchText(q2, trailHead.lat, trailHead.lon, radiusBiasM);
        chosen = chooseBestCandidate(trailHead, q2, secondResults);
      }

      if (!chosen || !parseStringMaybe(chosen.place.id)) {
        skippedNoCandidate += 1;
        continue;
      }

      const chosenPlaceId = chosen.place.id!;
      const details = await getPlaceDetails(chosenPlaceId);
      const placeLat = chosen.place.location?.latitude;
      const placeLon = chosen.place.location?.longitude;

      const nearbyDogLogistics =
        typeof placeLat === "number" && typeof placeLon === "number"
          ? await searchNearbyDogLogistics(placeLat, placeLon, radiusDogM)
          : {
              radiusM: radiusDogM,
              totals: { veterinary_care: 0, pet_store: 0, dog_park: 0, cafe: 0 },
              top: { veterinary_care: [], pet_store: [], dog_park: [], cafe: [] },
            };

      const payloadToWrite: Record<string, unknown> = {
        googlePlaceId: parseStringMaybe(details.id) ?? chosenPlaceId,
        googleCanonicalName: parseStringMaybe(details.displayName?.text) ?? parseStringMaybe(chosen.place.displayName?.text),
        googleAddress: parseStringMaybe(details.formattedAddress) ?? parseStringMaybe(chosen.place.formattedAddress),
        googleMapsUrl: parseStringMaybe(details.googleMapsUri),
        googleRating: typeof details.rating === "number" ? details.rating : typeof chosen.place.rating === "number" ? chosen.place.rating : undefined,
        googleReviewCount:
          typeof details.userRatingCount === "number"
            ? details.userRatingCount
            : typeof chosen.place.userRatingCount === "number"
              ? chosen.place.userRatingCount
              : undefined,
        googleBusinessStatus: parseStringMaybe(details.businessStatus),
        googleOpenNow: typeof details.regularOpeningHours?.openNow === "boolean" ? details.regularOpeningHours.openNow : undefined,
        googleWeekdayText: Array.isArray(details.regularOpeningHours?.weekdayDescriptions)
          ? details.regularOpeningHours.weekdayDescriptions
          : undefined,
        googleWebsite: parseStringMaybe(details.websiteUri),
        googlePhone: parseStringMaybe(details.nationalPhoneNumber),
        googleLastSyncAt: new Date().toISOString(),
        googleMatchConfidence: Number(chosen.confidence.toFixed(3)),
        googleMatchReason: chosen.reason,
        nearbyDogLogistics,
      };

      const compactPayload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(payloadToWrite)) {
        if (v !== undefined) compactPayload[k] = v;
      }

      const preview = {
        trailHeadId: trailHead.id,
        systemRef: trailHead.systemRef ?? null,
        chosenPlaceId: chosenPlaceId,
        confidence: Number(chosen.confidence.toFixed(3)),
        reason: chosen.reason,
        payloadToWrite: compactPayload,
      };

      if (dryRun) {
        console.log(JSON.stringify(preview));
      } else {
        pendingUpdates.push({ id: trailHead.id, payload: compactPayload, preview });
      }

      processed += 1;
    } catch (err) {
      errored += 1;
      console.error(`Error enriching trailHead ${trailHead.id}:`, err instanceof Error ? err.message : err);
    }
  }

  if (!dryRun && pendingUpdates.length > 0) {
    const BATCH = 25;
    let written = 0;
    for (let i = 0; i < pendingUpdates.length; i += BATCH) {
      const chunk = pendingUpdates.slice(i, i + BATCH);
      const steps = chunk.map((item) => (db as any).tx.trailHeads[item.id].update(item.payload));
      await db.transact(steps);
      written += chunk.length;
      console.log(`Written ${written}/${pendingUpdates.length}`);
    }
  }

  console.log("\n=== ENRICH GOOGLE PLACES SUMMARY ===");
  console.log(`trailHeads considered:      ${trailHeads.length}`);
  console.log(`processed:                  ${processed}`);
  console.log(`skipped (missing coords):   ${skippedMissingCoords}`);
  console.log(`skipped (has googlePlaceId):${skippedExisting}`);
  console.log(`skipped (no candidate):     ${skippedNoCandidate}`);
  console.log(`errors:                     ${errored}`);
  if (!dryRun) {
    console.log(`written:                    ${pendingUpdates.length}`);
  } else {
    console.log("dry-run:                    true (no writes)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
