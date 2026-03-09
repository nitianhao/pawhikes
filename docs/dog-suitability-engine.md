# Dog Suitability Engine

**File:** `src/lib/trails/suitabilityEngine.ts`
**UI component:** `src/components/trails/DogSuitabilitySummary.tsx`
**Page position:** Between `DogFitSnapshot` and `SafetyConditionsSnapshot`

---

## Purpose

Provides a **deterministic, data-grounded** suitability summary for dog owners visiting a trail detail page. Answers:

1. Which dog types does this trail suit well?
2. Which dogs should approach with caution?
3. When is it most comfortable?
4. What are the main trail characteristics?

No LLM calls. No runtime inference. Every output is grounded in at least one structured field from `TrailSystemForPage`.

---

## Architecture

```
TrailSystemForPage
       │
       ▼
normalizeInput()          ← extracts + type-normalises all relevant fields
       │
       ├──▶ getBestFor()         → SuitabilityItem[]
       ├──▶ getAvoidIf()         → Warning[]
       ├──▶ getBestTimeWindows() → TimeWindow[]
       ├──▶ getComfortSummary()  → string[]
       └──▶ getSuitabilityVerdict() → SuitabilityVerdict
              │
              └──▶ computeHeadline()
       │
       ▼
computeSuitability()      ← top-level entry point → SuitabilityOutput
       │
       ▼
DogSuitabilitySummary     ← React component renders the output
```

---

## Input Fields Used

| Field (on TrailSystemForPage) | Used for |
|-------------------------------|----------|
| `lengthMilesTotal` | Distance checks (short/long/medium) |
| `gradeP50` | Median slope — senior/easy walk/flat detection |
| `gradeP90` | Peak slope — small dog / senior steep warnings |
| `elevationGainFt` | Cumulative climb — high-energy detection |
| `roughnessRisk` | Surface roughness — small dog / senior surface |
| `naturalSurfacePercent` | Comfort highlight: natural surface |
| `pavedPercentProxy` / `asphaltPercent` | Comfort highlight: paved |
| `shadeClass` | Shade tier — heat-sensitive best-for / warnings |
| `shadeProxyPercent` | Shade % (0–1 or 0–100, normalised) |
| `heatRisk` | Heat exposure — heat-sensitive warnings |
| `waterNearPercent` / `waterNearScore` | Water proximity — water-lover detection |
| `swimLikely` | Confirmed swim access |
| `swimAccessPointsCount` | Swim spot count |
| `waterTypesNearby` | Water type (river, lake, stream…) |
| `crowdClass` | Crowd level — reactive dog best-for / caution |
| `hazardsClass` | Hazard level — general caution |
| `reactiveDogFriendly` | Explicit reactive-dog flag |
| `leashPolicy` | Parsed to isOnLeash / isOffLeash |
| `bailoutScore` | Beginner-hiker detection |
| `mudRisk` | Seasonal time-window guidance |
| `winterClass` | (Reserved for future winter time-window) |
| `nightClass` | Evening access detection |

---

## Output Types

```ts
type SuitabilityOutput = {
  verdict:           SuitabilityVerdict;   // headline + level
  bestFor:           SuitabilityItem[];    // dog types this trail suits
  avoidIf:           Warning[];            // caution/risk items
  bestTimeWindows:   TimeWindow[];         // when to go
  comfortHighlights: string[];             // 1–3 bullet points
  hasEnoughData:     boolean;              // false if <3 known fields
};

type VerdictLevel = "excellent" | "good" | "moderate" | "limited" | "unknown";
type Confidence   = "strong" | "moderate";  // moderate = 1 field; strong = 2+
```

---

## Rule Authoring Rules

1. Each rule requires **≥1 supporting data field** — omit if fields are null.
2. Use `"caution"` severity unless **≥2 strong negative signals** are present.
3. `confidence="strong"` requires **≥2 corroborating data fields**.
4. `confidence="moderate"` requires **≥1 field**; omit if absent.
5. **Never state** something the data doesn't directly support.
6. To extend: add a new rule block in `getBestFor()` or `getAvoidIf()`.

---

## Dog Categories

| Category | Rule summary |
|----------|-------------|
| `senior_dogs` | gradeP50 < 5 AND roughnessRisk not "high" |
| `small_dogs` | gradeP90 < 10 AND dist < 4 AND roughnessRisk not "high" |
| `easy_walks` | gradeP50 < 4 AND dist < 4 (overlaps senior/small intentionally) |
| `heat_sensitive` | shadeClass="high" OR shadePct ≥ 60, AND heatRisk != "high" |
| `reactive_dogs` | crowdClass="low" AND (isOnLeash OR policy present) |
| `water_lovers` | swimLikely OR swimCount > 0 (moderate: waterNearPct ≥ 40) |
| `high_energy` | dist ≥ 5 AND (gainFt > 250 OR gradeP90 > 8) |
| `beginner_hikers` | gradeP50 < 5 AND dist 1–4.5 AND bailoutScore > 0 |

---

## Verdict Scoring

Base score: 60

| Signal | Change |
|--------|--------|
| shadeClass = "high" | +10 |
| shadePct ≥ 60 | +5 |
| swimLikely / swimCount > 0 | +8 |
| crowdClass = "low" | +8 |
| gradeP50 < 4 | +8 |
| roughnessRisk = "low" | +6 |
| hazardsClass = "low" | +5 |
| isOnLeash | +4 |
| heatRisk = "high" AND shadeClass != "high" | -20 |
| heatRisk = "high" (shaded) | -8 |
| shadeClass = "low" AND heatRisk not "low" | -12 |
| crowdClass = "high" | -12 |
| hazardsClass = "high" | -18 |
| roughnessRisk = "high" | -10 |
| gradeP50 > 10 | -14 |
| isOffLeash AND crowdClass = "high" | -10 |
| mudRisk = "high" | -5 |

Score → level: ≥82 = excellent, ≥66 = good, ≥48 = moderate, else = limited.

---

## Graceful Degradation

- If `hasEnoughData` is false AND `bestFor` is empty AND `avoidIf` is empty → component renders `null`
- Individual rule blocks are skipped when their required fields are null
- Confidence is `"moderate"` (not omitted) when only 1 field supports a recommendation

---

## Limitations

- No seasonal date context — time-window guidance is general, not date-specific
- `swimLikely` requires enrichment to be run; falls back to `waterNearPct` if absent
- `reactiveDogFriendly` field rarely populated — reactive detection relies primarily on `crowdClass`
- `bailoutScore` required for `beginner_hikers` category; trails without it won't get this label

---

## Future Extensions

- Add `senior_dogs` `avoidIf` when `dist > 8 AND gainFt > 1000`
- Add `winter_dogs` category when `winterClass = "accessible"`
- Surface `amenitiesScore` in `getComfortSummary` when field is consistently populated
- Add puppy/young-dog category based on surface + distance
