# Trail Top-of-Page Migration

## What changed

### Replaced

| Old element | Replacement | Notes |
|---|---|---|
| Inline hero JSX (page.tsx lines 531–691) | `TrailHero` component | Light background, tokenized StatTiles, no decorative gradient |
| `DogPolicyBanner` component | `DogFitSnapshot` component | Merged with DogTypesSection; chips use design system Chip primitive |
| Map placed immediately after hero | Map placed after both snapshots | Decision blocks now precede spatial context |

### Created

| File | Purpose |
|---|---|
| `src/components/trail/TrailHero.tsx` | Compact utility hero — name, location, verdict, 4 StatTiles, trust row, best entry |
| `src/components/trail/DogFitSnapshot.tsx` | Dog policy status chips + leash details callout + DogTypesSection behind Disclosure |
| `src/components/trail/SafetyConditionsSnapshot.tsx` | 4-tile snapshot: hazards, shade/heat, crowd, nearest vet; conditional callouts |

### New top-of-page order

```
breadcrumb nav
TrailHero          ← compact, light bg, decision-first
DogFitSnapshot     ← policy chips + dog type detail on demand
SafetyConditionsSnapshot  ← 4 signals + hazard/heat callouts
Map                ← spatial context, no longer first
--- lower sections unchanged ---
```

---

## Data sources reused

All data comes from the same `system` object fetched by `getTrailSystemHeadsAndSegmentsForPage`. No new DB queries added.

**TrailHero** uses: `name`, `city`, `state`, `county`, `lengthMilesTotal`, `routeType`, `dogsAllowed`, `leashPolicy`, `shadeClass`, `shadeProxyPercent`, `elevationGainFt` (via `elevationProfile` computed var), `policySourceTitle`, `policySourceUrl`, `seoContent.sections.intro.a`, `hasCertifiedPolicy` (computed), `bestEntryName` (computed from trailHeads), `computedSeasonGuidance` (computed).

**DogFitSnapshot** uses: `dogsAllowed`, `leashPolicy`, `leashDetails`, `policySourceUrl`, `policySourceTitle`, `hasCertifiedPolicy`; passes full `system` to `DogTypesSection`.

**SafetyConditionsSnapshot** uses: `hazardsClass`, `hazardsReasons`, `hazards`, `shadeClass`, `shadeProxyPercent`, `heatRisk`, `crowdClass`, `crowdReasons`, `safety.nearbyVets` (via `safetyVets`), `winterClass`, `mudRisk`.

---

## Duplicated content removed

| Removed from top flow | Still available lower |
|---|---|
| Dark green hero chip row (Dogs, Leash, Distance, Effort) | `InsightCard id="terrain"` headline + `ElevationWidthSection` |
| Secondary signals row (Heat, Shade, Crowd) | `InsightCard id="shade"`, `InsightCard id="conditions"` |
| Season guidance in hero footer | `InsightCard id="planning"` headline |
| `DogPolicyBanner` section (full standalone card) | `InsightCard id="dog-fit"` still present in TrailDashboard for detail |
| Best-entry footer in dark hero | Kept in `TrailHero` trust row |

---

## Preserved (not moved or removed)

- `InsightCard id="dog-fit"` in `TrailDashboard` — still renders full `DogTypesSection` cards and leash rule headline; `DogFitSnapshot` is the above-fold summary, the InsightCard is the detail view
- All other `TrailDashboard` cards unchanged: terrain, surface, shade, water, conditions, planning, highlights
- `RulesAndSafetySection` unchanged
- `FaqSection` unchanged
- Debug/QA block unchanged (conditionally rendered)

---

## Unresolved gaps

1. **No aggregate "suitability score"**: `TrailHero` uses a heuristic verdict string (elevation gain per mile → effort label). There is no single normalized dog-suitability score field in the DB.
2. **effortLabel derivation**: The `elevationProfile.label` is computed from `elevationGainFt / lengthMilesTotal`. If neither field is present, the Effort tile shows "—".
3. **Nearest vet metric**: `safetyVets` comes from `system.safety.nearbyVets`, which may be empty for many trails. The tile shows "Unknown" in that case — not harmful but not ideal.
4. **Shade tile on no-data trails**: `shadeClass` may be null for trails that haven't been enriched. The tile falls back to "Unknown" with neutral tone.
5. **leashDetails callout**: Only shown when `leashDetails` is ≤200 chars. Longer policy text is still visible in the lower `InsightCard id="dog-fit"`.
