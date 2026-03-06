import { haversineMeters, type LatLngTuple } from "@/lib/geo/stitchSegments";

export function minDistancePointToPolylineMeters(
  point: LatLngTuple,
  polylinePoints: LatLngTuple[],
  stride = 1
): number {
  if (polylinePoints.length === 0) return Number.POSITIVE_INFINITY;

  let minDistance = Number.POSITIVE_INFINITY;
  const safeStride = Math.max(1, Math.floor(stride));

  for (let index = 0; index < polylinePoints.length; index += safeStride) {
    minDistance = Math.min(minDistance, haversineMeters(point, polylinePoints[index]));
  }

  const lastPoint = polylinePoints[polylinePoints.length - 1];
  return Math.min(minDistance, haversineMeters(point, lastPoint));
}

export function minDistancePointToRouteMeters(
  point: LatLngTuple,
  stitchedPaths: Array<{ points: LatLngTuple[] }>
): number {
  let minDistance = Number.POSITIVE_INFINITY;

  for (const path of stitchedPaths) {
    const pointCount = path.points.length;
    const stride = pointCount > 4000 ? 2 : 1;
    minDistance = Math.min(
      minDistance,
      minDistancePointToPolylineMeters(point, path.points, stride)
    );
  }

  return minDistance;
}

