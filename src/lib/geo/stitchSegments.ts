import { toLatLngTuple, type CoordNormalizationStats } from "@/lib/geo/coords";

export type LatLngTuple = [number, number];

export type StitchSegmentGeometry = {
  type?: string;
  coordinates?: unknown;
} | null;

export type StitchSegmentInput = {
  id: string;
  name?: string | null;
  surface?: string | null;
  width?: number | null;
  lengthMiles?: number | null;
  geometry?: StitchSegmentGeometry;
};

export type ExplodedSegmentPart = {
  id: string;
  segmentId: string;
  segmentName?: string | null;
  surface?: string | null;
  width?: number | null;
  lengthMiles?: number | null;
  points: LatLngTuple[];
};

export type StitchedPath = {
  id: string;
  points: LatLngTuple[];
  partIds: string[];
  approxMiles: number;
  isPrimary: boolean;
  maxStepMeters: number;
  suspect: boolean;
};

export type EndpointCluster = {
  id: string;
  point: LatLngTuple;
  degree: number;
  endpointCount: number;
};

export type DebugJoin = {
  fromNodeId: string;
  toNodeId: string;
  fromPoint: LatLngTuple;
  toPoint: LatLngTuple;
  dMeters: number;
  turnAngle: number | null;
  chosenEdgeId: string;
};

export type StitchStats = {
  pathCount: number;
  partCount: number;
  clusterCount: number;
  snapToleranceMeters: number;
  maxJoinMeters: number;
  usedFallback: boolean;
  mode: "stitched" | "fallback";
  fallbackReason: "none" | "empty" | "error" | "suspectSpike" | "noPaths";
  swapFixCount: number;
  swappedPairs: Array<{
    original: [number, number];
    normalized: [number, number];
  }>;
  maxJoinMetersUsed: number;
  maxStepMeters: number;
  suspectSpikeMeters: number | null;
};

export type StitchResult = {
  stitchedPaths: StitchedPath[];
  parts: ExplodedSegmentPart[];
  endpointClusters: EndpointCluster[];
  debugJoins: DebugJoin[];
  stats: StitchStats;
};

export type StitchOptions = {
  snapToleranceMeters?: number;
  maxJoinMeters?: number;
};

type Endpoint = {
  id: string;
  point: LatLngTuple;
  x: number;
  y: number;
};

type ClusterInternal = {
  id: string;
  point: LatLngTuple;
  sumLat: number;
  sumLon: number;
  memberCount: number;
  degree: number;
};

type EdgeInternal = {
  id: string;
  points: LatLngTuple[];
  startClusterId: string;
  endClusterId: string;
  lengthMiles?: number | null;
  startHeading: number;
  endHeading: number;
};

type TraversalCandidate = {
  edge: EdgeInternal;
  forward: boolean;
  nextNodeId: string;
  dMeters: number;
  turnAngle: number | null;
  score: number;
};

const EARTH_RADIUS_METERS = 6_371_000;
const METERS_PER_MILE = 1_609.344;
const DEFAULT_SNAP_TOLERANCE_METERS = 12;
const DEFAULT_MAX_JOIN_METERS = 25;
const HARD_JOIN_CAP_METERS = 25;
const MAX_TURN_ANGLE_DEGREES = 120;
const DISTANCE_WEIGHT = 3;
const TURN_WEIGHT = 1;
const SUSPECT_SPIKE_METERS = 300;

function isCoordinatePair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function normalizeHeading(value: number): number {
  return ((value % 360) + 360) % 360;
}

function reversedHeading(value: number): number {
  return normalizeHeading(value + 180);
}

function pointKey(point: LatLngTuple): string {
  return `${point[0].toFixed(7)},${point[1].toFixed(7)}`;
}

function pathDistanceMiles(points: LatLngTuple[]): number {
  let meters = 0;
  for (let index = 1; index < points.length; index += 1) {
    meters += haversineMeters(points[index - 1], points[index]);
  }
  return meters / METERS_PER_MILE;
}

