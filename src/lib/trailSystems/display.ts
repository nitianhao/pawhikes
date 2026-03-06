import { isEmptyValue } from "@/lib/format";
import { humanizeKey } from "@/lib/trailSystems/formatters";
import { getPath, hasPath, listTopLevelKeys } from "@/lib/trailSystems/path";
import { SECTION_RULES } from "@/lib/trailSystems/sectionRules";

export type DisplayItem = {
  key: string;
  label: string;
  value: any;
  kind?: "text" | "number" | "percent" | "json" | "list";
};

export type DisplaySection = {
  id: string;
  title: string;
  items: DisplayItem[];
};

export type TrailSystemDisplay = { glance: DisplayItem[]; sections: DisplaySection[] };

function asRecord(v: unknown): Record<string, any> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, any>;
}

function getFirstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function getFirstText(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length) return v;
  }
  return null;
}

function getNested(obj: Record<string, any>, path: string): unknown {
  const parts = String(path ?? "").split(".").filter(Boolean);
  let cur: any = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = cur[p];
  }
  return cur;
}

/** Keys never shown on the trail page (internal/computed metadata). */
export const DISPLAY_HIDDEN_KEYS = new Set([
  "id",
  "extDataset",
  "extSystemRef",
  "computedAt",
  "personalizationLastComputedAt",
  "accessRulesLastComputedAt",
  "surfaceLastComputedAt",
  "waterLastComputedAt",
  "elevationProvider",
  "elevationComputedAt",
  "highlightsLastComputedAt",
  "nightLastComputedAt",
  "winterLastComputedAt",
  "raw",
  "logisticsLastComputedAt",
  "mudLastComputedAt",
  "safetyLastComputedAt",
  "segmentCount",
  "shadeLastComputedAt",
  "shadeClass",
  "shadeProxyScore",
  "shadeProxyPercent",
  "shadeSources",
  "shadePercentage",
  "shadePct",
  "shadePercent",
  "structureLastComputedAt",
  "streetLampCountNearTrail",
  "trailHeadsLastLinkedAt",
  "trailHeadsLinkReason",
  "routeType",
  "safety",
  "bbox",
  "centroid",
  "crowdClass",
  "crowdLastComputedAt",
  "crowdProxyScore",
  "crowdReasons",
  "crowdSignals",
  "litKnownSamples",
  "litPercentKnown",
  "litYesSamples",
  "mudRisk",
  "mudRiskReason",
  "mudRiskScore",
  "roughnessRisk",
  "roughnessRiskScore",
  "roughnessRiskKnownSamples",
  "elevationGainFt",
  "elevationLossFt",
  "elevationMinFt",
  "elevationMaxFt",
  "accessRulesClass",
  "amenitiesIndexScore",
  "nightClass",
  "nightFriendly",
  "nightScore",
  "nightReasons",
  "nightWinterSignals",
  "personalization",
  "slug",
  "name",
  "state",
  "city",
  "county",
  "lengthMilesTotal",
  "highlights",
  "highlightsByType",
  "highlightsCount",
  "bailoutPoints",
  "bailoutClass",
  "bailoutScore",
  "bailoutReasons",
  "fields",
]);

function addMappedKey(out: Set<string>, key: string) {
  const full = String(key ?? "").trim();
  if (!full) return;
  out.add(full);
  const parts = full.split(".").filter(Boolean);
  if (parts.length > 1) {
    // Also mark the root segment mapped, so nested paths map their top-level object.
    out.add(parts[0]);
  }
}

export function collectMappedKeys(display: TrailSystemDisplay): Set<string> {
  const out = new Set<string>();
  for (const item of Array.isArray(display?.glance) ? display.glance : []) {
    if (item?.key) addMappedKey(out, item.key);
  }
  for (const section of Array.isArray(display?.sections) ? display.sections : []) {
    for (const item of Array.isArray(section?.items) ? section.items : []) {
      if (item?.key) addMappedKey(out, item.key);
    }
  }
  return out;
}

function addItem(
  items: DisplayItem[],
  key: string,
  label: string,
  value: unknown,
  kind?: DisplayItem["kind"]
) {
  if (isEmptyValue(value)) return;
  items.push({ key, label, value: value as any, kind });
}

function inferKind(key: string): DisplayItem["kind"] | undefined {
  const k = String(key ?? "");
  if (!k) return undefined;
  if (k.toLowerCase().includes("percent") || k.endsWith("Percent")) return "percent";
  if (k.toLowerCase().includes("score") || k.endsWith("Score")) return "number";
  if (k.toLowerCase().includes("class") || k.endsWith("Class")) return "text";
  return undefined;
}

