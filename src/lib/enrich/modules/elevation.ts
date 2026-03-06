import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { basename, join } from "path";

export const SAMPLE_SPACING_M = 50;
const PROVIDER_BATCH_SIZE = 100;
const RATE_LIMIT_REQ_PER_SEC = 2;
const MAX_RETRIES = 4;
const MIN_POINTS_REQUIRED = 10;
const METERS_TO_FEET = 3.28084;

type Coord = [number, number]; // [lon, lat]

type SegmentLike = {
  id?: string;
  systemRef?: string;
  systemSlug?: string;
  extSystemRef?: string;
  modifiedDate?: string;
  geometry?: unknown;
};

type SystemLike = {
  id?: string;
  slug?: string;
  extSystemRef?: string;
};

export type ElevationSummary = {
  elevationMinFt: number;
  elevationMaxFt: number;
  elevationGainFt: number;
  elevationLossFt: number;
  gradeP50: number;
  gradeP90: number;
  elevationSampleCount: number;
  elevationProvider: string;
  elevationComputedAt: string;
};

export type ElevationResult =
  | { ok: true; summary: ElevationSummary; meta: { cacheHit: boolean; provider: string; sampleCount: number } }
  | { ok: false; reason: string; meta: { cacheHit: boolean; provider: string; sampleCount: number } };

export type ElevationContext = {
  segments: SegmentLike[];
  rootDir: string;
  sampleSpacingM?: number;
  providerName?: string;
  openTopoDataUrl?: string;
  openElevationUrl?: string;
  fetchImpl?: typeof fetch;
  logger?: (line: string) => void;
};

type CachePayload = {
  fingerprint: string;
  summary: ElevationSummary;
  elevationsM: number[];
  sampleCount: number;
};

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function haversineMeters(a: Coord, b: Coord): number {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function dedupeConsecutive(coords: Coord[], epsilonMeters = 1): Coord[] {
  if (coords.length === 0) return [];
  const out: Coord[] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    if (haversineMeters(out[out.length - 1], coords[i]) >= epsilonMeters) {
      out.push(coords[i]);
    }
  }
  return out;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * frac;
}

function interpolate(a: Coord, b: Coord, ratio: number): Coord {
  return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
}

function resampleAlongPath(points: Coord[], spacingMeters: number): Coord[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [points[0]];

  const sampled: Coord[] = [points[0]];
  let carry = 0;

  for (let i = 1; i < points.length; i++) {
    let from = points[i - 1];
    const to = points[i];
    let segLen = haversineMeters(from, to);
    if (segLen <= 0) continue;

    while (carry + segLen >= spacingMeters) {
      const distFromFrom = spacingMeters - carry;
      const ratio = distFromFrom / segLen;
      const pt = interpolate(from, to, ratio);
      sampled.push(pt);
      from = pt;
      segLen = haversineMeters(from, to);
      carry = 0;
      if (segLen <= 0) break;
    }

    carry += segLen;
  }

  const last = points[points.length - 1];
  if (sampled.length === 0 || haversineMeters(sampled[sampled.length - 1], last) >= 1) {
    sampled.push(last);
  }
  return sampled;
}

function flattenCoordsFromGeometry(geometry: unknown): Coord[] {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as any;
  const type = String(g.type ?? "");

  const out: Coord[] = [];
  if (type === "MultiLineString" && Array.isArray(g.coordinates)) {
    for (const line of g.coordinates) {
      if (!Array.isArray(line)) continue;
      for (const pt of line) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const lon = asNumber(pt[0]);
        const lat = asNumber(pt[1]);
        if (lon === null || lat === null) continue;
        out.push([lon, lat]);
      }
    }
  } else if (type === "LineString" && Array.isArray(g.coordinates)) {
    for (const pt of g.coordinates) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lon = asNumber(pt[0]);
      const lat = asNumber(pt[1]);
      if (lon === null || lat === null) continue;
      out.push([lon, lat]);
    }
  }
  return out;
}

function keyForSystem(system: SystemLike): string {
  return String(system.id ?? system.extSystemRef ?? system.slug ?? "unknown-system");
}

function buildFingerprint(segments: SegmentLike[]): string {
  const parts = segments
    .map((s) => `${String(s.id ?? "")}:${String(s.modifiedDate ?? "")}`)
    .sort();
  return createHash("sha1").update(parts.join("|"), "utf8").digest("hex");
}

