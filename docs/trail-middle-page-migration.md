# Trail Detail — Middle-Page Migration

## What Changed

The middle section of the trail detail page was consolidated from a stack of independent InsightCard/TrailDashboard wrappers into 4 unified section groups using the design system primitives (`Section`, `StatTile`, `Disclosure`).

## New Section Order

```
TrailHero                     (prior session)
DogFitSnapshot                (prior session)
SafetyConditionsSnapshot      (prior session)
TerrainComfortSection         ← NEW
AccessEntrySection            ← NEW
MapSpatialSection             ← NEW
ExploreMoreSection            ← NEW
InsightCard id="dog-fit"      (kept — DogTypesSection full detail)
RulesAndSafetySection         (unchanged)
FAQ InsightCard               (unchanged)
```

## New Files

| File | Purpose |
|---|---|
| `src/components/trails/TerrainComfortSection.tsx` | Elevation, surface, shade, water under one Section with 4-stat overview row |
| `src/components/trails/AccessEntrySection.tsx` | Trailheads, parking stats, route amenities |
| `src/components/trails/MapSpatialSection.tsx` | Map wrapped in Section shell |
| `src/components/trails/ExploreMoreSection.tsx` | Highlights explorer + bailout Disclosure |

## Removed from page.tsx

- `TrailDashboard` wrapper
- `InsightCard id="terrain"` (ElevationWidthSection)
- `InsightCard id="surface"` (SurfaceSection)
- `InsightCard id="shade"` (ShadeSection)
- `InsightCard id="water"` (WaterSection)
- `InsightCard id="conditions"` (AfterDarkSection, MudRiskSection, WinterSection, LightingSection, CrowdSection, SwimSection)
- `InsightCard id="planning"` (AmenitiesGrid, ParkingSection, RouteAmenitiesSection)
- `InsightCard id="highlights"` (HighlightProfileChart, HikeHighlightsSection)
- `InsightCard id="trailheads"` (TrailheadsSection)
- Bare `TrailSegmentsMapClient` drop-in (now inside MapSpatialSection)

## Reused Components (no changes to internals)

All existing section components are reused as-is inside the new groupings:
- `ElevationWidthSection`, `SurfaceSection`, `ShadeSection`, `WaterSection` → inside TerrainComfortSection
- `TrailheadsSection`, `ParkingSection`, `RouteAmenitiesSection` → inside AccessEntrySection
- `TrailSegmentsMapClient` → inside MapSpatialSection
- `HikeHighlightsSection`, `HighlightProfileChart`, `BailoutOptionsSection` → inside ExploreMoreSection

## Deferred (Removed from Primary Flow)

The following detail components were inside `InsightCard id="conditions"` and are not yet reintegrated:
- `AfterDarkSection`
- `MudRiskSection`
- `WinterSection`
- `LightingSection`
- `CrowdSection`
- `SwimSection`

`SafetyConditionsSnapshot` already surfaces the key signals (hazards, shade/heat, crowd, vet proximity). These full detail components can be reintegrated in a future conditions-detail pass — either inside `TerrainComfortSection` or a new `SafetyConditionsDetail` section.

## Imports Removed from page.tsx

Removed as no longer used directly in page.tsx:
- `AmenitiesGrid`, `CrowdSection`, `ShadeSection`, `SurfaceSection`, `WaterSection`
- `LightingSection`, `MudRiskSection`, `AfterDarkSection`, `SwimSection`, `WinterSection`
- `HikeHighlightsSection`, `HighlightProfileChart`, `ElevationWidthSection`
- `ParkingSection`, `RouteAmenitiesSection`, `TrailheadsSection`
- `TrailSegmentsMapClient`, `TrailDashboard`
- `MetricGrid`, `TrailIcons` (from TrailPictograms)
- `SafetySection`, `HazardsSection` (were imported but unused even before this migration)
- `getShadeTierLabel` (still imported from ShadeSection for `getShadeShortLabel` only)

## Unused Functions Removed from page.tsx

- `waterSummaryLabel` (moved inline into TerrainComfortSection)
- `lightingSummaryLabel`, `afterDarkSummaryLabel` (conditions detail deferred)
- `swimSummaryLabel` (conditions detail deferred)

## Unused Variables Removed from page.tsx

- `shadeTierLabel` (was used in shade InsightCard headline)
- `hasLightingReported` + its 4 input variables (`litKnownSamplesValue`, etc.)
