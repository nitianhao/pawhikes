import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, join } from "path";
import { filterByBbox, type OsmLocalIndex, type OsmElement } from "../../lib/osmLocal.js";

type Coord = [number, number]; // [lon, lat]
type MultiLineCoords = Coord[][];
type Bbox = [number, number, number, number]; // [minLon,minLat,maxLon,maxLat]

type SegmentLike = {
  id?: string;
  systemRef?: string;
  systemSlug?: string;
  modifiedDate?: string;
  geometry?: unknown;
};

type SystemLike = {
  id?: string;
  slug?: string;
  extSystemRef?: string;
  bbox?: unknown;
  segmentCount?: number;
  centroid?: unknown;
};

type HazardKind =
  | "road_crossing"
  | "water_crossing"
  | "cliff_edge"
  | "bike_conflict"
  | "offleash_conflict_proxy";

type OSMType = "node" | "way" | "relation";

type HazardPoint = {
  kind: HazardKind;
  name?: string | null;
  osmId: string;
  osmType: OSMType;
  tags: Record<string, string>;
  location: { type: "Point"; coordinates: [number, number] };
  distanceToTrailMeters: number;
};

type HazardCounts = {
  roadCrossings: { count: number; riskyCount: number };
  waterCrossings: { count: number };
  cliffOrSteepEdge: { count: number };
  bikeConflictProxy: { count: number };
  offLeashConflictProxy: { count: number };
};

export type HazardsSummary = {
  hazardsLastComputedAt: number;
  hazardsScore: number;
  hazardsClass: "low" | "medium" | "high";
  hazardsReasons: string[];
  hazards: HazardCounts;
  hazardPoints: HazardPoint[];
};

export type HazardsResult =
  | {
      ok: true;
      summary: HazardsSummary;
      meta: {
        cacheHit: boolean;
        samplePointCount: number;
      };
    }
  | {
      ok: false;
      reason: string;
      meta: {
        cacheHit: boolean;
        samplePointCount: number;
      };
    };

export type HazardsContext = {
  segments: SegmentLike[];
  rootDir: string;
  overpass?: (query: string) => Promise<any[]>;
  localIndex?: OsmLocalIndex | null;
  logger?: (line: string) => void;
};

type HazardCandidate = {
  kind: HazardKind;
  osmType: OSMType;
  osmId: string;
  name: string | null;
  tags: Record<string, string>;
  coord: Coord;
};

type CachePayload = {
  fingerprint: string;
  summary: HazardsSummary;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function haversineM(a: Coord, b: Coord): number {
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

function pointToSegDistanceM(p: Coord, a: Coord, b: Coord): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return haversineM(p, a);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const closest: Coord = [a[0] + clamped * dx, a[1] + clamped * dy];
  return haversineM(p, closest);
}

function distanceToMultiLineM(p: Coord, lines: MultiLineCoords): number {
  let min = Number.POSITIVE_INFINITY;
  for (const line of lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const d = pointToSegDistanceM(p, line[i], line[i + 1]);
      if (d < min) min = d;
    }
  }
  return Number.isFinite(min) ? min : Number.POSITIVE_INFINITY;
}

function flattenCoords(geometry: unknown): MultiLineCoords {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as any;
  if (g.type === "LineString" && Array.isArray(g.coordinates)) {
    const line: Coord[] = [];
    for (const pt of g.coordinates) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lon = asNumber(pt[0]);
      const lat = asNumber(pt[1]);
      if (lon === null || lat === null) continue;
      line.push([lon, lat]);
    }
    return line.length > 1 ? [line] : [];
  }
  if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
    const out: MultiLineCoords = [];
    for (const lineIn of g.coordinates) {
      if (!Array.isArray(lineIn)) continue;
      const line: Coord[] = [];
      for (const pt of lineIn) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const lon = asNumber(pt[0]);
        const lat = asNumber(pt[1]);
        if (lon === null || lat === null) continue;
        line.push([lon, lat]);
      }
      if (line.length > 1) out.push(line);
    }
    return out;
  }
  return [];
}

