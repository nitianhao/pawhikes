import { isEmptyValue } from "@/lib/format";
import { getPath } from "@/lib/trailSystems/path";

export type ValidationLevel = "error" | "warn";

export type ValidationIssue = {
  level: ValidationLevel;
  path: string;
  message: string;
  value?: any;
};

function push(
  errors: ValidationIssue[],
  warns: ValidationIssue[],
  issue: ValidationIssue
) {
  if (issue.level === "error") errors.push(issue);
  else warns.push(issue);
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const LON_MIN = -180;
const LON_MAX = 180;
const LAT_MIN = -90;
const LAT_MAX = 90;

function validLonLat(lon: number, lat: number): boolean {
  return (
    Number.isFinite(lon) &&
    Number.isFinite(lat) &&
    lon >= LON_MIN &&
    lon <= LON_MAX &&
    lat >= LAT_MIN &&
    lat <= LAT_MAX
  );
}

/**
 * Extract lon/lat from a point-like object. Supports GeoJSON (location.coordinates),
 * top-level lat/lon or lng/lat, and location point string parsing.
 */
function getLonLat(p: any): { lon: number; lat: number } | null {
  if (p == null || typeof p !== "object") return null;

  // A) GeoJSON: p.location?.coordinates is [lon, lat]
  const coords = p.location?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const lon = asNumber(coords[0]);
    const lat = asNumber(coords[1]);
    if (lon != null && lat != null && validLonLat(lon, lat)) return { lon, lat };
  }

  // B) p.location is { type: "Point", coordinates: [lon, lat] } (same as A)

  // C) location.point or location.Point string e.g. "Point: [-97.65, 30.30]"
  const pointStr =
    p.location?.point ?? p.location?.Point ?? (typeof p.location === "string" ? p.location : null);
  if (typeof pointStr === "string") {
    const match = pointStr.match(/\[?\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*\]?/);
    if (match) {
      const lon = asNumber(Number(match[1]));
      const lat = asNumber(Number(match[2]));
      if (lon != null && lat != null && validLonLat(lon, lat)) return { lon, lat };
    }
  }

  // D) Top-level p.lon + p.lat
  const dLon = asNumber(p.lon);
  const dLat = asNumber(p.lat);
  if (dLon != null && dLat != null && validLonLat(dLon, dLat)) return { lon: dLon, lat: dLat };

  // E) p.lng + p.lat
  const eLon = asNumber(p.lng);
  const eLat = asNumber(p.lat);
  if (eLon != null && eLat != null && validLonLat(eLon, eLat)) return { lon: eLon, lat: eLat };

  return null;
}

function hasCoords(p: any): boolean {
  return getLonLat(p) !== null;
}

function checkPercentLike(
  errors: ValidationIssue[],
  warns: ValidationIssue[],
  sys: any,
  path: string
) {
  const v = getPath(sys, path);
  const n = asNumber(v);
  if (n == null) return;
  if (n < 0) {
    push(errors, warns, {
      level: "error",
      path,
      message: "Percent value is negative.",
      value: v,
    });
    return;
  }
  if (n <= 1) return;
  if (n <= 100) return;
  push(errors, warns, {
    level: "error",
    path,
    message: "Percent value is greater than 100.",
    value: v,
  });
}

function checkScore01(
  errors: ValidationIssue[],
  warns: ValidationIssue[],
  sys: any,
  path: string
) {
  const v = getPath(sys, path);
  const n = asNumber(v);
  if (n == null) return;
  if (n < 0 || n > 1) {
    push(errors, warns, {
      level: "warn",
      path,
      message: "Score is outside expected 0..1 range (might be scaled differently).",
      value: v,
    });
  }
}

function checkReasonsIfClass(
  errors: ValidationIssue[],
  warns: ValidationIssue[],
  sys: any,
  classPath: string,
  reasonsPath: string
) {
  const klass = getPath(sys, classPath);
  if (isEmptyValue(klass)) return;
  const reasons = getPath(sys, reasonsPath);
  if (isEmptyValue(reasons)) {
    push(errors, warns, {
      level: "warn",
      path: reasonsPath,
      message: `Has ${classPath} but ${reasonsPath} is empty/missing.`,
      value: reasons,
    });
  }
}

