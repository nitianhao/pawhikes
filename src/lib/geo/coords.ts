export type CoordNormalizationStats = {
  swapFixCount: number;
  swappedPairs: Array<{
    original: [number, number];
    normalized: [number, number];
  }>;
};

function isFiniteInRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function normalizeLonLatPair(pair: [number, number]): {
  lat: number;
  lon: number;
  wasSwapped: boolean;
} {
  const [a, b] = pair;

  const looksLikeLonLat =
    isFiniteInRange(a, -180, 180) && isFiniteInRange(b, -90, 90);
  const looksLikeLatLon =
    isFiniteInRange(a, -90, 90) && isFiniteInRange(b, -180, 180);

  if (looksLikeLonLat && !looksLikeLatLon) {
    return { lat: b, lon: a, wasSwapped: false };
  }

  if (!looksLikeLonLat && looksLikeLatLon) {
    return { lat: a, lon: b, wasSwapped: true };
  }

  return { lat: b, lon: a, wasSwapped: false };
}

export function toLatLngTuple(
  pair: [number, number],
  stats?: CoordNormalizationStats
): [number, number] {
  const normalized = normalizeLonLatPair(pair);
  const tuple: [number, number] = [normalized.lat, normalized.lon];

  if (normalized.wasSwapped && stats) {
    stats.swapFixCount += 1;
    if (stats.swappedPairs.length < 20) {
      stats.swappedPairs.push({ original: pair, normalized: tuple });
    }
  }

  return tuple;
}