function normalizeBbox(input: unknown): Bbox | null {
  if (Array.isArray(input) && input.length >= 4) {
    const minLon = asNumber(input[0]);
    const minLat = asNumber(input[1]);
    const maxLon = asNumber(input[2]);
    const maxLat = asNumber(input[3]);
    if (minLon !== null && minLat !== null && maxLon !== null && maxLat !== null) {
      return [minLon, minLat, maxLon, maxLat];
    }
  }
  if (input && typeof input === "object") {
    const b = input as any;
    const minLon = asNumber(b.minLon ?? b.minX ?? b.west);
    const minLat = asNumber(b.minLat ?? b.minY ?? b.south);
    const maxLon = asNumber(b.maxLon ?? b.maxX ?? b.east);
    const maxLat = asNumber(b.maxLat ?? b.maxY ?? b.north);
    if (minLon !== null && minLat !== null && maxLon !== null && maxLat !== null) {
      return [minLon, minLat, maxLon, maxLat];
    }
  }
  return null;
}

function bboxFromLines(lines: MultiLineCoords): Bbox | null {
  let minLon = Number.POSITIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let seen = false;

  for (const line of lines) {
    for (const [lon, lat] of line) {
      seen = true;
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return seen ? [minLon, minLat, maxLon, maxLat] : null;
}

function centroidFromLines(lines: MultiLineCoords): Coord | null {
  let lonSum = 0;
  let latSum = 0;
  let count = 0;
  for (const line of lines) {
    for (const [lon, lat] of line) {
      lonSum += lon;
      latSum += lat;
      count++;
    }
  }
  if (!count) return null;
  return [lonSum / count, latSum / count];
}

function centroidFromSystem(system: SystemLike, lines: MultiLineCoords): Coord | null {
  const c = system.centroid as any;
  if (Array.isArray(c) && c.length >= 2) {
    const lon = asNumber(c[0]);
    const lat = asNumber(c[1]);
    if (lon !== null && lat !== null) return [lon, lat];
  }
  if (c && typeof c === "object") {
    if (Array.isArray(c.coordinates) && c.coordinates.length >= 2) {
      const lon = asNumber(c.coordinates[0]);
      const lat = asNumber(c.coordinates[1]);
      if (lon !== null && lat !== null) return [lon, lat];
    }
    const lon = asNumber(c.lon ?? c.lng ?? c.x);
    const lat = asNumber(c.lat ?? c.y);
    if (lon !== null && lat !== null) return [lon, lat];
  }
  return centroidFromLines(lines);
}

function expandBboxMeters(bbox: Bbox, meters: number): Bbox {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const midLat = (minLat + maxLat) / 2;
  const latPad = meters / 111_320;
  const lonPad = meters / (111_320 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  return [minLon - lonPad, minLat - latPad, maxLon + lonPad, maxLat + latPad];
}

function bboxStr(bbox: Bbox): string {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  return `${minLat},${minLon},${maxLat},${maxLon}`;
}

function systemKey(system: SystemLike): string {
  return String(system.id ?? system.extSystemRef ?? system.slug ?? "unknown-system");
}

function linkedSegments(system: SystemLike, segments: SegmentLike[]): SegmentLike[] {
  const ref = String(system.extSystemRef ?? "").trim();
  const slug = String(system.slug ?? "").trim().toLowerCase();

  if (ref) {
    const byRef = segments.filter((s) => String(s.systemRef ?? "").trim() === ref);
    if (byRef.length > 0) return byRef;
  }

  if (slug) {
    const bySlug = segments.filter((s) => String(s.systemSlug ?? "").trim().toLowerCase() === slug);
    if (bySlug.length > 0) return bySlug;
  }

  return [];
}

function buildFingerprint(system: SystemLike, bbox: Bbox, segs: SegmentLike[]): string {
  const base = [
    `bbox:${bbox.map((n) => n.toFixed(6)).join(",")}`,
    `segmentCount:${String(system.segmentCount ?? segs.length)}`,
    ...segs
      .map((s) => `${String(s.id ?? "")}:${String(s.modifiedDate ?? "")}`)
      .sort(),
  ].join("|");
  return createHash("sha1").update(base, "utf8").digest("hex");
}

async function readCache(path: string): Promise<CachePayload | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.fingerprint && parsed.summary) {
      return parsed as CachePayload;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeCache(path: string, payload: CachePayload): Promise<void> {
  await writeFile(path, JSON.stringify(payload, null, 2), "utf8");
}

async function defaultOverpass(query: string): Promise<any[]> {
  const RETRIES = 2;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const resp = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(25_000),
        });

        if (resp.status === 429 || resp.status === 504 || resp.status >= 500) {
          await sleep(attempt * 4000);
          continue;
        }

        if (!resp.ok) continue;
        const json: any = await resp.json();
        return Array.isArray(json?.elements) ? json.elements : [];
      } catch {
        if (attempt < RETRIES) await sleep(attempt * 2000);
      }
    }
  }
  return [];
}