function projectPoint(point: LatLngTuple): { x: number; y: number } {
  const lat = Math.max(Math.min(point[0], 89.5), -89.5);
  const lon = point[1];
  return {
    x: EARTH_RADIUS_METERS * toRadians(lon),
    y: EARTH_RADIUS_METERS * Math.log(Math.tan(Math.PI / 4 + toRadians(lat) / 2)),
  };
}

function endpointBucketKey(x: number, y: number, bucketSize: number): string {
  return `${Math.floor(x / bucketSize)}:${Math.floor(y / bucketSize)}`;
}

function sanityClamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildEmptyResult(
  parts: ExplodedSegmentPart[],
  stats: CoordNormalizationStats,
  config: { snapToleranceMeters: number; maxJoinMeters: number },
  fallbackReason: StitchStats["fallbackReason"],
  usedFallback: boolean
): StitchResult {
  return {
    stitchedPaths: [],
    parts,
    endpointClusters: [],
    debugJoins: [],
    stats: {
      pathCount: 0,
      partCount: parts.length,
      clusterCount: 0,
      snapToleranceMeters: config.snapToleranceMeters,
      maxJoinMeters: config.maxJoinMeters,
      usedFallback,
      mode: usedFallback ? "fallback" : "stitched",
      fallbackReason,
      swapFixCount: stats.swapFixCount,
      swappedPairs: stats.swappedPairs,
      maxJoinMetersUsed: 0,
      maxStepMeters: 0,
      suspectSpikeMeters: null,
    },
  };
}

