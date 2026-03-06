/**
 * Comprehensive facts-pack builder for trail content generation.
 *
 * Covers all 11 page sections:
 *   intro · atAGlance · trailheadsAccess · difficultyElevation · crowd
 *   surfacePaws · shadeHeat · water · mudConditions · safetyServices · amenities
 *
 * Strips large profile arrays and raw GIS data to keep the prompt compact.
 */

type Trail = Record<string, unknown>;

// ─── Section evidence maps ─────────────────────────────────────────────────

/** DB field names that are primary evidence for each section. */
export const SECTION_EVIDENCE: Record<string, string[]> = {
  intro: [
    "name", "city", "state", "lengthMilesTotal", "dogsAllowed", "leashPolicy",
    "routeType", "shadeClass", "surfaceSummary", "crowdClass",
  ],
  atAGlance: [
    "lengthMilesTotal", "segmentCount", "elevationRangeFt",
    "gradeP50", "gradeP90", "crowdClass", "surfaceSummary", "dogsAllowed",
    "leashPolicy", "amenitiesIndexScore", "routeType",
  ],
  trailheadsAccess: [
    "accessPoints", "parkingCount", "parkingCapacityEstimate",
    "parkingFeeKnown", "accessRules", "accessRulesClass", "trailheadPOIs",
  ],
  difficultyElevation: [
    "elevationRangeFt", "elevationMinFt", "elevationMaxFt",
    "gradeP50", "gradeP90", "lengthMilesTotal", "routeType", "loopStats",
  ],
  crowd: [
    "crowdClass", "crowdProxyScore", "crowdReasons",
  ],
  surfacePaws: [
    "surfaceSummary", "surfaceBreakdown", "asphaltPercent",
    "naturalSurfacePercent", "pavedPercentProxy", "roughnessRisk", "widthSummary",
  ],
  shadeHeat: [
    "shadeClass", "shadePercent", "shadeSources", "heatRisk",
  ],
  water: [
    "waterPercent", "waterTypesNearby",
    "swimLikely", "swimAccessPointsCount", "amenitiesCounts",
  ],
  mudConditions: [
    "mudRisk", "mudRiskReason",
    "naturalSurfacePercent", "surfaceSummary",
  ],
  safetyServices: [
    "hazardsClass", "hazards", "hazardsReasons",
    "heatRisk", "swimLikely", "safety",
    "nightClass", "winterClass", "bailoutClass", "bailoutReasons",
  ],
  amenities: [
    "amenitiesCounts", "trailheadPOIs",
  ],
};

// ─── Raw score fields — never cite directly in copy ────────────────────────
// These are internal numeric scores; only class labels / percent values belong in copy.
const SCORE_FIELDS = new Set([
  "mudRiskScore", "crowdProxyScore", "waterNearScore",
  "shadeProxyScore", "hazardsScore", "amenitiesIndexScore",
  "roughnessRisk",  // numeric 0-1
]);

// ─── Fields to always skip ─────────────────────────────────────────────────

const SKIP_FIELDS = new Set([
  // Raw/geometry (huge)
  "raw", "bbox", "centroid",
  // Profile arrays (can be thousands of points)
  "elevationProfile", "shadeProfile", "surfaceProfile",
  "amenityPoints", "waterProfile", "highlightPoints",
  "hazardPoints", "swimAccessPoints", "swimAccessPointsByType",
  "bailoutPoints",
  // Large POI / highlight arrays (summarized below)
  "highlights",
  // Timestamps (no value to LLM)
  "computedAt", "crowdLastComputedAt", "mudLastComputedAt",
  "shadeLastComputedAt", "surfaceLastComputedAt", "waterLastComputedAt",
  "hazardsLastComputedAt", "nightLastComputedAt", "winterLastComputedAt",
  "logisticsLastComputedAt", "accessRulesLastComputedAt",
  "structureLastComputedAt", "safetyLastComputedAt",
  "highlightsLastComputedAt", "elevationComputedAt",
  "personalizationLastComputedAt", "trailHeadsLastLinkedAt",
  "trailHeadsLinkConfidence", "trailHeadsLinkReason",
  // Internal / GIS references
  "extDataset", "extSystemRef",
  "elevationSampleCount", "elevationProvider",
  // Internal signals (verbose, not page-displayed)
  "personalization", "routeGraphStats", "nightWinterSignals",
  "crowdSignals", "faqs",
  // Linking metadata
  "primaryTrailHeadId", "reactiveDogFriendly",
]);

// ─── Main builder ──────────────────────────────────────────────────────────

/**
 * Build a compact facts pack from a raw trailSystem record.
 * Large/nested objects are summarized; profile arrays are excluded.
 */
