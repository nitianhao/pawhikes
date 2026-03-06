import { createHash } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, join } from "path";

type Coord = [number, number]; // [lon, lat]
type Bbox = [number, number, number, number];

type SegmentLike = {
  id?: string;
  systemRef?: string;
  systemSlug?: string;
  lengthMiles?: number;
  geometry?: unknown;
};

type SystemLike = {
  id?: string;
  slug?: string;
  extSystemRef?: string;
  bbox?: unknown;
  lengthMilesTotal?: number;
  crowdSignals?: unknown;
};

type RouteType = "loop" | "out_and_back" | "lollipop" | "network" | "point_to_point" | "unknown";
type BailoutClass = "low" | "medium" | "high";
type Anchor = "start" | "end" | "centroid";

type GraphNode = {
  key: string;
  coord: Coord;
  degree: number;
};

type Edge = {
  a: string;
  b: string;
  lengthMiles: number;
};

export type RouteStructureSummary = {
  structureLastComputedAt: number;
  routeType: RouteType;
  bailoutScore: number;
  bailoutClass: BailoutClass;
  bailoutReasons: string[];
  accessPoints: {
    entranceCount: number;
    entranceDensityPerMile: number;
    maxGapBetweenEntrancesMiles: number;
  };
  loopStats: {
    hasLoop: boolean;
    loopCountEstimate: number;
    largestLoopMiles: number | null;
  };
  routeGraphStats: {
    nodeCount: number;
    edgeCount: number;
    intersectionCount: number;
    deadEndCount: number;
    componentCount: number;
  };
  bailoutPoints: Array<{
    kind: "entrance" | "intersection" | "dead_end";
    osmId?: string;
    name?: string | null;
    location: { type: "Point"; coordinates: [number, number] };
    anchor: Anchor;
    distanceToAnchorMeters: number;
  }>;
};

export type RouteStructureResult =
  | { ok: true; summary: RouteStructureSummary; meta: { cacheHit: boolean } }
  | { ok: false; reason: string; meta: { cacheHit: boolean } };

export type RouteStructureContext = {
  segments: SegmentLike[];
  rootDir: string;
  logger?: (line: string) => void;
};