export function haversineMeters(a: LatLngTuple, b: LatLngTuple): number {
  const dLat = toRadians(b[0] - a[0]);
  const dLon = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDegrees(a: LatLngTuple, b: LatLngTuple): number {
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const dLon = toRadians(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeHeading((Math.atan2(y, x) * 180) / Math.PI);
}

export function angleDiffDegrees(h1: number, h2: number): number {
  const diff = Math.abs(normalizeHeading(h1) - normalizeHeading(h2));
  return Math.min(diff, 360 - diff);
}

function createCoordStats(): CoordNormalizationStats {
  return { swapFixCount: 0, swappedPairs: [] };
}

export function explodeSegmentsToParts(
  segments: StitchSegmentInput[],
  coordStats: CoordNormalizationStats = createCoordStats()
): ExplodedSegmentPart[] {
  const parts: ExplodedSegmentPart[] = [];

  for (const segment of segments) {
    const geometry = segment.geometry;
    if (!geometry || !Array.isArray((geometry as any).coordinates)) {
      continue;
    }

    // Normalize LineString → MultiLineString so both types are handled uniformly.
    let coordinates: unknown[];
    if (geometry.type === "MultiLineString") {
      coordinates = (geometry as any).coordinates as unknown[];
    } else if (geometry.type === "LineString") {
      coordinates = [(geometry as any).coordinates];
    } else {
      continue;
    }

    coordinates.forEach((line, lineIndex) => {
      if (!Array.isArray(line)) return;

      const points: LatLngTuple[] = [];
      for (const coordinate of line) {
        if (!isCoordinatePair(coordinate)) continue;
        points.push(toLatLngTuple(coordinate, coordStats));
      }

      if (points.length < 2) return;

      parts.push({
        id: `${segment.id}-${lineIndex}`,
        segmentId: segment.id,
        segmentName: segment.name ?? null,
        surface: segment.surface ?? null,
        width: segment.width ?? null,
        lengthMiles: segment.lengthMiles ?? null,
        points,
      });
    });
  }

  return parts;
}

function clusterEndpoints(
  parts: ExplodedSegmentPart[],
  snapToleranceMeters: number
): {
  clusters: EndpointCluster[];
  clusterMap: Map<string, EndpointCluster>;
  edgeMap: Map<string, EdgeInternal>;
} {
  const endpoints: Endpoint[] = [];

  for (const part of parts) {
    const startPoint = part.points[0];
    const endPoint = part.points[part.points.length - 1];
    const startProjected = projectPoint(startPoint);
    const endProjected = projectPoint(endPoint);

    endpoints.push({
      id: `${part.id}:start`,
      point: startPoint,
      x: startProjected.x,
      y: startProjected.y,
    });
    endpoints.push({
      id: `${part.id}:end`,
      point: endPoint,
      x: endProjected.x,
      y: endProjected.y,
    });
  }

  const bucketSize = Math.max(snapToleranceMeters, 1);
  const buckets = new Map<string, string[]>();
  const clusterById = new Map<string, ClusterInternal>();
  const endpointToClusterId = new Map<string, string>();

  for (const endpoint of endpoints) {
    const baseX = Math.floor(endpoint.x / bucketSize);
    const baseY = Math.floor(endpoint.y / bucketSize);
    let match: { cluster: ClusterInternal; distance: number } | null = null;

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const candidateIds = buckets.get(`${baseX + dx}:${baseY + dy}`) ?? [];
        for (const candidateId of candidateIds) {
          const cluster = clusterById.get(candidateId);
          if (!cluster) continue;
          const distance = haversineMeters(endpoint.point, cluster.point);
          if (distance > snapToleranceMeters) continue;
          if (!match || distance < match.distance) {
            match = { cluster, distance };
          }
        }
      }
    }

    if (match) {
      const cluster = match.cluster;
      cluster.memberCount += 1;
      cluster.sumLat += endpoint.point[0];
      cluster.sumLon += endpoint.point[1];
      cluster.point = [
        cluster.sumLat / cluster.memberCount,
        cluster.sumLon / cluster.memberCount,
      ];
      endpointToClusterId.set(endpoint.id, cluster.id);
      continue;
    }

    const clusterId = `node-${clusterById.size + 1}`;
    clusterById.set(clusterId, {
      id: clusterId,
      point: endpoint.point,
      sumLat: endpoint.point[0],
      sumLon: endpoint.point[1],
      memberCount: 1,
      degree: 0,
    });
    endpointToClusterId.set(endpoint.id, clusterId);

    const key = endpointBucketKey(endpoint.x, endpoint.y, bucketSize);
    buckets.set(key, [...(buckets.get(key) ?? []), clusterId]);
  }

  const edgeMap = new Map<string, EdgeInternal>();
  for (const part of parts) {
    const startClusterId = endpointToClusterId.get(`${part.id}:start`);
    const endClusterId = endpointToClusterId.get(`${part.id}:end`);
    if (!startClusterId || !endClusterId) continue;

    const startCluster = clusterById.get(startClusterId);
    const endCluster = clusterById.get(endClusterId);
    if (!startCluster || !endCluster) continue;

    startCluster.degree += 1;
    endCluster.degree += 1;

    const snappedPoints = [...part.points];
    snappedPoints[0] = startCluster.point;
    snappedPoints[snappedPoints.length - 1] = endCluster.point;

    edgeMap.set(part.id, {
      id: part.id,
      points: snappedPoints,
      startClusterId,
      endClusterId,
      lengthMiles: part.lengthMiles ?? null,
      startHeading: bearingDegrees(part.points[0], part.points[1]),
      endHeading: bearingDegrees(
        part.points[part.points.length - 2],
        part.points[part.points.length - 1]
      ),
    });
  }

  const clusters = Array.from(clusterById.values()).map((cluster) => ({
    id: cluster.id,
    point: cluster.point,
    degree: cluster.degree,
    endpointCount: cluster.memberCount,
  }));

  return {
    clusters,
    clusterMap: new Map(clusters.map((cluster) => [cluster.id, cluster])),
    edgeMap,
  };
}

function markPrimaryPath(paths: StitchedPath[]): StitchedPath[] {
  if (paths.length === 0) return paths;
  const primary = [...paths].sort(
    (a, b) => b.approxMiles - a.approxMiles || b.points.length - a.points.length
  )[0];
  return paths.map((path) => ({ ...path, isPrimary: path.id === primary.id }));
}