export function buildContentFactsPack(sys: Trail): Record<string, unknown> {
  const pack: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(sys)) {
    if (val == null) continue;
    if (SKIP_FIELDS.has(key)) continue;
    if (SCORE_FIELDS.has(key)) continue;

    // ── Special summaries for large/nested fields ────────────────────────

    if (key === "trailheadPOIs" && Array.isArray(val)) {
      const kinds = [
        ...new Set(
          val
            .map((p: Record<string, unknown>) =>
              String(p.kind ?? p.amenity ?? "unknown")
            )
            .filter((k) => k !== "unknown")
        ),
      ];
      pack["trailheadPOIs_count"] = val.length;
      pack["trailheadPOIs_kinds"] = kinds;
      continue;
    }

    if (key === "accessPoints" && Array.isArray(val)) {
      pack["accessPoints_count"] = val.length;
      const types = [
        ...new Set(
          val.map((p: Record<string, unknown>) =>
            String(p.type ?? p.accessType ?? "trailhead")
          )
        ),
      ];
      pack["accessPoints_types"] = types;
      // Include name list for the first 5 points
      const names = val
        .slice(0, 5)
        .map((p: Record<string, unknown>) => p.name)
        .filter(Boolean);
      if (names.length > 0) pack["accessPoints_names"] = names;
      continue;
    }

    if (key === "accessRules" && typeof val === "object" && val !== null) {
      const ar = val as Record<string, unknown>;
      const summary: Record<string, unknown> = {};
      for (const k of ["class", "hours", "fee", "notes", "source", "feeAmount"]) {
        if (ar[k] != null) summary[k] = ar[k];
      }
      if (Object.keys(summary).length > 0) pack["accessRules"] = summary;
      continue;
    }

    if (key === "hazards" && Array.isArray(val)) {
      pack["hazards_count"] = val.length;
      const types = val
        .slice(0, 8)
        .map((h: Record<string, unknown>) => String(h.type ?? h.name ?? "unknown"));
      pack["hazards_types"] = types;
      continue;
    }

    if (key === "hazardsReasons" && Array.isArray(val)) {
      pack[key] = val.slice(0, 5);
      continue;
    }

    if (key === "crowdReasons" && Array.isArray(val)) {
      pack[key] = val.slice(0, 5);
      continue;
    }

    if (key === "bailoutReasons" && Array.isArray(val)) {
      pack[key] = val.slice(0, 3);
      continue;
    }

    if (key === "nightReasons" && Array.isArray(val)) {
      pack[key] = val.slice(0, 3);
      continue;
    }

    if (key === "winterReasons" && Array.isArray(val)) {
      pack[key] = val.slice(0, 3);
      continue;
    }

    if (key === "loopStats" && typeof val === "object" && val !== null) {
      const ls = val as Record<string, unknown>;
      const summary: Record<string, unknown> = {};
      for (const k of ["type", "isLoop", "isOutAndBack", "isLinear", "junctionCount"]) {
        if (ls[k] != null) summary[k] = ls[k];
      }
      if (Object.keys(summary).length > 0) pack["loopStats"] = summary;
      continue;
    }

    if (key === "safety" && typeof val === "object" && val !== null) {
      const s = val as Record<string, unknown>;
      const summary: Record<string, unknown> = {};
      for (const k of [
        "nearestVetName", "nearestVetDistanceMiles", "nearestVetAddress",
        "cellCoverageClass", "cellCoverageScore",
        "emergencyAccessClass", "crossingCount",
      ]) {
        if (s[k] != null) summary[k] = s[k];
      }
      if (Object.keys(summary).length > 0) pack["safety"] = summary;
      continue;
    }

    if (key === "highlightsByType" && typeof val === "object" && val !== null) {
      // Just show which types are present and their counts
      pack["highlightsByType"] = val;
      continue;
    }

      pack[key] = val;
  }

  // ── Normalize decimal-fraction fields to human-readable percent ────────
  // shadeProxyPercent and waterNearPercent are stored as 0.0–1.0 fractions;
  // convert to 0–100 integer so the model doesn't cite raw decimals like "0.594".
  if (typeof pack["shadeProxyPercent"] === "number") {
    pack["shadePercent"] = Math.round((pack["shadeProxyPercent"] as number) * 100);
    delete pack["shadeProxyPercent"];
  }
  if (typeof pack["waterNearPercent"] === "number") {
    pack["waterPercent"] = Math.round((pack["waterNearPercent"] as number) * 100);
    delete pack["waterNearPercent"];
  }

  // ── Computed: reliable elevation range (max − min) ──────────────────────
  // elevationGainFt / elevationLossFt are cumulative sums over thousands of
  // raw samples, so they amplify sensor noise into absurd values (e.g. 16k ft
  // on a flat urban trail). Use the vertical range instead — it's always valid.
  const minFt = typeof pack["elevationMinFt"] === "number" ? pack["elevationMinFt"] as number : null;
  const maxFt = typeof pack["elevationMaxFt"] === "number" ? pack["elevationMaxFt"] as number : null;
  if (minFt !== null && maxFt !== null) {
    pack["elevationRangeFt"] = Math.round(maxFt - minFt);
  }
  // Remove noisy cumulative fields so the model can't use them
  delete pack["elevationGainFt"];
  delete pack["elevationLossFt"];

  return pack;
}

/**
 * Return the set of fields included in the facts pack for a given section,
 * intersected with what's actually present in the facts pack.
 */
export function getSectionEvidence(
  section: string,
  factsPack: Record<string, unknown>
): string[] {
  const fields = SECTION_EVIDENCE[section] ?? [];
  return fields.filter((f) => {
    // check both the raw key and derived summary keys
    return (
      factsPack[f] != null ||
      factsPack[`${f}_count`] != null ||
      factsPack[`${f}_kinds`] != null ||
      factsPack[`${f}_types`] != null ||
      factsPack[`${f}_names`] != null
    );
  });
}