type CachePayload = {
  fingerprint: string;
  summary: RouteStructureSummary;
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

function metersToMiles(m: number): number {
  return m / 1609.344;
}

function roundCoordKey(coord: Coord): string {
  const lon = coord[0].toFixed(5);
  const lat = coord[1].toFixed(5);
  return `${lon},${lat}`;
}

function keyToCoord(key: string): Coord {
  const [lon, lat] = key.split(",");
  return [Number(lon), Number(lat)];
}

function flattenLines(geometry: unknown): Coord[][] {
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
    const lines: Coord[][] = [];
    for (const inLine of g.coordinates) {
      if (!Array.isArray(inLine)) continue;
      const line: Coord[] = [];
      for (const pt of inLine) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const lon = asNumber(pt[0]);
        const lat = asNumber(pt[1]);
        if (lon === null || lat === null) continue;
        line.push([lon, lat]);
      }
      if (line.length > 1) lines.push(line);
    }
    return lines;
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

function systemSegments(system: SystemLike, segments: SegmentLike[]): SegmentLike[] {
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

function systemKey(system: SystemLike): string {
  return String(system.id ?? system.extSystemRef ?? system.slug ?? "unknown-system");
}

function buildFingerprint(system: SystemLike, segments: SegmentLike[]): string {
  const bbox = normalizeBbox(system.bbox);
  const bboxKey = bbox ? bbox.map((n) => n.toFixed(6)).join(",") : "no-bbox";
  const len = asNumber(system.lengthMilesTotal) ?? 0;
  const segKey = segments
    .map((s) => `${String(s.id ?? "")}@${String(s.lengthMiles ?? "")}`)
    .sort()
    .join("|");
  const base = `${bboxKey}|len:${len.toFixed(4)}|${segKey}`;
  return createHash("sha1").update(base, "utf8").digest("hex");
}

function graphFromSegments(segments: SegmentLike[]): {
  nodes: Map<string, GraphNode>;
  adjacency: Map<string, Set<string>>;
  edges: Edge[];
  firstCoord: Coord | null;
  lastCoord: Coord | null;
  totalMilesFromEdges: number;
} {
  const nodes = new Map<string, GraphNode>();
  const adjacency = new Map<string, Set<string>>();
  const edges: Edge[] = [];

  let firstCoord: Coord | null = null;
  let lastCoord: Coord | null = null;

  const upsertNode = (key: string): void => {
    if (!nodes.has(key)) nodes.set(key, { key, coord: keyToCoord(key), degree: 0 });
    if (!adjacency.has(key)) adjacency.set(key, new Set());
  };

  const addEdge = (a: string, b: string, lengthMiles: number): void => {
    if (a === b) return;
    upsertNode(a);
    upsertNode(b);
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
    edges.push({ a, b, lengthMiles });
  };

  for (const seg of segments) {
    const lines = flattenLines(seg.geometry);
    if (lines.length === 0) continue;

    const segLen = asNumber(seg.lengthMiles);
    for (const line of lines) {
      const start = line[0];
      const end = line[line.length - 1];
      if (!firstCoord) firstCoord = start;
      lastCoord = end;

      const aKey = roundCoordKey(start);
      const bKey = roundCoordKey(end);
      const fallbackLen = metersToMiles(haversineMeters(start, end));
      const lengthMiles = segLen !== null && segLen > 0 ? segLen / lines.length : fallbackLen;

      addEdge(aKey, bKey, lengthMiles);
    }
  }

  for (const [key, neighbors] of adjacency.entries()) {
    const node = nodes.get(key)!;
    node.degree = neighbors.size;
  }

  const totalMilesFromEdges = edges.reduce((sum, e) => sum + e.lengthMiles, 0);

  return { nodes, adjacency, edges, firstCoord, lastCoord, totalMilesFromEdges };
}

function componentCount(adjacency: Map<string, Set<string>>): number {
  const visited = new Set<string>();
  let count = 0;

  for (const node of adjacency.keys()) {
    if (visited.has(node)) continue;
    count++;
    const q = [node];
    visited.add(node);
    while (q.length > 0) {
      const cur = q.shift()!;
      for (const nxt of adjacency.get(cur) ?? []) {
        if (visited.has(nxt)) continue;
        visited.add(nxt);
        q.push(nxt);
      }
    }
  }

  return count;
}

function classifyRouteType(
  nodeCount: number,
  edgeCount: number,
  intersectionCount: number,
  deadEndCount: number,
  compCount: number,
  deadEnds: GraphNode[]
): RouteType {
  if (nodeCount === 0 || edgeCount === 0) return "unknown";
  if (compCount > 1) return edgeCount <= 2 ? "unknown" : "network";

  if (deadEndCount === 0 && edgeCount >= nodeCount) {
    return intersectionCount >= 3 ? "network" : "loop";
  }

  if (deadEndCount === 2 && intersectionCount === 0) {
    const a = deadEnds[0]?.coord;
    const b = deadEnds[1]?.coord;
    if (a && b) {
      const dMiles = metersToMiles(haversineMeters(a, b));
      return dMiles > 0.5 ? "point_to_point" : "out_and_back";
    }
    return "out_and_back";
  }

  if (deadEndCount === 1 && intersectionCount >= 1) return "lollipop";
  if (intersectionCount >= 3) return "network";

  return "unknown";
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function bailoutScoring(
  routeType: RouteType,
  entranceDensityPerMile: number,
  deadEndCount: number,
  intersectionCount: number,
  entranceProxy: boolean
): { score: number; cls: BailoutClass; reasons: string[] } {
  let score = 0.2;
  const reasons: Array<{ weight: number; text: string }> = [];

  if (entranceDensityPerMile >= 1.5) {
    score += 0.35;
    reasons.push({ weight: 0.35, text: `High access density (${round2(entranceDensityPerMile)}/mi).` });
  }
  if (["network", "loop", "lollipop"].includes(routeType)) {
    score += 0.2;
    reasons.push({ weight: 0.2, text: `Route structure (${routeType}) supports alternate exits.` });
  }
  if (deadEndCount <= 2) {
    score += 0.15;
    reasons.push({ weight: 0.15, text: `Low dead-end count (${deadEndCount}) improves bailout options.` });
  }
  if (intersectionCount >= 3) {
    score += 0.1;
    reasons.push({ weight: 0.1, text: `${intersectionCount} intersections create more turn-off choices.` });
  }

  if (entranceProxy) {
    reasons.push({ weight: 0.05, text: "Entrance count is estimated from graph topology (proxy)." });
  }

  reasons.sort((a, b) => b.weight - a.weight);
  const scoreClamped = round2(clamp01(score));
  const cls: BailoutClass = scoreClamped < 0.35 ? "low" : scoreClamped < 0.7 ? "medium" : "high";
  const bullets = reasons.map((r) => r.text).slice(0, 6);

  while (bullets.length < 3) {
    bullets.push("Graph-based route structure estimate using stored segment geometry.");
  }

  return { score: scoreClamped, cls, reasons: bullets };
}

function nearestAnchor(coord: Coord, anchors: Record<Anchor, Coord | null>): { anchor: Anchor; d: number } {
  let best: { anchor: Anchor; d: number } = { anchor: "centroid", d: Number.POSITIVE_INFINITY };
  for (const anchor of ["start", "end", "centroid"] as Anchor[]) {
    const p = anchors[anchor];
    if (!p) continue;
    const d = haversineMeters(coord, p);
    if (d < best.d) best = { anchor, d };
  }
  return best;
}

function toBailoutPoints(
  deadEnds: GraphNode[],
  intersections: GraphNode[],
  entranceNodes: GraphNode[],
  anchors: Record<Anchor, Coord | null>
): RouteStructureSummary["bailoutPoints"] {
  const points: RouteStructureSummary["bailoutPoints"] = [];

  for (const node of deadEnds) {
    const near = nearestAnchor(node.coord, anchors);
    points.push({
      kind: "dead_end",
      name: null,
      location: { type: "Point", coordinates: node.coord },
      anchor: near.anchor,
      distanceToAnchorMeters: round2(near.d),
    });
  }

  for (const node of intersections) {
    const near = nearestAnchor(node.coord, anchors);
    points.push({
      kind: "intersection",
      name: null,
      location: { type: "Point", coordinates: node.coord },
      anchor: near.anchor,
      distanceToAnchorMeters: round2(near.d),
    });
  }

  for (const node of entranceNodes) {
    const near = nearestAnchor(node.coord, anchors);
    points.push({
      kind: "entrance",
      name: null,
      location: { type: "Point", coordinates: node.coord },
      anchor: near.anchor,
      distanceToAnchorMeters: round2(near.d),
    });
  }

  points.sort((a, b) => a.distanceToAnchorMeters - b.distanceToAnchorMeters);
  return points.slice(0, 80);
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

export async function enrichSystemRouteStructure(
  system: SystemLike,
  ctx: RouteStructureContext
): Promise<RouteStructureResult> {
  const segs = systemSegments(system, ctx.segments);
  if (segs.length === 0) return { ok: false, reason: "no linked segments", meta: { cacheHit: false } };

  const fingerprint = buildFingerprint(system, segs);
  const cacheDir = join(ctx.rootDir, ".cache", "route_structure");
  const safeKey = basename(systemKey(system)).replace(/[^a-zA-Z0-9._-]/g, "_");
  const cachePath = join(cacheDir, `${safeKey}-${fingerprint}.json`);

  const cached = await readCache(cachePath);
  if (cached && cached.fingerprint === fingerprint) {
    ctx.logger?.(`[route_structure] cache=hit`);
    return { ok: true, summary: cached.summary, meta: { cacheHit: true } };
  }

  const graph = graphFromSegments(segs);
  const nodeCount = graph.nodes.size;
  const edgeCount = graph.edges.length;

  if (nodeCount === 0 || edgeCount === 0) {
    return { ok: false, reason: "no usable graph", meta: { cacheHit: false } };
  }

  const nodes = [...graph.nodes.values()];
  const intersections = nodes.filter((n) => n.degree >= 3);
  const deadEnds = nodes.filter((n) => n.degree === 1);
  const compCount = componentCount(graph.adjacency);

  const intersectionCount = intersections.length;
  const deadEndCount = deadEnds.length;

  const routeType = classifyRouteType(
    nodeCount,
    edgeCount,
    intersectionCount,
    deadEndCount,
    compCount,
    deadEnds
  );

  const loopsRaw = Math.max(0, edgeCount - nodeCount + compCount);
  const loopCountEstimate = Math.max(0, Math.min(10, loopsRaw));
  const hasLoop = loopCountEstimate > 0;

  const crowdSignals = system.crowdSignals as any;
  const existingEntranceCount = asNumber(crowdSignals?.entranceCount);
  const entranceProxy = existingEntranceCount === null;
  const entranceCount =
    existingEntranceCount !== null
      ? Math.max(0, Math.round(existingEntranceCount))
      : deadEndCount + Math.min(intersectionCount, 10);

  const lengthMilesTotal =
    asNumber(system.lengthMilesTotal) && (asNumber(system.lengthMilesTotal) as number) > 0
      ? (asNumber(system.lengthMilesTotal) as number)
      : graph.totalMilesFromEdges;

  const safeLen = Math.max(lengthMilesTotal || 0, 0.1);
  const entranceDensityPerMile = round2(entranceCount / safeLen);
  const maxGapBetweenEntrancesMiles = 0;

  const score = bailoutScoring(routeType, entranceDensityPerMile, deadEndCount, intersectionCount, entranceProxy);

  const entranceNodes = [...deadEnds, ...intersections].slice(0, 25);

  const anchors: Record<Anchor, Coord | null> = {
    start: graph.firstCoord,
    end: graph.lastCoord,
    centroid: (() => {
      let lon = 0;
      let lat = 0;
      let n = 0;
      for (const node of nodes) {
        lon += node.coord[0];
        lat += node.coord[1];
        n++;
      }
      return n > 0 ? ([lon / n, lat / n] as Coord) : null;
    })(),
  };

  const bailoutPoints = toBailoutPoints(deadEnds, intersections, entranceNodes, anchors);

  const summary: RouteStructureSummary = {
    structureLastComputedAt: Date.now(),
    routeType,
    bailoutScore: score.score,
    bailoutClass: score.cls,
    bailoutReasons: score.reasons,
    accessPoints: {
      entranceCount,
      entranceDensityPerMile,
      maxGapBetweenEntrancesMiles,
    },
    loopStats: {
      hasLoop,
      loopCountEstimate,
      largestLoopMiles: null,
    },
    routeGraphStats: {
      nodeCount,
      edgeCount,
      intersectionCount,
      deadEndCount,
      componentCount: compCount,
    },
    bailoutPoints,
  };

  await mkdir(cacheDir, { recursive: true });
  await writeCache(cachePath, { fingerprint, summary });
  ctx.logger?.(`[route_structure] cache=miss nodes=${nodeCount} edges=${edgeCount}`);

  return { ok: true, summary, meta: { cacheHit: false } };
}
