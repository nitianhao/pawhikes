# Dog Suitability Engine — Test Cases

These scenarios exercise `computeSuitability()` in `src/lib/trails/suitabilityEngine.ts`.
Each case lists the key input fields, expected outputs, and the rule being validated.

---

## Scenario 1: Ideal urban trail (flat, shaded, quiet)

**Input fields:**
```ts
gradeP50: 2, gradeP90: 5, elevationGainFt: 80, lengthMilesTotal: 2.8,
shadeClass: "high", shadeProxyPercent: 0.72, heatRisk: "low",
roughnessRisk: "low", crowdClass: "low",
hazardsClass: "low", bailoutScore: 3,
leashPolicy: "on-leash required"
```

**Expected outputs:**
- `verdict.level`: `"excellent"`
- `verdict.headline`: contains "well-shaded" and "comfortable for most dogs"
- `bestFor`: includes `senior_dogs`, `small_dogs`, `easy_walks`, `heat_sensitive`, `reactive_dogs`, `beginner_hikers`
- `avoidIf`: empty
- `comfortHighlights`: includes shade % (~72%), flat note, low traffic note

**Rules validated:** Senior/small/easy flat rule, shade heat-sensitive positive, reactive low-crowd positive, beginner flat+bail rule

---

## Scenario 2: Hot exposed trail with no shade

**Input fields:**
```ts
gradeP50: 3, gradeP90: 7, lengthMilesTotal: 3.5,
shadeClass: "low", shadeProxyPercent: 0.08, heatRisk: "high",
roughnessRisk: "medium", crowdClass: "medium"
```

**Expected outputs:**
- `verdict.level`: `"limited"` or `"moderate"` (score penalised by -20 for heat+low shade)
- `verdict.headline`: contains "exposed" and "plan around heat"
- `bestFor`: no `heat_sensitive` category
- `avoidIf`: `{ label: "Heat-sensitive dogs", severity: "risk" }` — noShade=true triggers "risk"
- `bestTimeWindows`: includes "Before 10 AM or after 6 PM"

**Rules validated:** Heat+noShade = risk severity, verdict heat caveat headline, time window heat rule

---

## Scenario 3: Mountain trail — high elevation gain, steep

**Input fields:**
```ts
gradeP50: 12, gradeP90: 22, elevationGainFt: 1800, lengthMilesTotal: 8.5,
shadeClass: "medium", shadeProxyPercent: 0.40, heatRisk: "medium",
roughnessRisk: "high", crowdClass: "low"
```

**Expected outputs:**
- `verdict.level`: `"moderate"` (gradeP50 > 10 → -14; roughnessRisk high → -10; but crowdClass low → +8)
- `bestFor`: includes `high_energy` (dist ≥ 5 AND gainFt > 250 AND gradeP90 > 8)
- `avoidIf`:
  - `{ label: "Senior dogs", reason: includes "steep sections" }` (gradeP90 > 15)
  - `{ label: "Small dogs", reason: includes "rough surface and steep" }` (roughnessRisk=high AND gradeP90 > 12)
- `comfortHighlights`: includes elevation gain + distance
- `bestFor`: no `senior_dogs`, no `small_dogs`, no `easy_walks`

**Rules validated:** High-energy positive, senior steep warning, small rough+steep combined reason, score penalty stacking

---

## Scenario 4: Water trail with swim access

**Input fields:**
```ts
gradeP50: 4, gradeP90: 9, lengthMilesTotal: 5.2,
swimLikely: true, swimAccessPointsCount: 3, waterNearPercent: 0.78,
waterTypesNearby: ["river", "stream"],
shadeClass: "medium", heatRisk: "medium",
roughnessRisk: "medium", crowdClass: "medium"
```

**Expected outputs:**
- `bestFor`: includes `water_lovers` with `confidence: "strong"` and count in reason ("3 spots")
- `bestFor`: includes `high_energy` (dist ≥ 5, gradeP90 > 8)
- `verdict.headline`: contains "with swim access"
- `comfortHighlights`: includes "Swim access confirmed" or swim mention
- `avoidIf`: no heat warning (heatRisk = "medium", not "high")

**Rules validated:** swimLikely=true → strong water-lover, swimCount plural reason, waterside headline character

---

## Scenario 5: Busy park with off-leash area

**Input fields:**
```ts
gradeP50: 5, gradeP90: 10, lengthMilesTotal: 3.0,
shadeClass: "medium", heatRisk: "low",
roughnessRisk: "low", crowdClass: "high",
leashPolicy: "off-leash allowed in designated areas"
```