export function validateTrailSystem(sys: any): ValidationIssue[] {
  const errors: ValidationIssue[] = [];
  const warns: ValidationIssue[] = [];

  // A) Percent sanity (0..1 or 0..100)
  for (const p of [
    "asphaltPercent",
    "naturalSurfacePercent",
    "shadePercent",
    "shadePercentage",
    "shadePct",
    "pavedPercentProxy",
  ]) {
    checkPercentLike(errors, warns, sys, p);
  }

  // B) Score sanity (0..1) – warn only
  for (const p of [
    "amenitiesIndexScore",
    "hazardsScore",
    "waterNearScore",
    "waterScore",
    "nightScore",
    "winterScore",
  ]) {
    checkScore01(errors, warns, sys, p);
  }

  // C) Array points must have coordinates (GeoJSON location.coordinates or lat/lon)
  const hazardPoints = getPath(sys, "hazardPoints");
  if (Array.isArray(hazardPoints)) {
    const limit = Math.min(50, hazardPoints.length);
    let missingCoordsCount = 0;
    let checkedCount = 0;
    for (let i = 0; i < limit; i++) {
      const item = hazardPoints[i];
      if (item == null || typeof item !== "object") continue;
      checkedCount++;
      const coords = getLonLat(item);
      if (coords == null) {
        missingCoordsCount++;
        push(errors, warns, {
          level: "warn",
          path: `hazardPoints[${i}].(coordinates)`,
          message: "Hazard point is missing coordinates.",
        });
      }
    }
    // Dev-only: if most checked points "missing", QA might be misreading object shape
    if (
      checkedCount > 0 &&
      missingCoordsCount / checkedCount > 0.8 &&
      (process.env.NODE_ENV === "development" || process.env.PERF_LOG === "1")
    ) {
      const sample = hazardPoints[0];
      console.warn(
        "[QA] Most hazardPoints reported missing coordinates; possible shape mismatch. Sample keys:",
        typeof sample === "object" && sample !== null ? Object.keys(sample) : sample
      );
    }
  }

  const highlights = getPath(sys, "highlights");
  if (Array.isArray(highlights)) {
    const limit = Math.min(50, highlights.length);
    for (let i = 0; i < limit; i++) {
      const item = highlights[i];
      if (item == null || typeof item !== "object") continue;
      const looksPointLike =
        "lat" in (item as any) ||
        "lon" in (item as any) ||
        "lng" in (item as any) ||
        "location" in (item as any);
      if (!looksPointLike) continue;
      const coords = getLonLat(item);
      if (coords == null) {
        push(errors, warns, {
          level: "warn",
          path: `highlights[${i}].(coordinates)`,
          message: "Highlight looks point-like but is missing coordinates.",
        });
      }
    }
  }

  // D) Reasons arrays should match a class if present (soft)
  checkReasonsIfClass(errors, warns, sys, "accessRulesClass", "accessRulesReasons");
  checkReasonsIfClass(errors, warns, sys, "hazardsClass", "hazardsReasons");
  checkReasonsIfClass(errors, warns, sys, "nightClass", "nightReasons");
  checkReasonsIfClass(errors, warns, sys, "winterClass", "winterReasons");

  // E) Length/elevation sanity
  {
    const v = getPath(sys, "lengthMilesTotal");
    const n = asNumber(v);
    if (n != null) {
      if (n <= 0) {
        push(errors, warns, {
          level: "error",
          path: "lengthMilesTotal",
          message: "Length must be > 0.",
          value: v,
        });
      } else if (n > 200) {
        push(errors, warns, {
          level: "warn",
          path: "lengthMilesTotal",
          message: "Length is very large (> 200 miles).",
          value: v,
        });
      }
    }
  }

  {
    const v = getPath(sys, "elevationGainFt");
    const n = asNumber(v);
    if (n != null) {
      if (n < 0) {
        push(errors, warns, {
          level: "warn",
          path: "elevationGainFt",
          message: "Elevation gain is negative.",
          value: v,
        });
      } else if (n > 20000) {
        push(errors, warns, {
          level: "warn",
          path: "elevationGainFt",
          message: "Elevation gain is very large (> 20000 ft).",
          value: v,
        });
      }
    }
  }

  return [...errors, ...warns];
}