function labelFromKeyOrPath(keyOrPath: string): string {
  const parts = String(keyOrPath ?? "").split(".").filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : String(keyOrPath ?? "");
  return humanizeKey(last) || last || String(keyOrPath ?? "");
}

function itemsForSpecialKey(_key: string, _value: unknown): DisplayItem[] | null {
  return null;
}

function addCandidateItems(
  out: DisplayItem[],
  candidateKeyOrPath: string,
  value: unknown
) {
  const special = itemsForSpecialKey(candidateKeyOrPath, value);
  if (special) {
    for (const it of special) {
      if (!isEmptyValue(it.value)) out.push(it);
    }
    return;
  }
  if (isEmptyValue(value)) return;
  out.push({
    key: candidateKeyOrPath,
    label: labelFromKeyOrPath(candidateKeyOrPath),
    value,
    kind: inferKind(candidateKeyOrPath),
  });
}

function pickObjectByKeyRegex(obj: unknown, re: RegExp): Record<string, any> | null {
  const rec = asRecord(obj);
  if (!rec) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (re.test(k) && !isEmptyValue(v)) out[k] = v;
  }
  return isEmptyValue(out) ? null : out;
}

export function buildTrailSystemDisplay(sys: any): TrailSystemDisplay {
  const s = asRecord(sys) ?? {};

  const glance: DisplayItem[] = [];
  addItem(glance, "hazardsClass", "Hazards", s.hazardsClass, "text");
  addItem(glance, "hazardsScore", "Hazards score", s.hazardsScore, "number");
  addItem(glance, "naturalSurfacePercent", "Natural surface", s.naturalSurfacePercent, "percent");

  const heat = getFirstText(s.heatRisk, s.heatClass);
  addItem(glance, "heatRisk", "Heat risk", heat, "text");

  addItem(glance, "winterScore", "Winter score", s.winterScore, "number");
  addItem(glance, "winterClass", "Winter class", s.winterClass, "text");

  const curatedById: Record<string, DisplayItem[]> = {};

  // Curated items remain first within each section.
  curatedById.basics = [];

  curatedById.shade = [];

  curatedById.dog = [];
  addItem(curatedById.dog, "reactiveDogFriendly", "Reactive dog friendly", s.reactiveDogFriendly);

  curatedById.access = [];
  addItem(curatedById.access, "dogsAllowed", "Dogs allowed", s.dogsAllowed);
  addItem(curatedById.access, "leashPolicy", "Leash policy", s.leashPolicy);
  addItem(curatedById.access, "leashDetails", "Leash details", s.leashDetails);
  addItem(curatedById.access, "policyNotes", "Policy notes", s.policyNotes);
  addItem(curatedById.access, "policySourceTitle", "Policy source", s.policySourceTitle);
  addItem(curatedById.access, "policyConfidence", "Policy confidence", s.policyConfidence, "number");
  addItem(curatedById.access, "accessRules", "Access rules", s.accessRules, "json");
  addItem(curatedById.access, "accessRulesReasons", "Access rules reasons", s.accessRulesReasons, "json");
  addItem(curatedById.access, "accessPoints", "Access points", s.accessPoints, "json");

  curatedById.amenities = [];
  addItem(curatedById.amenities, "amenitiesCounts", "Amenities counts", s.amenitiesCounts, "json");
  addItem(curatedById.amenities, "parkingCount", "Parking count", s.parkingCount, "number");
  addItem(curatedById.amenities, "parkingFeeKnown", "Parking fee known", s.parkingFeeKnown, "json");
  addItem(curatedById.amenities, "parkingCapacityEstimate", "Parking capacity estimate", s.parkingCapacityEstimate, "number");

  curatedById.surface = [];
  addItem(curatedById.surface, "asphaltPercent", "Asphalt percent", s.asphaltPercent, "percent");
  addItem(curatedById.surface, "naturalSurfacePercent", "Natural surface percent", s.naturalSurfacePercent, "percent");
  addItem(curatedById.surface, "pavedPercentProxy", "Paved percent (proxy)", s.pavedPercentProxy, "percent");
  addItem(curatedById.surface, "surfaceSummary", "Surface summary", s.surfaceSummary, "json");
  addItem(curatedById.surface, "surfaceBreakdown", "Surface breakdown", s.surfaceBreakdown, "json");
  addItem(curatedById.surface, "widthSummary", "Width summary", s.widthSummary, "json");

  curatedById.water = [];
  addItem(curatedById.water, "waterNearScore", "Water near score", s.waterNearScore, "number");
  addItem(curatedById.water, "waterTypesNearby", "Water types nearby", s.waterTypesNearby, "json");
  addItem(curatedById.water, "waterNearPercent", "Water near percent", s.waterNearPercent, "percent");
  addItem(curatedById.water, "swimLikely", "Swim likely", s.swimLikely, "json");
  addItem(curatedById.water, "swimAccessPointsCount", "Swim access points count", s.swimAccessPointsCount, "number");
  addItem(curatedById.water, "swimAccessPointsByType", "Swim access points by type", s.swimAccessPointsByType, "json");

  curatedById.elevation = [];
  addItem(curatedById.elevation, "elevationGainFt", "Elevation gain (ft)", s.elevationGainFt, "number");
  addItem(curatedById.elevation, "elevationLossFt", "Elevation loss (ft)", s.elevationLossFt, "number");
  addItem(curatedById.elevation, "elevationMinFt", "Elevation min (ft)", s.elevationMinFt, "number");
  addItem(curatedById.elevation, "elevationMaxFt", "Elevation max (ft)", s.elevationMaxFt, "number");
  addItem(curatedById.elevation, "gradeP50", "Grade p50", s.gradeP50, "number");
  addItem(curatedById.elevation, "gradeP90", "Grade p90", s.gradeP90, "number");
  addItem(curatedById.elevation, "elevationSampleCount", "Elevation sample count", s.elevationSampleCount, "number");

  curatedById.hazards = [];
  addItem(curatedById.hazards, "hazardPoints", "hazardPoints", s.hazardPoints);
  addItem(curatedById.hazards, "hazards", "hazards", s.hazards);
  addItem(curatedById.hazards, "hazardsClass", "hazardsClass", s.hazardsClass);
  addItem(curatedById.hazards, "hazardsLastComputedAt", "hazardsLastComputedAt", s.hazardsLastComputedAt);
  addItem(curatedById.hazards, "hazardsReasons", "hazardsReasons", s.hazardsReasons);
  addItem(curatedById.hazards, "hazardsScore", "hazardsScore", s.hazardsScore);

  curatedById.nightWinter = [];
  addItem(curatedById.nightWinter, "winterClass", "Winter class", s.winterClass, "text");
  addItem(curatedById.nightWinter, "winterScore", "Winter score", s.winterScore, "number");
  addItem(curatedById.nightWinter, "winterReasons", "Winter reasons", s.winterReasons, "json");
  addItem(curatedById.nightWinter, "winterLikelyMaintained", "Winter likely maintained", s.winterLikelyMaintained);
  addItem(curatedById.nightWinter, "winterTagFound", "Winter tag found", s.winterTagFound, "text");

  const topKeys = listTopLevelKeys(s);
  const mappedTopLevel = new Set<string>();
  for (const item of glance) addMappedKey(mappedTopLevel, item.key);
  for (const items of Object.values(curatedById)) for (const it of items) addMappedKey(mappedTopLevel, it.key);

  const sections: DisplaySection[] = [];
  for (const rule of SECTION_RULES) {
    const curated = curatedById[rule.id] ?? [];
    const autoCandidates = new Set<string>();

    // explicit keys
    for (const k of rule.explicitKeys ?? []) {
      if (DISPLAY_HIDDEN_KEYS.has(k) || mappedTopLevel.has(k)) continue;
      if (!isEmptyValue((s as any)[k])) autoCandidates.add(k);
    }

    // prefix matches (top-level)
    const prefixes = (rule.prefixes ?? []).map((p) => p.toLowerCase());
    if (prefixes.length) {
      for (const k of topKeys) {
        if (DISPLAY_HIDDEN_KEYS.has(k) || mappedTopLevel.has(k)) continue;
        const low = k.toLowerCase();
        if (prefixes.some((p) => low.startsWith(p))) autoCandidates.add(k);
      }
    }

    // nested paths
    for (const p of rule.nestedPaths ?? []) {
      if (DISPLAY_HIDDEN_KEYS.has(p) || mappedTopLevel.has(p) || mappedTopLevel.has(p.split(".")[0])) continue;
      if (hasPath(s, p)) autoCandidates.add(p);
    }

    const autoItems: DisplayItem[] = [];
    for (const keyOrPath of Array.from(autoCandidates).sort((a, b) => a.localeCompare(b))) {
      const value = keyOrPath.includes(".") ? getPath(s, keyOrPath) : (s as any)[keyOrPath];
      addCandidateItems(autoItems, keyOrPath, value);
      addMappedKey(mappedTopLevel, keyOrPath);
    }

    const items = [...curated, ...autoItems];
    if (items.length) sections.push({ id: rule.id, title: rule.title, items });
  }

  return { glance, sections };
}

