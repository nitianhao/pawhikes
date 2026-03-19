import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, join } from "path";
import { filterByBbox, type OsmLocalIndex, type OsmElement } from "../../lib/osmLocal.js";

type Coord = [number, number];
type Bbox = [number, number, number, number];
type Source = "osm" | "google" | "derived" | "unknown";
type AccessClass = "public" | "permissive" | "private" | "restricted" | "unknown";
type AgencyClass = "city" | "county" | "state" | "federal" | "private" | "unknown";

type SegmentLike = {
  id?: string;
  systemRef?: string;
  systemSlug?: string;
  geometry?: unknown;
};

type TrailHeadLike = {
  id: string;
  name?: string;
  systemRef?: string;
  trailSlug?: string;
  googleWeekdayText?: unknown;
  googleOpenNow?: unknown;
  googleMatchConfidence?: unknown;
  googleReviewCount?: unknown;
  googleWebsite?: unknown;
  parking?: unknown;
  raw?: unknown;
};

type SystemLike = {
  id?: string;
  slug?: string;
  extSystemRef?: string;
  bbox?: unknown;
  centroid?: unknown;
  segmentCount?: unknown;
  lengthMilesTotal?: unknown;
};

type HeadDerived = {
  headId: string;
  headName: string;
  payload: Record<string, any>;
  hasHours: boolean;
  feeLikely: boolean | null;
  accessClass: AccessClass;
};

export type AccessRulesSystemSummary = {
  accessRulesLastComputedAt: number;
  accessRulesScore: number;
  accessRulesClass: "easy" | "some_constraints" | "restricted" | "unknown";
  accessRulesReasons: string[];
  accessRules: {
    hours: {
      known: boolean;
      openingHoursText?: string[] | null;
      source: Source;
      confidence: number;
    };
    fees: {
      feeLikely: boolean;
      feeText?: string | null;
      source: Source;
      confidence: number;
    };
    permit: {
      permitRequiredLikely: boolean;
      permitText?: string | null;
      source: "osm" | "derived" | "unknown";
      confidence: number;
    };
    access: {
      accessClass: AccessClass;
      notes?: string | null;
      source: "osm" | "derived" | "unknown";
      confidence: number;
    };
    landManager: {
      operator?: string | null;
      owner?: string | null;
      agencyClass?: AgencyClass;
      source: "osm" | "derived" | "unknown";
      confidence: number;
    };
  };
};

export type AccessRulesResult =
  | {
      ok: true;
      systemSummary: AccessRulesSystemSummary;
      headUpdates: Array<{ headId: string; payload: Record<string, any>; headName: string; hasHours: boolean; feeLikely: boolean | null }>;
      meta: { cacheHit: boolean };
    }
  | { ok: false; reason: string; meta: { cacheHit: boolean } };

export type AccessRulesContext = {
  segments: SegmentLike[];
  trailHeads: TrailHeadLike[];
  rootDir: string;
  overpass?: (query: string) => Promise<any[]>;
  localIndex?: OsmLocalIndex | null;
  logger?: (line: string) => void;
};

type CachePayload = {
  fingerprint: string;
  systemSummary: AccessRulesSystemSummary;
  headUpdates: Array<{ headId: string; payload: Record<string, any>; headName: string; hasHours: boolean; feeLikely: boolean | null }>;
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
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

function flattenLines(geometry: unknown): Coord[][] {
  if (!geometry || typeof geometry !== "object") return [];
  const g = geometry as any;
  if (g.type === "LineString" && Array.isArray(g.coordinates)) {
    const out: Coord[] = [];
    for (const pt of g.coordinates) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lon = asNumber(pt[0]);
      const lat = asNumber(pt[1]);
      if (lon === null || lat === null) continue;
      out.push([lon, lat]);
    }
    return out.length > 1 ? [out] : [];
  }
  if (g.type === "MultiLineString" && Array.isArray(g.coordinates)) {
    const all: Coord[][] = [];
    for (const line of g.coordinates) {
      if (!Array.isArray(line)) continue;
      const out: Coord[] = [];
      for (const pt of line) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const lon = asNumber(pt[0]);
        const lat = asNumber(pt[1]);
        if (lon === null || lat === null) continue;
        out.push([lon, lat]);
      }
      if (out.length > 1) all.push(out);
    }
    return all;
  }
  return [];
}