function traversalInfo(edge: EdgeInternal, forward: boolean): {
  fromNodeId: string;
  toNodeId: string;
  points: LatLngTuple[];
  outgoingHeading: number;
  incomingHeading: number;
  matchingEndpoint: LatLngTuple;
} {
  if (forward) {
    return {
      fromNodeId: edge.startClusterId,
      toNodeId: edge.endClusterId,
      points: edge.points,
      outgoingHeading: edge.startHeading,
      incomingHeading: edge.endHeading,
      matchingEndpoint: edge.points[0],
    };
  }

  return {
    fromNodeId: edge.endClusterId,
    toNodeId: edge.startClusterId,
    points: [...edge.points].reverse(),
    outgoingHeading: reversedHeading(edge.endHeading),
    incomingHeading: reversedHeading(edge.startHeading),
    matchingEndpoint: edge.points[edge.points.length - 1],
  };
}

function appendEdgePoints(currentPoints: LatLngTuple[], nextPoints: LatLngTuple[]): {
  points: LatLngTuple[];
  joinDistanceMeters: number;
} {
  if (currentPoints.length === 0) {
    return { points: [...nextPoints], joinDistanceMeters: 0 };
  }

  const joinDistanceMeters = haversineMeters(
    currentPoints[currentPoints.length - 1],
    nextPoints[0]
  );
  const startIndex = joinDistanceMeters <= 0.5 ? 1 : 0;
  return {
    points: [...currentPoints, ...nextPoints.slice(startIndex)],
    joinDistanceMeters,
  };
}

function chooseCandidateEdge(args: {
  currentNodeId: string;
  incomingHeading: number | null;
  currentPoint: LatLngTuple | null;
  adjacency: Map<string, string[]>;
  edgeMap: Map<string, EdgeInternal>;
  unused: Set<string>;
  maxJoinMeters: number;
}): TraversalCandidate | null {
  const {
    currentNodeId,
    incomingHeading,
    currentPoint,
    adjacency,
    edgeMap,
    unused,
    maxJoinMeters,
  } = args;

  let best: TraversalCandidate | null = null;

  for (const edgeId of adjacency.get(currentNodeId) ?? []) {
    if (!unused.has(edgeId)) continue;
    const edge = edgeMap.get(edgeId);
    if (!edge) continue;

    const forward = edge.startClusterId === currentNodeId || edge.startClusterId === edge.endClusterId;
    const info = traversalInfo(edge, forward);
    const dMeters = currentPoint ? haversineMeters(currentPoint, info.matchingEndpoint) : 0;
    if (dMeters > maxJoinMeters) continue;

    const turnAngle =
      incomingHeading == null ? null : angleDiffDegrees(incomingHeading, info.outgoingHeading);
    if (turnAngle != null && turnAngle > MAX_TURN_ANGLE_DEGREES) continue;

    const score = dMeters * DISTANCE_WEIGHT + (turnAngle ?? 0) * TURN_WEIGHT;
    const candidate: TraversalCandidate = {
      edge,
      forward,
      nextNodeId: info.toNodeId,
      dMeters,
      turnAngle,
      score,
    };

    if (
      !best ||
      candidate.score < best.score ||
      (candidate.score === best.score &&
        (edge.lengthMiles ?? pathDistanceMiles(edge.points)) >
          (best.edge.lengthMiles ?? pathDistanceMiles(best.edge.points))) ||
      (candidate.score === best.score && candidate.edge.id.localeCompare(best.edge.id) < 0)
    ) {
      best = candidate;
    }
  }

  return best;
}

function maxPointStepMeters(points: LatLngTuple[]): number {
  let maxStep = 0;
  for (let index = 1; index < points.length; index += 1) {
    maxStep = Math.max(maxStep, haversineMeters(points[index - 1], points[index]));
  }
  return maxStep;
}