function chooseProvider(ctx: ElevationContext): { provider: "opentopodata" | "open-elevation"; url: string } {
  const raw = String(ctx.providerName ?? process.env.ELEVATION_PROVIDER ?? "opentopodata").trim().toLowerCase();
  if (raw === "open-elevation") {
    return {
      provider: "open-elevation",
      url: String(ctx.openElevationUrl ?? process.env.OPEN_ELEVATION_URL ?? "https://api.open-elevation.com/api/v1/lookup"),
    };
  }
  return {
    provider: "opentopodata",
    url: String(ctx.openTopoDataUrl ?? process.env.OPENTOPODATA_URL ?? "https://api.opentopodata.org/v1/srtm90m"),
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function normalizeOpenTopoDataUrl(url: string): string {
  return url.includes("?") ? url : `${url}?`;
}

async function fetchBatchElevations(
  provider: "opentopodata" | "open-elevation",
  baseUrl: string,
  points: Coord[],
  fetchImpl: typeof fetch,
  lastRequestAt: { value: number }
): Promise<number[]> {
  const minIntervalMs = Math.ceil(1000 / RATE_LIMIT_REQ_PER_SEC);
  const now = Date.now();
  const waitMs = Math.max(0, minIntervalMs - (now - lastRequestAt.value));
  if (waitMs > 0) await sleep(waitMs);

  const makeRequest = async (): Promise<Response> => {
    if (provider === "opentopodata") {
      const locations = points.map(([lon, lat]) => `${lat},${lon}`).join("|");
      const prefix = normalizeOpenTopoDataUrl(baseUrl);
      const connector = prefix.endsWith("?") || prefix.endsWith("&") ? "" : "&";
      const url = `${prefix}${connector}locations=${encodeURIComponent(locations)}`;
      return fetchImpl(url, { signal: AbortSignal.timeout(30_000) });
    }

    const locations = points.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
    return fetchImpl(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locations }),
      signal: AbortSignal.timeout(30_000),
    });
  };

  let lastError = "unknown error";
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await makeRequest();
      lastRequestAt.value = Date.now();

      if (resp.status === 429 || resp.status >= 500) {
        lastError = `HTTP ${resp.status}`;
        const backoffMs = 500 * Math.pow(2, attempt - 1);
        await sleep(backoffMs);
        continue;
      }
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status} ${text.slice(0, 200)}`);
      }

      const json: any = await resp.json();
      const rows: any[] = Array.isArray(json?.results) ? json.results : [];
      const elevations = rows
        .map((r) => asNumber(r?.elevation))
        .filter((n): n is number => n !== null);
      if (elevations.length !== points.length) {
        throw new Error(`provider returned ${elevations.length}/${points.length} elevations`);
      }
      return elevations;
    } catch (err: any) {
      lastError = String(err?.message ?? err);
      if (attempt < MAX_RETRIES) {
        const backoffMs = 500 * Math.pow(2, attempt - 1);
        await sleep(backoffMs);
      }
    }
  }

  throw new Error(`elevation fetch failed after retries: ${lastError}`);
}

async function fetchElevations(
  provider: "opentopodata" | "open-elevation",
  baseUrl: string,
  samples: Coord[],
  fetchImpl: typeof fetch
): Promise<number[]> {
  const batches = chunk(samples, PROVIDER_BATCH_SIZE);
  const out: number[] = [];
  const lastRequestAt = { value: 0 };
  for (const batch of batches) {
    const elevations = await fetchBatchElevations(provider, baseUrl, batch, fetchImpl, lastRequestAt);
    out.push(...elevations);
  }
  return out;
}

function computeSummary(
  elevationsM: number[],
  sampledPoints: Coord[],
  provider: string,
  computedAtIso: string
): ElevationSummary {
  const elevationsFt = elevationsM.map((m) => m * METERS_TO_FEET);
  let gainFt = 0;
  let lossFt = 0;
  const absGrades: number[] = [];

  for (let i = 1; i < elevationsM.length; i++) {
    const dElevM = elevationsM[i] - elevationsM[i - 1];
    const dElevFt = dElevM * METERS_TO_FEET;
    if (dElevFt > 0) gainFt += dElevFt;
    if (dElevFt < 0) lossFt += Math.abs(dElevFt);

    const horizM = haversineMeters(sampledPoints[i - 1], sampledPoints[i]);
    if (horizM > 0.1) {
      absGrades.push(Math.abs((dElevM / horizM) * 100));
    }
  }

  return {
    elevationMinFt: round2(Math.min(...elevationsFt)),
    elevationMaxFt: round2(Math.max(...elevationsFt)),
    elevationGainFt: round2(gainFt),
    elevationLossFt: round2(lossFt),
    gradeP50: round2(percentile(absGrades, 0.5)),
    gradeP90: round2(percentile(absGrades, 0.9)),
    elevationSampleCount: sampledPoints.length,
    elevationProvider: provider,
    elevationComputedAt: computedAtIso,
  };
}

function segmentsForSystem(system: SystemLike, segments: SegmentLike[]): SegmentLike[] {
  const ref = String(system.extSystemRef ?? "").trim();
  const slug = String(system.slug ?? "").trim().toLowerCase();

  if (ref) {
    const byRef = segments.filter((seg) => String(seg.systemRef ?? "").trim() === ref);
    if (byRef.length > 0) return byRef;
  }

  if (slug) {
    const bySlug = segments.filter((seg) => String(seg.systemSlug ?? "").trim().toLowerCase() === slug);
    if (bySlug.length > 0) return bySlug;
  }

  return [];
}

async function readCache(cacheFile: string): Promise<CachePayload | null> {
  if (!existsSync(cacheFile)) return null;
  try {
    const raw = await readFile(cacheFile, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.fingerprint === "string" &&
      parsed.summary &&
      Array.isArray(parsed.elevationsM)
    ) {
      return parsed as CachePayload;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeCache(cacheFile: string, payload: CachePayload): Promise<void> {
  await writeFile(cacheFile, JSON.stringify(payload, null, 2), "utf8");
}

export async function enrichSystemElevation(system: SystemLike, ctx: ElevationContext): Promise<ElevationResult> {
  const providerCfg = chooseProvider(ctx);
  const provider = providerCfg.provider;
  const fetchImpl = ctx.fetchImpl ?? fetch;
  const sampleSpacing =
    typeof ctx.sampleSpacingM === "number" && Number.isFinite(ctx.sampleSpacingM) && ctx.sampleSpacingM > 0
      ? ctx.sampleSpacingM
      : SAMPLE_SPACING_M;

  const systemKey = keyForSystem(system);
  const systemSegments = segmentsForSystem(system, ctx.segments);
  if (systemSegments.length === 0) {
    return { ok: false, reason: "no linked segments", meta: { cacheHit: false, provider, sampleCount: 0 } };
  }

  const fingerprint = buildFingerprint(systemSegments);
  const cacheDir = join(ctx.rootDir, ".cache", "elevation");
  const safeSystemKey = basename(systemKey).replace(/[^a-zA-Z0-9._-]/g, "_");
  const cacheFile = join(cacheDir, `${safeSystemKey}-${fingerprint}.json`);

  const cached = await readCache(cacheFile);
  if (cached) {
    ctx.logger?.(`[elevation] provider=${provider} cache=hit samples=${cached.sampleCount}`);
    return {
      ok: true,
      summary: cached.summary,
      meta: { cacheHit: true, provider, sampleCount: cached.sampleCount },
    };
  }

  const pathCoords: Coord[] = [];
  for (const seg of systemSegments) {
    pathCoords.push(...flattenCoordsFromGeometry(seg.geometry));
  }

  const deduped = dedupeConsecutive(pathCoords);
  const sampled = resampleAlongPath(deduped, sampleSpacing);
  if (sampled.length < MIN_POINTS_REQUIRED) {
    return {
      ok: false,
      reason: `too few sampled points (${sampled.length} < ${MIN_POINTS_REQUIRED})`,
      meta: { cacheHit: false, provider, sampleCount: sampled.length },
    };
  }

  const elevationsM = await fetchElevations(provider, providerCfg.url, sampled, fetchImpl);
  const computedAt = new Date().toISOString();
  const summary = computeSummary(elevationsM, sampled, provider, computedAt);

  await mkdir(cacheDir, { recursive: true });
  await writeCache(cacheFile, {
    fingerprint,
    summary,
    elevationsM,
    sampleCount: sampled.length,
  });

  ctx.logger?.(`[elevation] provider=${provider} cache=miss samples=${sampled.length}`);

  return {
    ok: true,
    summary,
    meta: { cacheHit: false, provider, sampleCount: sampled.length },
  };
}