function bboxFromLines(lines: Coord[][]): Bbox | null {
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

function centroidFromSystemOrLines(system: SystemLike, lines: Coord[][]): Coord | null {
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
  return count > 0 ? [lonSum / count, latSum / count] : null;
}

function bboxStr([minLon, minLat, maxLon, maxLat]: Bbox): string {
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

function linkedHeads(system: SystemLike, heads: TrailHeadLike[]): TrailHeadLike[] {
  const ref = String(system.extSystemRef ?? "").trim();
  const slug = String(system.slug ?? "").trim().toLowerCase();
  let out = heads.filter((h) => ref && String(h.systemRef ?? "").trim() === ref);
  if (out.length === 0 && slug) {
    out = heads.filter((h) => String(h.trailSlug ?? "").trim().toLowerCase() === slug);
  }
  return out;
}

function extractTags(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const read = (obj: any): void => {
    if (!obj || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue;
      out[String(k)] = String(v);
    }
  };

  if (raw && typeof raw === "object") {
    const r: any = raw;
    read(r.tags);
    read(r.properties);
    read(r.raw?.tags);
  }
  return out;
}

function parseWeekdayText(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const vals = value.map((v) => String(v)).filter((v) => v.trim() !== "");
    return vals.length > 0 ? vals : null;
  }
  return null;
}

function parseFeeValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (["yes", "true", "paid", "fee", "1"].includes(s)) return true;
    if (["no", "false", "free", "0"].includes(s)) return false;
  }
  return null;
}

function toAccessClass(v: unknown): AccessClass {
  const s = String(v ?? "").trim().toLowerCase();
  if (["yes", "public", "destination"].includes(s)) return "public";
  if (s === "permissive") return "permissive";
  if (s === "private") return "private";
  if (s === "no" || s === "permit") return "restricted";
  return "unknown";
}

function agencyFromText(text: string | null | undefined): AgencyClass {
  const t = String(text ?? "").toLowerCase();
  if (!t) return "unknown";
  if (t.includes("national park") || t.includes("u.s.") || t.includes("federal")) return "federal";
  if (t.includes("state") || t.includes("texas parks") || t.includes("txdot")) return "state";
  if (t.includes("county")) return "county";
  if (t.includes("city") || t.includes("austin")) return "city";
  if (t.includes("hoa") || t.includes("llc") || t.includes("inc") || t.includes("private")) return "private";
  return "unknown";
}

function agencyFromWebsite(website: unknown): AgencyClass {
  if (typeof website !== "string" || website.trim() === "") return "unknown";
  try {
    const u = new URL(website);
    const host = u.hostname.toLowerCase();
    if (host.endsWith(".gov")) {
      if (host.includes("nps.gov") || host.includes("usda.gov") || host.includes("blm.gov")) return "federal";
      if (host.includes("state") || host.includes("texas")) return "state";
      if (host.includes("county")) return "county";
      return "city";
    }
  } catch {
    return "unknown";
  }
  return "unknown";
}

function representativeHours(headsWithHours: Array<{ hours: string[]; score: number }>): string[] | null {
  if (headsWithHours.length === 0) return null;
  const counts = new Map<string, { count: number; hours: string[]; bestScore: number }>();
  for (const h of headsWithHours) {
    const key = JSON.stringify(h.hours);
    const prev = counts.get(key);
    if (!prev) {
      counts.set(key, { count: 1, hours: h.hours, bestScore: h.score });
    } else {
      prev.count++;
      prev.bestScore = Math.max(prev.bestScore, h.score);
    }
  }

  let best: { count: number; hours: string[]; bestScore: number } | null = null;
  for (const v of counts.values()) {
    if (!best || v.count > best.count || (v.count === best.count && v.bestScore > best.bestScore)) {
      best = v;
    }
  }
  return best?.hours ?? null;
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
          await sleep(4000 * attempt);
          continue;
        }
        if (!resp.ok) continue;
        const json: any = await resp.json();
        return Array.isArray(json?.elements) ? json.elements : [];
      } catch {
        if (attempt < RETRIES) await sleep(2000 * attempt);
      }
    }
  }
  return [];
}