function stringTags(tags: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!tags || typeof tags !== "object") return out;
  for (const [k, v] of Object.entries(tags)) {
    if (v === undefined || v === null) continue;
    out[String(k)] = String(v);
  }
  return out;
}

function toCandidate(kind: HazardKind, el: any): HazardCandidate | null {
  const type = String(el?.type ?? "");
  if (type !== "node" && type !== "way" && type !== "relation") return null;

  const lon = asNumber(el?.lon ?? el?.center?.lon);
  const lat = asNumber(el?.lat ?? el?.center?.lat);
  if (lon === null || lat === null) return null;

  const id = el?.id;
  if (id === undefined || id === null) return null;

  const tags = stringTags(el?.tags);
  return {
    kind,
    osmType: type,
    osmId: `${type}/${id}`,
    name: tags.name ?? null,
    tags,
    coord: [lon, lat],
  };
}

function dedupeCandidates(items: HazardCandidate[]): HazardCandidate[] {
  const map = new Map<string, HazardCandidate>();
  for (const item of items) {
    const key = `${item.kind}:${item.osmId}`;
    if (!map.has(key)) map.set(key, item);
  }
  return [...map.values()];
}

function riskyHighwayTags(tags: Record<string, string>): boolean {
  const maxspeed = asNumber(tags.maxspeed?.split(" ")[0]);
  const lanes = asNumber(tags.lanes);
  const highway = String(tags.highway ?? "").toLowerCase();
  if (maxspeed !== null && maxspeed >= 35) return true;
  if (lanes !== null && lanes >= 4) return true;
  if (["primary", "secondary", "trunk", "primary_link", "secondary_link", "trunk_link"].includes(highway)) return true;
  return false;
}

function wayCoordsFromElement(el: any): Coord[] {
  const out: Coord[] = [];
  if (!Array.isArray(el?.geometry)) return out;
  for (const p of el.geometry) {
    const lon = asNumber(p?.lon);
    const lat = asNumber(p?.lat);
    if (lon === null || lat === null) continue;
    out.push([lon, lat]);
  }
  return out;
}

function minDistanceToWay(point: Coord, wayCoords: Coord[]): number {
  if (wayCoords.length < 2) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < wayCoords.length - 1; i++) {
    const d = pointToSegDistanceM(point, wayCoords[i], wayCoords[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

function roadCrossingsQuery(bbox: Bbox): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:22];
(
  node["highway"="crossing"](${b});
  node["crossing"](${b});
  way["highway"="crossing"](${b});
  way["crossing"](${b});
);
out center tags;`;
}

function nearbyHighwaysQuery(bbox: Bbox): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:22];
(
  way["highway"](${b});
);
out geom tags;`;
}

function waterCrossingsQuery(bbox: Bbox): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:22];
(
  node["ford"](${b});
  node["highway"="ford"](${b});
  way["ford"](${b});
  way["highway"="ford"](${b});
  way["bridge"](${b});
  node["waterway"="stream"]["crossing"](${b});
  node["waterway"="stream"]["ford"](${b});
);
out center tags;`;
}

function cliffQuery(bbox: Bbox): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:22];
(
  node["natural"="cliff"](${b});
  way["natural"="cliff"](${b});
  relation["natural"="cliff"](${b});
  node["geological"="cliff"](${b});
  way["geological"="cliff"](${b});
  relation["geological"="cliff"](${b});
  node["man_made"="embankment"](${b});
  way["man_made"="embankment"](${b});
  relation["man_made"="embankment"](${b});
  node["natural"="scree"](${b});
  way["natural"="scree"](${b});
  relation["natural"="scree"](${b});
);
out center tags;`;
}