function stitchGraph(
  clusters: EndpointCluster[],
  edgeMap: Map<string, EdgeInternal>,
  maxJoinMeters: number
): {
  stitchedPaths: StitchedPath[];
  debugJoins: DebugJoin[];
  maxJoinMetersUsed: number;
  suspectSpikeMeters: number | null;
  maxStepMeters: number;
} {
  const adjacency = new Map<string, string[]>();
  for (const cluster of clusters) adjacency.set(cluster.id, []);

  for (const edge of edgeMap.values()) {
    adjacency.set(edge.startClusterId, [...(adjacency.get(edge.startClusterId) ?? []), edge.id]);
    adjacency.set(edge.endClusterId, [...(adjacency.get(edge.endClusterId) ?? []), edge.id]);
  }

  const unused = new Set(Array.from(edgeMap.keys()));
  const nodeOrder = [...clusters]
    .sort((a, b) => {
      const degreeDelta = Number(a.degree !== 1) - Number(b.degree !== 1);
      if (degreeDelta !== 0) return degreeDelta;
      return a.id.localeCompare(b.id);
    })
    .map((cluster) => cluster.id);

  const stitchedPaths: StitchedPath[] = [];
  const debugJoins: DebugJoin[] = [];
  let maxJoinMetersUsed = 0;
  let suspectSpikeMeters: number | null = null;
  let maxStepMeters = 0;

  const findStartNode = (): string | null => {
    for (const nodeId of nodeOrder) {
      const hasUnused = (adjacency.get(nodeId) ?? []).some((edgeId) => unused.has(edgeId));
      if (hasUnused) return nodeId;
    }
    return null;
  };

  while (unused.size > 0) {
    const startNodeId = findStartNode();
    if (!startNodeId) break;

    let currentNodeId = startNodeId;
    let currentPoint = clusters.find((cluster) => cluster.id === startNodeId)?.point ?? null;
    let incomingHeading: number | null = null;
    let pathPoints: LatLngTuple[] = [];
    const partIds: string[] = [];
    let approxMiles = 0;

    while (true) {
      const choice = chooseCandidateEdge({
        currentNodeId,
        incomingHeading,
        currentPoint,
        adjacency,
        edgeMap,
        unused,
        maxJoinMeters,
      });
      if (!choice) break;

      const info = traversalInfo(choice.edge, choice.forward);
      const appended = appendEdgePoints(pathPoints, info.points);
      if (appended.joinDistanceMeters > HARD_JOIN_CAP_METERS) break;

      unused.delete(choice.edge.id);
      pathPoints = appended.points;
      partIds.push(choice.edge.id);
      approxMiles += choice.edge.lengthMiles ?? pathDistanceMiles(info.points);
      maxJoinMetersUsed = Math.max(maxJoinMetersUsed, appended.joinDistanceMeters);

      if (partIds.length > 1) {
        debugJoins.push({
          fromNodeId: currentNodeId,
          toNodeId: info.toNodeId,
          fromPoint: pathPoints[pathPoints.length - info.points.length] ?? currentPoint ?? info.points[0],
          toPoint: info.points[0],
          dMeters: appended.joinDistanceMeters,
          turnAngle: choice.turnAngle,
          chosenEdgeId: choice.edge.id,
        });
      }

      currentNodeId = info.toNodeId;
      currentPoint = info.points[info.points.length - 1] ?? currentPoint;
      incomingHeading = info.incomingHeading;
    }

    if (pathPoints.length >= 2 && partIds.length > 0) {
      const pathMaxStepMeters = maxPointStepMeters(pathPoints);
      maxStepMeters = Math.max(maxStepMeters, pathMaxStepMeters);
      if (pathMaxStepMeters > SUSPECT_SPIKE_METERS) {
        suspectSpikeMeters = Math.max(suspectSpikeMeters ?? 0, pathMaxStepMeters);
      }

      stitchedPaths.push({
        id: `path-${stitchedPaths.length + 1}`,
        points: pathPoints,
        partIds,
        approxMiles: approxMiles > 0 ? approxMiles : pathDistanceMiles(pathPoints),
        isPrimary: false,
        maxStepMeters: pathMaxStepMeters,
        suspect: pathMaxStepMeters > SUSPECT_SPIKE_METERS,
      });
    } else {
      break;
    }
  }

  return {
    stitchedPaths: markPrimaryPath(stitchedPaths),
    debugJoins,
    maxJoinMetersUsed,
    suspectSpikeMeters,
    maxStepMeters,
  };
}

