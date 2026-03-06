/**
 * FAQ question selection (deterministic, no LLM) and facts-pack builder.
 *
 * selectQuestions()  → picks 5 core + up to 5 conditional questions
 * buildFactsPack()   → extracts only the fields relevant to chosen questions
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuestionDef {
  /** The question text sent to the LLM. */
  q: string;
  /** DB field names that directly support this question. */
  evidence: string[];
  /** Confidence hint passed alongside the question. */
  baseConfidence: "high" | "medium" | "low";
}

type Trail = Record<string, unknown>;

// ─── Core questions (always included) ────────────────────────────────────────

function getCoreQuestions(sys: Trail): QuestionDef[] {
  const name = String(sys.name ?? "this trail");

  return [
    // a) Dogs allowed?
    {
      q: `Are dogs allowed on ${name}?`,
      evidence: [
        "dogsAllowed",
        "leashPolicy",
        "policyConfidence",
        "policyMethod",
        "policyNotes",
        "policySourceTitle",
        "policySourceUrl",
        "policyVerifiedAt",
      ],
      baseConfidence:
        sys.dogsAllowed != null
          ? "high"
          : sys.leashPolicy != null
          ? "medium"
          : "low",
    },

    // b) Leash required?
    {
      q: `Do dogs need to be on a leash on ${name}?`,
      evidence: [
        "leashPolicy",
        "leashDetails",
        "policyConfidence",
        "policyNotes",
        "policySourceUrl",
      ],
      baseConfidence: sys.leashPolicy != null ? "high" : "low",
    },

    // c) Drinking water for dogs?
    {
      q: `Is there drinking water available for dogs along ${name}?`,
      evidence: [
        "amenitiesCounts",
        "trailheadPOIs",
        "waterNearPercent",
        "waterTypesNearby",
        "amenitiesIndexScore",
      ],
      baseConfidence:
        sys.amenitiesCounts != null
          ? "medium"
          : sys.waterNearPercent != null
          ? "low"
          : "low",
    },

    // d) Shade or exposed?
    {
      q: `Is ${name} mostly shaded or sun-exposed?`,
      evidence: [
        "shadeClass",
        "shadeProxyPercent",
        "shadeProxyScore",
        "shadeSources",
        "heatRisk",
      ],
      baseConfidence:
        sys.shadeClass != null
          ? "high"
          : sys.shadeProxyPercent != null
          ? "medium"
          : "low",
    },

    // e) Trail surface for paws?
    {
      q: `What is the trail surface like for dog paws on ${name}?`,
      evidence: [
        "surfaceSummary",
        "surfaceBreakdown",
        "asphaltPercent",
        "naturalSurfacePercent",
        "pavedPercentProxy",
        "roughnessRisk",
        "lengthMilesTotal",
        "segmentCount",
      ],
      baseConfidence:
        sys.surfaceSummary != null || sys.surfaceBreakdown != null
          ? "high"
          : sys.asphaltPercent != null
          ? "medium"
          : "low",
    },
  ];
}

// ─── Conditional questions (up to 5, added when data exists) ─────────────────