function bikeConflictQuery(bbox: Bbox): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:22];
(
  way["highway"="cycleway"](${b});
  way["bicycle"="designated"](${b});
  way["cycleway"](${b});
);
out center tags;`;
}

function offLeashQuery(bbox: Bbox): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:22];
(
  node["leisure"="dog_park"](${b});
  way["leisure"="dog_park"](${b});
  relation["leisure"="dog_park"](${b});
  node["designation"="dog_off_leash"](${b});
  way["designation"="dog_off_leash"](${b});
  relation["designation"="dog_off_leash"](${b});
  node["dogs"="off_leash"](${b});
  way["dogs"="off_leash"](${b});
  relation["dogs"="off_leash"](${b});
);
out center tags;`;
}

function localRoadCrossings(index: OsmLocalIndex, bbox: Bbox): OsmElement[] {
  return filterByBbox(index, bbox).filter((el) => {
    const tags = el.tags ?? {};
    return tags.highway === "crossing" || tags.crossing != null;
  });
}

function localNearbyHighways(index: OsmLocalIndex, bbox: Bbox): OsmElement[] {
  return filterByBbox(index, bbox).filter((el) => {
    if (el.type !== "way" && !el.id.startsWith("w")) return false;
    const tags = el.tags ?? {};
    return tags.highway != null;
  });
}

function localWaterCrossings(index: OsmLocalIndex, bbox: Bbox): OsmElement[] {
  return filterByBbox(index, bbox).filter((el) => {
    const tags = el.tags ?? {};
    if (tags.ford != null) return true;
    if (tags.highway === "ford") return true;
    if (tags.bridge != null) return true;
    if (tags.waterway === "stream" && (tags.crossing != null || tags.ford != null)) return true;
    return false;
  });
}

function localCliff(index: OsmLocalIndex, bbox: Bbox): OsmElement[] {
  return filterByBbox(index, bbox).filter((el) => {
    const tags = el.tags ?? {};
    if (tags.natural === "cliff" || tags.natural === "scree") return true;
    if (tags.geological === "cliff") return true;
    if (tags.man_made === "embankment") return true;
    return false;
  });
}

function localBikeConflict(index: OsmLocalIndex, bbox: Bbox): OsmElement[] {
  return filterByBbox(index, bbox).filter((el) => {
    if (el.type !== "way" && !el.id.startsWith("w")) return false;
    const tags = el.tags ?? {};
    return tags.highway === "cycleway" || tags.bicycle === "designated" || tags.cycleway != null;
  });
}

function localOffLeash(index: OsmLocalIndex, bbox: Bbox): OsmElement[] {
  return filterByBbox(index, bbox).filter((el) => {
    const tags = el.tags ?? {};
    return tags.leisure === "dog_park" || tags.designation === "dog_off_leash" || tags.dogs === "off_leash";
  });
}

function scoreAndClass(counts: HazardCounts): { score: number; cls: "low" | "medium" | "high"; reasons: string[] } {
  let score = 0;
  const reasons: { weight: number; text: string }[] = [];

  if (counts.roadCrossings.riskyCount >= 2) {
    score += 0.25;
    reasons.push({ weight: 0.25, text: `${counts.roadCrossings.riskyCount} risky road crossings near trail` });
  }
  if (counts.roadCrossings.count >= 5) {
    score += 0.15;
    reasons.push({ weight: 0.15, text: `${counts.roadCrossings.count} mapped road crossings overall` });
  }
  if (counts.cliffOrSteepEdge.count >= 1) {
    score += 0.2;
    reasons.push({ weight: 0.2, text: `${counts.cliffOrSteepEdge.count} cliff/steep-edge proxies nearby` });
  }
  if (counts.waterCrossings.count >= 2) {
    score += 0.15;
    reasons.push({ weight: 0.15, text: `${counts.waterCrossings.count} water crossing points` });
  }
  if (counts.bikeConflictProxy.count >= 3) {
    score += 0.1;
    reasons.push({ weight: 0.1, text: `${counts.bikeConflictProxy.count} cycleway conflict proxies` });
  }
  if (counts.offLeashConflictProxy.count >= 1) {
    score += 0.1;
    reasons.push({ weight: 0.1, text: `${counts.offLeashConflictProxy.count} off-leash encounter proxy points` });
  }

  const clamped = clamp01(score);
  const cls: "low" | "medium" | "high" = clamped < 0.25 ? "low" : clamped < 0.55 ? "medium" : "high";

  reasons.sort((a, b) => b.weight - a.weight);
  const bullets = reasons.map((r) => r.text).slice(0, 6);

  if (bullets.length < 3) {
    bullets.push(`Road crossings: ${counts.roadCrossings.count} total, ${counts.roadCrossings.riskyCount} risky`);
  }
  if (bullets.length < 3) {
    bullets.push(`Bike conflict proxy count: ${counts.bikeConflictProxy.count}`);
  }
  if (bullets.length < 3) {
    bullets.push("Off-leash conflict is a map-based proxy, not real-time behavior.");
  }

  return { score: round2(clamped), cls, reasons: bullets.slice(0, 6) };
}