export function segmentsToStitchedPaths(
  segments: StitchSegmentInput[],
  options: StitchOptions = {}
): StitchResult {
  const snapToleranceMeters = sanityClamp(
    options.snapToleranceMeters ?? DEFAULT_SNAP_TOLERANCE_METERS,
    1,
    100
  );
  const maxJoinMeters = Math.max(
    options.maxJoinMeters ?? DEFAULT_MAX_JOIN_METERS,
    snapToleranceMeters
  );
  const coordStats = createCoordStats();
  const parts = explodeSegmentsToParts(segments, coordStats);

  if (parts.length === 0) {
    return buildEmptyResult(
      parts,
      coordStats,
      { snapToleranceMeters, maxJoinMeters },
      "empty",
      false
    );
  }

  try {
    const { clusters, edgeMap } = clusterEndpoints(parts, snapToleranceMeters);
    const stitched = stitchGraph(clusters, edgeMap, maxJoinMeters);
    const usedFallback = stitched.stitchedPaths.length === 0;

    return {
      stitchedPaths: usedFallback ? [] : stitched.stitchedPaths,
      parts,
      endpointClusters: clusters,
      debugJoins: stitched.debugJoins,
      stats: {
        pathCount: usedFallback ? 0 : stitched.stitchedPaths.length,
        partCount: parts.length,
        clusterCount: clusters.length,
        snapToleranceMeters,
        maxJoinMeters,
        usedFallback,
        mode: usedFallback ? "fallback" : "stitched",
        fallbackReason:
          stitched.stitchedPaths.length === 0 ? "noPaths" : "none",
        swapFixCount: coordStats.swapFixCount,
        swappedPairs: coordStats.swappedPairs,
        maxJoinMetersUsed: stitched.maxJoinMetersUsed,
        maxStepMeters: stitched.maxStepMeters,
        suspectSpikeMeters: stitched.suspectSpikeMeters,
      },
    };
  } catch {
    return buildEmptyResult(
      parts,
      coordStats,
      { snapToleranceMeters, maxJoinMeters },
      "error",
      true
    );
  }
}

export function polylineBoundsFromPaths(
  paths: Array<{ points: LatLngTuple[] }>
): [LatLngTuple, LatLngTuple] | null {
  const allPoints = paths.flatMap((path) => path.points);
  if (allPoints.length < 2) return null;

  let minLat = allPoints[0][0];
  let maxLat = allPoints[0][0];
  let minLon = allPoints[0][1];
  let maxLon = allPoints[0][1];

  for (const [lat, lon] of allPoints) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }

  return [
    [minLat, minLon],
    [maxLat, maxLon],
  ];
}

export function firstPointFromPaths(paths: Array<{ points: LatLngTuple[] }>): LatLngTuple | null {
  return paths.find((path) => path.points.length > 0)?.points[0] ?? null;
}

export function pointsToFallbackPaths(parts: ExplodedSegmentPart[]): StitchedPath[] {
  return markPrimaryPath(
    parts.map((part, index) => ({
      id: `fallback-${index + 1}`,
      points: part.points,
      partIds: [part.id],
      approxMiles: part.lengthMiles ?? pathDistanceMiles(part.points),
      isPrimary: false,
      maxStepMeters: maxPointStepMeters(part.points),
      suspect: false,
    }))
  );
}

export function longestPath(paths: StitchedPath[]): StitchedPath | null {
  return (
    [...paths].sort((a, b) => b.approxMiles - a.approxMiles || b.points.length - a.points.length)[0] ??
    null
  );
}

export function areSamePoint(a: LatLngTuple | null, b: LatLngTuple | null): boolean {
  if (!a || !b) return false;
  return pointKey(a) === pointKey(b);
}