function getConditionalQuestions(sys: Trail): QuestionDef[] {
  const name = String(sys.name ?? "this trail");
  const candidates: QuestionDef[] = [];

  // Mud after rain
  if (sys.mudRisk != null || sys.mudRiskScore != null) {
    candidates.push({
      q: `How muddy does ${name} get after rain?`,
      evidence: ["mudRisk", "mudRiskReason", "mudRiskScore", "naturalSurfacePercent", "surfaceSummary"],
      baseConfidence: sys.mudRisk != null ? "high" : "medium",
    });
  }

  // Crowding / best times
  if (sys.crowdClass != null || sys.crowdProxyScore != null) {
    candidates.push({
      q: `How crowded does ${name} get, and when is the best time to visit?`,
      evidence: ["crowdClass", "crowdProxyScore", "crowdReasons"],
      baseConfidence: sys.crowdClass != null ? "high" : "medium",
    });
  }

  // Parking
  if (
    sys.parkingCount != null ||
    sys.parkingCapacityEstimate != null ||
    sys.parkingFeeKnown != null
  ) {
    candidates.push({
      q: `What is the parking situation at ${name}?`,
      evidence: [
        "parkingCount",
        "parkingCapacityEstimate",
        "parkingFeeKnown",
        "accessRules",
        "accessRulesClass",
      ],
      baseConfidence:
        sys.parkingCapacityEstimate != null
          ? "high"
          : sys.parkingCount != null
          ? "medium"
          : "medium",
    });
  }

  // Amenities (restrooms, bins, benches — distinct from the drinking water question)
  if (sys.amenitiesCounts != null || sys.amenitiesIndexScore != null) {
    candidates.push({
      q: `What amenities are available at ${name} (restrooms, waste bins, benches)?`,
      evidence: ["amenitiesCounts", "amenitiesIndexScore"],
      baseConfidence: sys.amenitiesCounts != null ? "high" : "low",
    });
  }

  // Safety (heat, rough terrain, water crossings)
  const hasSafety =
    sys.hazardsClass != null ||
    sys.heatRisk != null ||
    sys.roughnessRisk != null ||
    sys.swimLikely != null;

  if (hasSafety) {
    candidates.push({
      q: `Are there any safety concerns for dogs on ${name} (heat, terrain, water crossings)?`,
      evidence: [
        "hazardsClass",
        "hazardsScore",
        "hazards",
        "hazardsReasons",
        "heatRisk",
        "roughnessRisk",
        "swimLikely",
        "swimAccessPoints",
        "waterNearPercent",
      ],
      baseConfidence: sys.hazardsClass != null ? "high" : "medium",
    });
  }

  return candidates.slice(0, 5);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Deterministically select 5 core + ≤5 conditional questions for a trail. */
export function selectQuestions(sys: Trail): QuestionDef[] {
  return [...getCoreQuestions(sys), ...getConditionalQuestions(sys)];
}

/**
 * Build a compact facts pack containing only fields relevant to the chosen
 * questions. Strips large/noisy objects that could confuse the LLM.
 */
export function buildFactsPack(
  sys: Trail,
  questions: QuestionDef[]
): Record<string, unknown> {
  const fields = new Set(questions.flatMap((q) => q.evidence));
  const pack: Record<string, unknown> = {};

  // Always include identity fields for context
  const identityFields = ["name", "city", "state", "county", "lengthMilesTotal", "slug"];
  for (const f of identityFields) {
    if (sys[f] != null) pack[f] = sys[f];
  }

  for (const field of fields) {
    const val = sys[field];
    if (val == null) continue;

    if (field === "raw") continue; // raw GIS data is huge and irrelevant

    if (field === "trailheadPOIs" && Array.isArray(val)) {
      // Large POI array — summarize instead of embedding full records
      const kinds = [
        ...new Set(
          val.map((p: Record<string, unknown>) =>
            String(p.kind ?? p.amenity ?? "unknown")
          ).filter((k) => k !== "unknown")
        ),
      ];
      pack["trailheadPOIs_count"] = val.length;
      pack["trailheadPOIs_kinds"] = kinds;
      continue;
    }

    if (field === "accessRules" && typeof val === "object" && val !== null) {
      // Flatten just the text/class parts — not the full nested object
      const ar = val as Record<string, unknown>;
      const summary: Record<string, unknown> = {};
      for (const k of ["class", "hours", "fee", "notes", "source"]) {
        if (ar[k] != null) summary[k] = ar[k];
      }
      if (Object.keys(summary).length > 0) pack["accessRules_summary"] = summary;
      continue;
    }

    if (field === "crowdReasons" && Array.isArray(val) && val.length > 5) {
      // Only include the top reasons to keep the prompt size down
      pack[field] = val.slice(0, 5);
      continue;
    }

    pack[field] = val;
  }

  return pack;
}