function accessRulesQuery(bbox: Bbox): string {
  const b = bboxStr(bbox);
  return `[out:json][timeout:22];
(
  relation["leisure"="park"](${b});
  way["leisure"="park"](${b});
  relation["boundary"="protected_area"](${b});
  way["boundary"="protected_area"](${b});
  relation["opening_hours"](${b});
  way["opening_hours"](${b});
  relation["operator"](${b});
  way["operator"](${b});
  relation["owner"](${b});
  way["owner"](${b});
  node["amenity"="parking"](${b});
  way["amenity"="parking"](${b});
  relation["amenity"="parking"](${b});
  node["access"](${b});
  way["access"](${b});
  relation["access"](${b});
  node["permit"](${b});
  way["permit"](${b});
  relation["permit"](${b});
  node["fee"](${b});
  way["fee"](${b});
  relation["fee"](${b});
);
out center tags;`;
}

function localAccessRules(index: OsmLocalIndex, bbox: Bbox): OsmElement[] {
  return filterByBbox(index, bbox).filter((el) => {
    const tags = el.tags ?? {};
    if (tags.leisure === "park") return true;
    if (tags.boundary === "protected_area") return true;
    if (tags.opening_hours != null) return true;
    if (tags.operator != null) return true;
    if (tags.owner != null) return true;
    if (tags.amenity === "parking") return true;
    if (tags.access != null) return true;
    if (tags.permit != null) return true;
    if (tags.fee != null) return true;
    return false;
  });
}

function elementCoord(el: any): Coord | null {
  const lon = asNumber(el?.lon ?? el?.center?.lon);
  const lat = asNumber(el?.lat ?? el?.center?.lat);
  if (lon === null || lat === null) return null;
  return [lon, lat];
}

function nearestByTag(elements: any[], centroid: Coord | null, tagKey: string): any | null {
  const withTag = elements.filter((el) => el?.tags && el.tags[tagKey] != null);
  if (withTag.length === 0) return null;
  if (!centroid) return withTag[0];

  let best: any = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const el of withTag) {
    const c = elementCoord(el);
    if (!c) continue;
    const d = haversineMeters(centroid, c);
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  }
  return best ?? withTag[0];
}

function toHeadDerived(head: TrailHeadLike): HeadDerived {
  const tags = extractTags(head.raw);
  const payload: Record<string, any> = { accessRulesLastComputedAt: Date.now() };

  const hours = parseWeekdayText(head.googleWeekdayText);
  const hasHours = Array.isArray(hours) && hours.length > 0;
  if (hasHours) payload.headHoursText = hours;

  if (typeof head.googleOpenNow === "boolean") payload.headOpenNow = head.googleOpenNow;

  const parking: any = head.parking && typeof head.parking === "object" ? head.parking : {};
  let feeLikely: boolean | null = parseFeeValue(parking.fee);
  let feeReason: string | null = null;

  if (feeLikely === null) {
    feeLikely = parseFeeValue(tags.fee);
    if (feeLikely !== null) feeReason = "OSM fee tag near trailhead";
  } else {
    feeReason = "Parking fee field";
  }

  if (feeLikely !== null) payload.headFeeLikely = feeLikely;
  if (feeReason) payload.headFeeReason = feeReason;

  let accessClass = toAccessClass(tags.access ?? parking.access);
  if (accessClass !== "unknown") payload.headAccessClass = accessClass;

  const operator = tags.operator ?? null;
  const owner = tags.owner ?? null;
  let agencyClass: AgencyClass = agencyFromText(operator || owner);
  if (agencyClass === "unknown") {
    agencyClass = agencyFromWebsite(head.googleWebsite);
  }

  if (operator || owner || agencyClass !== "unknown") {
    payload.headLandManager = {
      operator,
      owner,
      agencyClass,
    };
  }

  return {
    headId: head.id,
    headName: String(head.name ?? head.id),
    payload,
    hasHours,
    feeLikely,
    accessClass,
  };
}