function toHazardPoints(candidates: HazardCandidate[], lines: MultiLineCoords): HazardPoint[] {
  const points: HazardPoint[] = [];
  for (const c of candidates) {
    const dist = distanceToMultiLineM(c.coord, lines);
    points.push({
      kind: c.kind,
      name: c.name,
      osmId: c.osmId,
      osmType: c.osmType,
      tags: c.tags,
      location: { type: "Point", coordinates: c.coord },
      distanceToTrailMeters: round2(dist),
    });
  }
  points.sort((a, b) => a.distanceToTrailMeters - b.distanceToTrailMeters);
  return points;
}

export async function enrichSystemHazards(system: SystemLike, ctx: HazardsContext): Promise<HazardsResult> {
  const segs = linkedSegments(system, ctx.segments);
  if (segs.length === 0) {
    return { ok: false, reason: "no linked segments", meta: { cacheHit: false, samplePointCount: 0 } };
  }

  const lines: MultiLineCoords = [];
  for (const seg of segs) lines.push(...flattenCoords(seg.geometry));
  if (lines.length === 0) {
    return { ok: false, reason: "no usable geometry", meta: { cacheHit: false, samplePointCount: 0 } };
  }

  const bbox = normalizeBbox(system.bbox) ?? bboxFromLines(lines);
  if (!bbox) {
    return { ok: false, reason: "no bbox", meta: { cacheHit: false, samplePointCount: 0 } };
  }

  const fingerprint = buildFingerprint(system, bbox, segs);
  const cacheDir = join(ctx.rootDir, ".cache", "hazards");
  const safeKey = basename(systemKey(system)).replace(/[^a-zA-Z0-9._-]/g, "_");
  const cachePath = join(cacheDir, `${safeKey}-${fingerprint}.json`);

  const cached = await readCache(cachePath);
  if (cached && cached.fingerprint === fingerprint) {
    ctx.logger?.(`[hazards] provider=overpass cache=hit points=${cached.summary.hazardPoints.length}`);
    return {
      ok: true,
      summary: cached.summary,
      meta: { cacheHit: true, samplePointCount: cached.summary.hazardPoints.length },
    };
  }

  const expandedRoad = expandBboxMeters(bbox, 60);
  const expandedOffLeash = expandBboxMeters(bbox, 600);

  let roadCrossingEls: any[];
  let highwaysEls: any[];
  let waterEls: any[];
  let cliffEls: any[];
  let bikeEls: any[];
  let offLeashEls: any[];

  if (ctx.localIndex) {
    roadCrossingEls = localRoadCrossings(ctx.localIndex, expandedRoad);
    highwaysEls = localNearbyHighways(ctx.localIndex, expandedRoad);
    waterEls = localWaterCrossings(ctx.localIndex, expandedRoad);
    cliffEls = localCliff(ctx.localIndex, expandBboxMeters(bbox, 80));
    bikeEls = localBikeConflict(ctx.localIndex, expandBboxMeters(bbox, 40));
    offLeashEls = localOffLeash(ctx.localIndex, expandedOffLeash);
    ctx.logger?.(`[hazards] provider=local`);
  } else {
    const overpass = ctx.overpass ?? defaultOverpass;
    [
      roadCrossingEls,
      highwaysEls,
      waterEls,
      cliffEls,
      bikeEls,
      offLeashEls,
    ] = await Promise.all([
      overpass(roadCrossingsQuery(expandedRoad)),
      overpass(nearbyHighwaysQuery(expandedRoad)),
      overpass(waterCrossingsQuery(expandedRoad)),
      overpass(cliffQuery(expandBboxMeters(bbox, 80))),
      overpass(bikeConflictQuery(expandBboxMeters(bbox, 40))),
      overpass(offLeashQuery(expandedOffLeash)),
    ]);
  }

  const centroid = centroidFromSystem(system, lines);

  const roadCandidates = dedupeCandidates(
    roadCrossingEls
      .map((e) => toCandidate("road_crossing", e))
      .filter((v): v is HazardCandidate => v !== null)
  ).filter((c) => distanceToMultiLineM(c.coord, lines) <= 30);

  const highwayWays = highwaysEls
    .filter((e: any) => String(e?.type ?? "") === "way")
    .map((e: any) => ({ tags: stringTags(e?.tags), coords: wayCoordsFromElement(e) }))
    .filter((w: { tags: Record<string, string>; coords: Coord[] }) => w.coords.length >= 2);

  const riskyRoadSet = new Set<string>();
  for (const rc of roadCandidates) {
    const rcIsRiskyByOwnTag = riskyHighwayTags(rc.tags);
    if (rcIsRiskyByOwnTag) {
      riskyRoadSet.add(rc.osmId);
      continue;
    }

    for (const way of highwayWays) {
      if (!riskyHighwayTags(way.tags)) continue;
      const d = minDistanceToWay(rc.coord, way.coords);
      if (d <= 30) {
        riskyRoadSet.add(rc.osmId);
        break;
      }
    }
  }

  const waterCandidates = dedupeCandidates(
    waterEls
      .map((e) => toCandidate("water_crossing", e))
      .filter((v): v is HazardCandidate => v !== null)
  ).filter((c) => distanceToMultiLineM(c.coord, lines) <= 30);

  const cliffCandidates = dedupeCandidates(
    cliffEls
      .map((e) => toCandidate("cliff_edge", e))
      .filter((v): v is HazardCandidate => v !== null)
  ).filter((c) => distanceToMultiLineM(c.coord, lines) <= 50);

  const bikeCandidates = dedupeCandidates(
    bikeEls
      .map((e) => toCandidate("bike_conflict", e))
      .filter((v): v is HazardCandidate => v !== null)
  ).filter((c) => distanceToMultiLineM(c.coord, lines) <= 25);

  const offLeashCandidates = dedupeCandidates(
    offLeashEls
      .map((e) => toCandidate("offleash_conflict_proxy", e))
      .filter((v): v is HazardCandidate => v !== null)
  ).filter((c) => {
    const dTrail = distanceToMultiLineM(c.coord, lines);
    const centroidHit = centroid ? haversineM(centroid, c.coord) <= 500 : false;
    const alongTrailHit = dTrail <= 200;
    return centroidHit || alongTrailHit;
  });

  const counts: HazardCounts = {
    roadCrossings: { count: roadCandidates.length, riskyCount: riskyRoadSet.size },
    waterCrossings: { count: waterCandidates.length },
    cliffOrSteepEdge: { count: cliffCandidates.length },
    bikeConflictProxy: { count: bikeCandidates.length },
    offLeashConflictProxy: { count: offLeashCandidates.length },
  };

  const scoring = scoreAndClass(counts);
  const allPoints = toHazardPoints(
    [
      ...roadCandidates,
      ...waterCandidates,
      ...cliffCandidates,
      ...bikeCandidates,
      ...offLeashCandidates,
    ],
    lines
  );

  const summary: HazardsSummary = {
    hazardsLastComputedAt: Date.now(),
    hazardsScore: scoring.score,
    hazardsClass: scoring.cls,
    hazardsReasons: scoring.reasons,
    hazards: counts,
    hazardPoints: allPoints,
  };

  await mkdir(cacheDir, { recursive: true });
  await writeCache(cachePath, { fingerprint, summary });
  const provider = ctx.localIndex ? "local" : "overpass";
  ctx.logger?.(`[hazards] provider=${provider} cache=miss points=${allPoints.length}`);

  return {
    ok: true,
    summary,
    meta: { cacheHit: false, samplePointCount: allPoints.length },
  };
}