**Expected outputs:**
- `verdict.level`: `"moderate"` (crowdClass high → -12; isOffLeash + crowdClass high → -10)
- `verdict.headline`: contains "busy; best for calm dogs"
- `bestFor`: no `reactive_dogs`
- `avoidIf`: `{ label: "Reactive dogs", severity: "risk" }` — offLeash AND crowdClass=high → "risk"
- `bestTimeWindows`: includes "Weekday mornings"

**Rules validated:** Busy+offLeash = reactive risk, weekday-morning time window, verdict busy headline

---

## Scenario 6: Short, rough natural trail

**Input fields:**
```ts
gradeP50: 6, gradeP90: 14, lengthMilesTotal: 1.8,
roughnessRisk: "high", shadeClass: "low",
heatRisk: "medium", crowdClass: "low",
swimLikely: false, waterNearPercent: 0.10
```

**Expected outputs:**
- `bestFor`: `reactive_dogs` (crowdClass low) — but no senior or small dogs due to rough/steep
- `avoidIf`:
  - `{ label: "Small dogs", reason: includes "Rough trail surface" }` (roughnessRisk=high, gradeP90 not > 12)
  - `{ label: "Heat-sensitive dogs", reason: includes "Mostly exposed trail" }` (shadeClass=low, heatRisk not "low")
- `bestFor`: no `senior_dogs` (roughnessRisk=high blocks it), no `easy_walks` (gradeP50 not < 4)

**Rules validated:** Small-dog rough-only (no steep bonus since 90th < 12+), shade=low+heat=medium caution, reactive quiet positive

---

## Scenario 7: Sparse data trail (unknown enrichment)

**Input fields:**
```ts
lengthMilesTotal: 4.1,
gradeP50: null, gradeP90: null,
shadeClass: "", heatRisk: "",
roughnessRisk: "", crowdClass: "",
swimLikely: null, waterNearPercent: null
```

**Expected outputs:**
- `hasEnoughData`: `false`
- `verdict.level`: `"unknown"`
- `verdict.headline`: "Limited data — basic assessment only"
- `bestFor`: empty (no rule triggers — all require at least one known field)
- `avoidIf`: empty
- `comfortHighlights`: `["4.1 mi total — plan accordingly"]` (distance fallback)
- Component: renders `null` (hasEnoughData=false AND bestFor=[] AND avoidIf=[])

**Rules validated:** Graceful degradation path, unknown verdict level, distance fallback in comfortHighlights

---

## Scenario 8: Reactive-friendly explicit flag

**Input fields:**
```ts
gradeP50: 5, gradeP90: 8, lengthMilesTotal: 3.2,
shadeClass: "medium", heatRisk: "low",
roughnessRisk: "low", crowdClass: "medium",
reactiveDogFriendly: true,
leashPolicy: "on-leash required"
```

**Expected outputs:**
- `bestFor`: includes `reactive_dogs` with `reason: "Trail conditions noted as suitable for reactive dogs"` and `confidence: "strong"`
- Note: explicit flag overrides crowd-level check — medium crowds don't block the positive

**Rules validated:** reactiveFriendly=true takes precedence, explicit reason copy, confidence=strong on explicit flag

---

## Scenario 9: Evening-viable lit trail in mixed conditions

**Input fields:**
```ts
gradeP50: 4, gradeP90: 8, lengthMilesTotal: 2.5,
shadeClass: "low", heatRisk: "high",
roughnessRisk: "low", crowdClass: "medium",
nightClass: "lit", mudRisk: "medium"
```

**Expected outputs:**
- `bestTimeWindows`:
  - "Before 10 AM or after 6 PM" — significantHeat (heatRisk=high)
  - "Weekday visits" — crowdClass=medium
  - "Evening walks possible" — nightClass="lit"
  - "Avoid after heavy rain" — mudRisk=medium
- `avoidIf`: heat-sensitive caution (heatRisk=high but shade unknown — uses heatRisk=high with shadeClass not "high")

**Rules validated:** All 4 time window rule paths triggering simultaneously, heat caution (not risk since shade not explicitly low)

---

## Running These Tests

These are manually inspectable scenarios. To verify via code:

```ts
import { computeSuitability } from "@/lib/trails/suitabilityEngine";

const result = computeSuitability({
  // ...fields from scenario above
} as any);

console.log(result.verdict.level);      // check level
console.log(result.bestFor.map(b => b.category)); // check categories
console.log(result.avoidIf.map(w => w.severity)); // check severities
```

All rules are pure functions — no side effects, no async, no DB calls. Each function can be called in isolation for unit testing.