function buildFingerprint(system: SystemLike, linkedHeadsCount: number, parkingCount: number): string {
  const bbox = normalizeBbox(system.bbox);
  const bboxKey = bbox ? bbox.map((n) => n.toFixed(6)).join(",") : "no-bbox";
  const segCount = asNumber(system.segmentCount) ?? 0;
  const base = `${bboxKey}|segments:${segCount}|heads:${linkedHeadsCount}|parking:${parkingCount}`;
  return createHash("sha1").update(base, "utf8").digest("hex");
}

async function readCache(path: string): Promise<CachePayload | null> {
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.fingerprint && parsed.systemSummary && parsed.headUpdates) {
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

export async function enrichSystemAccessRules(system: SystemLike, ctx: AccessRulesContext): Promise<AccessRulesResult> {
  const segs = linkedSegments(system, ctx.segments);
  const lines: Coord[][] = [];
  for (const seg of segs) lines.push(...flattenLines(seg.geometry));

  const linked = linkedHeads(system, ctx.trailHeads);
  const parkingCount = linked.filter((h) => h.parking && typeof h.parking === "object").length;

  const fingerprint = buildFingerprint(system, linked.length, parkingCount);
  const cacheDir = join(ctx.rootDir, ".cache", "access_rules");
  const safeKey = basename(systemKey(system)).replace(/[^a-zA-Z0-9._-]/g, "_");
  const cachePath = join(cacheDir, `${safeKey}-${fingerprint}.json`);

  const cached = await readCache(cachePath);
  if (cached && cached.fingerprint === fingerprint) {
    ctx.logger?.(`[access_rules] cache=hit heads=${cached.headUpdates.length}`);
    return {
      ok: true,
      systemSummary: cached.systemSummary,
      headUpdates: cached.headUpdates,
      meta: { cacheHit: true },
    };
  }

  const headDerived = linked.map(toHeadDerived);

  const headsWithHours = headDerived
    .filter((h) => h.hasHours)
    .map((h) => {
      const head = linked.find((x) => x.id === h.headId);
      const hours = parseWeekdayText(head?.googleWeekdayText) ?? [];
      const score = (asNumber(head?.googleMatchConfidence) ?? 0) + (asNumber(head?.googleReviewCount) ?? 0) / 1000;
      return { hours, score };
    });

  const bbox = normalizeBbox(system.bbox) ?? bboxFromLines(lines);
  const centroid = centroidFromSystemOrLines(system, lines);

  let osmElements: any[] = [];
  if (bbox) {
    if (ctx.localIndex) {
      osmElements = localAccessRules(ctx.localIndex, bbox);
      ctx.logger?.(`[access_rules] provider=local elements=${osmElements.length}`);
    } else {
      const overpass = ctx.overpass ?? defaultOverpass;
      osmElements = await overpass(accessRulesQuery(bbox));
    }
  }

  const hoursFromHeads = headsWithHours.length > 0 && headsWithHours.length >= Math.ceil(linked.length * 0.5);
  const representative = representativeHours(headsWithHours);

  let hoursSource: Source = "unknown";
  let hoursConfidence = 0;
  let openingHoursText: string[] | null = null;

  if (hoursFromHeads && representative) {
    hoursSource = "google";
    hoursConfidence = 0.8;
    openingHoursText = representative;
  } else {
    const openEl = nearestByTag(osmElements, centroid, "opening_hours");
    if (openEl?.tags?.opening_hours) {
      const c = elementCoord(openEl);
      const near = c && centroid ? haversineMeters(c, centroid) <= 200 : true;
      if (near || !centroid) {
        hoursSource = "osm";
        hoursConfidence = 0.6;
        openingHoursText = [String(openEl.tags.opening_hours)];
      }
    }
  }

  const anyHeadFeeTrue = headDerived.some((h) => h.feeLikely === true);
  let feesSource: Source = "unknown";
  let feesConfidence = 0;
  let feeLikely = false;
  let feeText: string | null = null;

  if (anyHeadFeeTrue) {
    feeLikely = true;
    feesSource = "derived";
    feesConfidence = 0.8;
    feeText = "Parking fee possible at some entrances";
  } else {
    const feeEl = osmElements.find((el) => {
      const tags = el?.tags ?? {};
      const fee = parseFeeValue(tags.fee);
      if (fee !== true) return false;
      if (!centroid) return true;
      const c = elementCoord(el);
      if (!c) return false;
      return haversineMeters(c, centroid) <= 200;
    });
    if (feeEl) {
      feeLikely = true;
      feesSource = "osm";
      feesConfidence = 0.6;
      feeText = "OSM parking fee tag near trail access";
    }
  }

  let permitSource: "osm" | "derived" | "unknown" = "unknown";
  let permitConfidence = 0;
  let permitLikely = false;
  let permitText: string | null = null;

  const permitEl = osmElements.find((el) => {
    const tags = el?.tags ?? {};
    const permitTag = String(tags.permit ?? tags.access ?? "").toLowerCase();
    if (permitTag === "permit") return true;
    if (typeof tags.permit === "string" && tags.permit.trim() !== "") return true;
    return false;
  });
  if (permitEl) {
    permitLikely = true;
    permitSource = "osm";
    permitConfidence = 0.6;
    permitText = "Permit-related access tags found in OSM";
  }

  let accessClass: AccessClass = "unknown";
  let accessSource: "osm" | "derived" | "unknown" = "unknown";
  let accessConfidence = 0;
  let accessNotes: string | null = null;

  const accessTags = osmElements
    .map((el) => String(el?.tags?.access ?? "").toLowerCase())
    .filter((s) => s !== "");

  if (accessTags.includes("private")) {
    accessClass = "private";
    accessSource = "osm";
    accessConfidence = 0.7;
    accessNotes = "OSM access=private near trail/entrances";
  } else if (accessTags.includes("no") || accessTags.includes("permit")) {
    accessClass = "restricted";
    accessSource = "osm";
    accessConfidence = 0.65;
    accessNotes = "OSM access restrictions near trail/entrances";
  } else if (accessTags.includes("permissive")) {
    accessClass = "permissive";
    accessSource = "osm";
    accessConfidence = 0.65;
    accessNotes = "OSM access=permissive";
  } else if (accessTags.includes("yes") || accessTags.includes("public")) {
    accessClass = "public";
    accessSource = "osm";
    accessConfidence = 0.65;
    accessNotes = "OSM explicitly marks public access";
  }

  let landOperator: string | null = null;
  let landOwner: string | null = null;
  let landAgency: AgencyClass = "unknown";
  let landSource: "osm" | "derived" | "unknown" = "unknown";
  let landConfidence = 0;

  const opEl = nearestByTag(osmElements, centroid, "operator");
  const ownEl = nearestByTag(osmElements, centroid, "owner");

  if (opEl?.tags?.operator || ownEl?.tags?.owner) {
    landOperator = opEl?.tags?.operator ? String(opEl.tags.operator) : null;
    landOwner = ownEl?.tags?.owner ? String(ownEl.tags.owner) : null;
    landAgency = agencyFromText(landOperator || landOwner);
    landSource = "osm";
    landConfidence = 0.65;
  } else {
    const bestWebsite = linked
      .map((h) => (typeof h.googleWebsite === "string" ? h.googleWebsite : ""))
      .find((w) => w !== "");
    const derivedAgency = agencyFromWebsite(bestWebsite);
    if (derivedAgency !== "unknown") {
      landAgency = derivedAgency;
      landSource = "derived";
      landConfidence = 0.3;
    }
  }

  let score = 0.2;
  if (hoursSource !== "unknown" && openingHoursText && openingHoursText.length > 0) score += 0.25;
  if (accessClass === "public" || accessClass === "permissive") score += 0.25;
  if (feeLikely) score -= 0.25;
  if (accessClass === "private" || accessClass === "restricted") score -= 0.35;
  if (permitLikely) score -= 0.15;
  score = clamp01(score);

  const unknownEverything =
    (hoursSource === "unknown" || !openingHoursText || openingHoursText.length === 0) &&
    feesSource === "unknown" &&
    permitSource === "unknown" &&
    accessClass === "unknown" &&
    landSource === "unknown";

  let accessRulesClass: "easy" | "some_constraints" | "restricted" | "unknown" = "unknown";
  if (!unknownEverything) {
    if (score >= 0.65) accessRulesClass = "easy";
    else if (score >= 0.35) accessRulesClass = "some_constraints";
    else accessRulesClass = "restricted";
  }

  const reasons: string[] = [];
  if (hoursSource === "google") reasons.push("Hours available from Google Places at main entrances.");
  else if (hoursSource === "osm") reasons.push("Opening hours found in OSM near trail area (likely)." );
  else reasons.push("No reliable opening-hours source found.");

  if (feeLikely) {
    reasons.push(feesConfidence < 0.6 ? "Parking fee is possible (low-confidence source)." : "Parking fee possible at some entrances.");
  } else {
    reasons.push("No fee signal found in linked head/OSM access data.");
  }

  if (permitLikely) reasons.push("Access may require permit based on OSM permit/access tags.");
  if (accessClass === "private" || accessClass === "restricted") reasons.push("Access marked as private/restricted in OSM near entrances.");
  if (accessClass === "public" || accessClass === "permissive") reasons.push(`Access explicitly tagged as ${accessClass} in OSM.`);

  if (landSource !== "unknown") {
    const agencyCue = landAgency !== "unknown" ? `${landAgency}` : "unknown agency";
    const confidenceCue = landConfidence < 0.6 ? " (low confidence)" : "";
    reasons.push(`Land manager: ${agencyCue}${confidenceCue}.`);
  }

  while (reasons.length < 3) reasons.push("Access details remain limited; verify posted signage on arrival.");

  const systemSummary: AccessRulesSystemSummary = {
    accessRulesLastComputedAt: Date.now(),
    accessRulesScore: round2(score),
    accessRulesClass,
    accessRulesReasons: reasons.slice(0, 6),
    accessRules: {
      hours: {
        known: Boolean(openingHoursText && openingHoursText.length > 0),
        openingHoursText,
        source: hoursSource,
        confidence: round2(hoursConfidence),
      },
      fees: {
        feeLikely,
        feeText,
        source: feesSource,
        confidence: round2(feesConfidence),
      },
      permit: {
        permitRequiredLikely: permitLikely,
        permitText,
        source: permitSource,
        confidence: round2(permitConfidence),
      },
      access: {
        accessClass,
        notes: accessNotes,
        source: accessSource,
        confidence: round2(accessConfidence),
      },
      landManager: {
        operator: landOperator,
        owner: landOwner,
        agencyClass: landAgency,
        source: landSource,
        confidence: round2(landConfidence),
      },
    },
  };

  const headUpdates = headDerived.map((h) => ({
    headId: h.headId,
    payload: h.payload,
    headName: h.headName,
    hasHours: h.hasHours,
    feeLikely: h.feeLikely,
  }));

  await mkdir(cacheDir, { recursive: true });
  await writeCache(cachePath, { fingerprint, systemSummary, headUpdates });
  ctx.logger?.(`[access_rules] cache=miss heads=${headUpdates.length}`);

  return {
    ok: true,
    systemSummary,
    headUpdates,
    meta: { cacheHit: false },
  };
}
