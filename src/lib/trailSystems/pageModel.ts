import type { DisplayItem, DisplaySection, TrailSystemDisplay } from "@/lib/trailSystems/display";
import { buildTrailSystemDisplay, collectMappedKeys, DISPLAY_HIDDEN_KEYS } from "@/lib/trailSystems/display";
import type { ValidationIssue } from "@/lib/trailSystems/validate";
import { validateTrailSystem } from "@/lib/trailSystems/validate";

export type TrailSystemIdentity = {
  id: string;
  name?: string;
  slug?: string;
  city?: string;
  state?: string;
  county?: string;
  extDataset?: string;
  extSystemRef?: string;
};

export type TrailSystemPageModel = {
  identity: TrailSystemIdentity;
  glance: DisplayItem[];
  sections: DisplaySection[];
  qa: {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    total: number;
  };
  completeness: {
    totalKeys: number;
    mappedKeys: number;
    unmappedKeys: number;
    unmapped: string[];
  };
  geo: {
    hasGeometry: boolean;
    centroid?: { lat: number; lon: number };
    bbox?: { minLat: number; minLon: number; maxLat: number; maxLon: number };
    hazardPointsCount?: number;
  };
};

function asRecord(v: unknown): Record<string, any> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, any>;
}

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getCentroid(sys: Record<string, any>): { lat: number; lon: number } | undefined {
  const c = sys.centroid;
  if (c == null) return undefined;
  // Array [lon, lat] (pipeline/rollup format)
  if (Array.isArray(c) && c.length >= 2) {
    const lon = asNum(c[0]);
    const lat = asNum(c[1]);
    if (lon != null && lat != null) return { lat, lon };
  }
  // Object: GeoJSON coordinates or lat/lon
  if (typeof c === "object") {
    const coords = (c as any).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      const lon = asNum(coords[0]);
      const lat = asNum(coords[1]);
      if (lon != null && lat != null) return { lat, lon };
    }
    const lon = asNum((c as any).lon ?? (c as any).lng ?? (c as any).x);
    const lat = asNum((c as any).lat ?? (c as any).y);
    if (lon != null && lat != null) return { lat, lon };
  }
  return undefined;
}

function getBbox(
  sys: Record<string, any>
): { minLat: number; minLon: number; maxLat: number; maxLon: number } | undefined {
  const b = sys.bbox;
  if (b == null) return undefined;
  // Array [minLon, minLat, maxLon, maxLat] (pipeline/GeoJSON order)
  if (Array.isArray(b) && b.length >= 4) {
    const minLon = asNum(b[0]);
    const minLat = asNum(b[1]);
    const maxLon = asNum(b[2]);
    const maxLat = asNum(b[3]);
    if (minLon != null && minLat != null && maxLon != null && maxLat != null) {
      return { minLat, minLon, maxLat, maxLon };
    }
  }
  // Object { minLat, minLon, maxLat, maxLon } or aliases
  if (typeof b === "object") {
    const minLon = asNum((b as any).minLon ?? (b as any).minX ?? (b as any).west);
    const minLat = asNum((b as any).minLat ?? (b as any).minY ?? (b as any).south);
    const maxLon = asNum((b as any).maxLon ?? (b as any).maxX ?? (b as any).east);
    const maxLat = asNum((b as any).maxLat ?? (b as any).maxY ?? (b as any).north);
    if (minLon != null && minLat != null && maxLon != null && maxLat != null) {
      return { minLat, minLon, maxLat, maxLon };
    }
  }
  return undefined;
}

function splitIssues(issues: ValidationIssue[]): { errors: ValidationIssue[]; warnings: ValidationIssue[] } {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  for (const it of Array.isArray(issues) ? issues : []) {
    if (it?.level === "error") errors.push(it);
    else if (it?.level === "warn") warnings.push(it);
  }
  return { errors, warnings };
}

function buildCompleteness(sys: Record<string, any>, display: TrailSystemDisplay) {
  const keys = Object.keys(sys);
  const mapped = collectMappedKeys(display);
  const unmapped = keys
    .filter((k) => !DISPLAY_HIDDEN_KEYS.has(k) && !mapped.has(k))
    .sort((a, b) => a.localeCompare(b));
  return {
    totalKeys: keys.length,
    mappedKeys: mapped.size,
    unmappedKeys: unmapped.length,
    unmapped,
  };
}

export function buildTrailSystemPageModel(sys: any): TrailSystemPageModel {
  const s = asRecord(sys);

  const identity: TrailSystemIdentity = {
    id: String(s.id ?? ""),
    name: s.name != null ? String(s.name) : undefined,
    slug: s.slug != null ? String(s.slug) : undefined,
    city: s.city != null ? String(s.city) : undefined,
    state: s.state != null ? String(s.state) : undefined,
    county: s.county != null ? String(s.county) : undefined,
    extDataset: s.extDataset != null ? String(s.extDataset) : undefined,
    extSystemRef: s.extSystemRef != null ? String(s.extSystemRef) : undefined,
  };

  const display = buildTrailSystemDisplay(s);
  const issues = validateTrailSystem(s);
  const { errors, warnings } = splitIssues(issues);
  const completeness = buildCompleteness(s, display);

  const centroidParsed = getCentroid(s);
  const bboxParsed = getBbox(s);
  const hasGeometry = Boolean(
    s.geometry || s.geom || s.lineString || s.geojson || centroidParsed || bboxParsed
  );
  const hazardPointsCount = Array.isArray(s.hazardPoints) ? s.hazardPoints.length : undefined;

  return {
    identity,
    glance: display.glance,
    sections: display.sections,
    qa: { errors, warnings, total: issues.length },
    completeness,
    geo: {
      hasGeometry,
      centroid: centroidParsed,
      bbox: bboxParsed,
      hazardPointsCount,
    },
  };
}

