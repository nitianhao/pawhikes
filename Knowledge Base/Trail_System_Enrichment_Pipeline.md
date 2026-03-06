# Trail System Enrichment Pipeline

> **Scope:** All enrichments apply to `trailSystems` only — never `trailSegments` or `trails`.
> **Data source:** OpenStreetMap via Overpass API (plus reuse of already-computed fields).
> **Backend:** InstantDB (`@instantdb/admin`).
> **Last updated:** 2026-02-26

---

## Overview

Each enrichment follows the same pattern:

1. Load `trailSystems` filtered by `--city` / `--state`
2. Load `trailSegments` and reconstruct each system's geometry by grouping segments on `systemRef`
3. Query Overpass API for OSM data relevant to that system (bbox or around-anchor queries)
4. Compute metrics in pure TypeScript (no external GIS libraries)
5. Persist compact results back to `trailSystems` via `db.transact()`

All scripts are **dry-run by default** — pass `--write` to persist. Overpass calls use a 3-attempt retry loop across two endpoints (`overpass-api.de`, `overpass.kumi.systems`) with exponential back-off (12 s × attempt) on 429/504.

---

## Shared Helpers (used across all scripts)

| Helper | Description |
|---|---|
| `haversineM(a, b)` | Great-circle distance in metres between two `[lon, lat]` coords |
| `pointToSegmentM(p, a, b)` | Minimum distance from point to a line segment |
| `distanceToMultiLineM(p, lines)` | Minimum distance from point to entire MultiLine geometry |
| `extractLines(geom)` | Flatten GeoJSON LineString or MultiLineString to `Coord[][]` |
| `multiLineLength(lines)` | Total length in metres |
| `sampleAlongMultiLine(lines, stepM, minPoints)` | Evenly-spaced sample points along trail |
| `deriveAnchors(lines)` | Return `{ start, end, centroid }` coords from a MultiLine |
| `overpassPost(query)` | POST to Overpass, retry on 429/504, return `elements[]` |
| `entityList(res, name)` | Safely extract InstantDB query result array |
| `loadEnvLocal(rootDir)` | Parse `.env.local` into `process.env` |

---

## Enrichment 1 — Surface & Paw Safety

**Script:** `scripts/enrich-systems-surface.ts`
**CLI:** `npx tsx scripts/enrich-systems-surface.ts --city "Austin" --state "TX" --write`

### What it does

Queries OSM ways (`highway~path|footway|track`) intersecting the trail via true geometric proximity (SNAP_M = 20 m), then computes a length-weighted surface distribution and paw safety metrics.

### Overpass query

```
way["highway"~"path|footway|track|...](BBOX);
out geom tags;
```

### Key computations

- **`canonicalizeSurface(tags)`** — maps raw `surface`, `smoothness`, `tracktype` tags to a canonical bucket (e.g. `asphalt`, `dirt`, `gravel`)
- **`intersectionLength(osmWaySegments, trailSegments)`** — for each OSM way segment, finds trail segments within SNAP_M and estimates overlap length
- **`heatRiskScore(breakdown)`** — `asphalt×1.0 + concrete×1.0 + hard_other×0.7 + gravel×0.5` → bucketed low/medium/high
- **`roughnessScore(tags)`** — derived from `smoothness`, `tracktype`, `sac_scale` tags

### Fields written

| Field | Type | Description |
|---|---|---|
| `surfaceBreakdown` | json | Length-weighted fraction per surface type |
| `heatRisk` | string | `low` / `medium` / `high` |
| `roughnessRisk` | string | `low` / `medium` / `high` |
| `asphaltPercent` | number | 0–1 fraction of asphalt/concrete ways |
| `naturalSurfacePercent` | number | 0–1 fraction of dirt/grass/earth ways |
| `surfaceLastComputedAt` | number | Unix ms timestamp |

---

## Enrichment 2 — Mud Risk

**Script:** `scripts/enrich-systems-mud.ts`
**CLI:** `npx tsx scripts/enrich-systems-mud.ts --city "Austin" --state "TX" --write`

### What it does

Uses the same OSM way query as Surface enrichment, but normalises surfaces into four buckets and computes a mud risk score.

### Surface buckets

| Bucket | Surfaces |
|---|---|
| HARD | asphalt, concrete, paving_stones, paved, sett, metal, rubber |
| SEMI | gravel, fine_gravel, compacted, crushed_stone, unpaved |
| NATURAL | dirt, earth, ground, mud, sand, grass, woodchips, forest_floor, snow, ice |
| UNKNOWN | anything else; tracktype fallback: grade1→HARD, grade2→SEMI, grade3-5→NATURAL |

### Score formula

```
mudRiskScore = natural×1.0 + semi×0.35 + unknown×0.25   (clamped 0–1)
```

Buckets: `low` < 0.30, `medium` 0.30–0.60, `high` ≥ 0.60

### Exported helpers

`normalizeSurface(surface, tracktype)` and `scoreMudRisk(mix)` — exported for reuse.

### Fields written

| Field | Type | Description |
|---|---|---|
| `mudRiskScore` | number | 0–1 |
| `mudRisk` | string | `low` / `medium` / `high` |
| `mudRiskReason` | string | Human-readable explanation |
| `mudLastComputedAt` | number | Unix ms timestamp |

---

## Enrichment 3 — Water Access

**Script:** `scripts/enrich-systems-water.ts`
**CLI:** `npx tsx scripts/enrich-systems-water.ts --city "Austin" --state "TX" --write`

### What it does

Two Overpass queries per system:
- **Query A** — water features (rivers, lakes, reservoirs) within bbox → used to compute `waterNearPercent` (fraction of trail midpoints within 200 m of water) and `waterTypesNearby`
- **Query B** — swim/water-access POIs (beach, ford, pier, steps, drinking_water) near trail → stored as `SwimAccessPoint` objects with GeoJSON Point locations

### SwimAccessPoint object

```ts
{
  osmType, osmId, kind, name,
  location: { type: "Point", coordinates: [lon, lat] },
  distanceToTrailMeters,
  distanceToWaterMeters,
  tags
}
```

For **nodes**: location = `[el.lon, el.lat]`. For **ways/relations**: location = centroid of geometry nodes.

### Proximity thresholds

| Kind | Trail snap | Water snap |
|---|---|---|
| beach, ford, pier, drinking_water | 75 m | 100 m |
| steps | 50 m | 100 m |

Deduplicated by `osmType+osmId+kind`, keep closest. Capped at 50 per system.

### Fields written

| Field | Type | Description |
|---|---|---|
| `waterNearPercent` | number | Fraction of trail within 200 m of water |
| `waterNearScore` | number | Normalised 0–1 score |
| `waterTypesNearby` | json | `string[]` of water feature types found |
| `swimLikely` | boolean | True if any swim access point found |
| `swimAccessPointsCount` | number | |
| `swimAccessPointsByType` | json | `Record<kind, count>` |
| `swimAccessPoints` | json | `SwimAccessPoint[]` (capped at 50) |
| `waterLastComputedAt` | number | Unix ms timestamp |

---

## Enrichment 4 — Shade Proxy

**Script:** `scripts/enrich-systems-shade.ts`
**CLI:** `npx tsx scripts/enrich-systems-shade.ts --city "Austin" --state "TX" --sampleMeters 50 --nearMeters 25 --write`

### What it does

Samples points every `sampleMeters` along the trail, classifies each sample's shade level from OSM tree/forest/park data, then aggregates into a system-level shade score.

### Overpass query

Fetches: `wood`, `forest`, `scrub`, `park` way/relation polygons + `tree_row` ways + individual `tree` nodes.

### Shade classification per sample point

| Level | Weight | Source |
|---|---|---|
| Strong | 1.0 | Point inside a `wood` or `forest` polygon |
| Medium | 0.6 | Point inside a `scrub` or `park` polygon |
| Weak | 0.3 | Point within `nearMeters` of a `tree_row` line or individual tree node |
| None | 0.0 | No shade feature nearby |

Tree node count capped at MAX_TREE_NODES = 2000 (closest to trail kept).

### Score formula

```
shadeProxyScore = average weight across all sample points
shadeProxyPercent = fraction of samples with weight >= 0.6
```

Classes: `low` < 0.30, `medium` 0.30–0.60, `high` ≥ 0.60

### Fields written

| Field | Type | Description |
|---|---|---|
| `shadeProxyScore` | number | 0–1 average shade weight |
| `shadeProxyPercent` | number | Fraction of samples with medium+ shade |
| `shadeClass` | string | `low` / `medium` / `high` |
| `shadeSources` | json | `{ strongPolyCount, mediumPolyCount, treeRowCount, treeNodeCountUsed }` |
| `shadeLastComputedAt` | number | Unix ms timestamp |

---

## Enrichment 5 — Trailhead Logistics

**Script:** `scripts/enrich-systems-logistics.ts`
**CLI:** `npx tsx scripts/enrich-systems-logistics.ts --city "Austin" --state "TX" --parkingRadius 500 --amenityRadius 250 --write`

### What it does

Derives three anchor points (start, end, centroid) from system geometry, then queries Overpass around each anchor for parking lots and trailhead amenities. Deduplicates across anchors, estimates parking capacity, computes an amenities index score, and stores up to 60 `TrailheadPOI` objects with GeoJSON Point locations.

Loop-trail anchor deduplication: anchors within ~10 m of each other (4-decimal lat/lon key) are collapsed to avoid redundant queries.

### Overpass queries (per anchor)

- **Parking** (radius 500 m) — `amenity=parking`, `amenity=parking_entrance`; `out center tags`
- **Amenities** (radius 250 m) — toilets, drinking_water, picnic_table, bench, shelter, information, waste_basket; `out center tags`

### Parking capacity estimation

1. Explicit `capacity` tag → parse as integer
2. Way polygon → Shoelace area formula → `floor(areaSqm / 25)` spaces

### Amenities index score formula

```
0.25×hasParking + 0.20×hasToilets + 0.20×hasDrinkingWater
+ 0.10×hasShelter + 0.10×hasInfo + 0.10×hasWaste + 0.05×hasPicnicOrBench
```

### Fields written

| Field | Type | Description |
|---|---|---|
| `parkingCount` | number | Deduplicated parking lots |
| `parkingCapacityEstimate` | number | Sum of estimated spaces |
| `parkingFeeKnown` | boolean | True if any lot has `fee=yes` |
| `amenitiesCounts` | json | `Record<kind, count>` |
| `amenitiesIndexScore` | number | 0–1 composite score |
| `trailheadPOIs` | json | `TrailheadPOI[]` (capped at 60) |
| `logisticsLastComputedAt` | number | Unix ms timestamp |

---

## Enrichment 6 — Crowd Proxy

**Script:** `scripts/enrich-systems-crowd.ts`
**CLI:** `npx tsx scripts/enrich-systems-crowd.ts --city "Austin" --state "TX" --anchorRadius 400 --amenityRadius 250 --parkingRadius 500 --write`

### What it does

Combines four crowd-intensity signals into a single `crowdProxyScore`. Reuses already-computed logistics fields (`parkingCapacityEstimate`, `amenitiesCounts`) where available to avoid redundant Overpass calls.

### Signals

| Signal | Weight | Source |
|---|---|---|
| **Parking capacity** | 0.45 | `parkingCapacityEstimate` (reused) or fresh Overpass query; `log1p(capacity) / log1p(300)` |
| **Amenity density** | 0.20 | `amenitiesCounts` (reused) or fresh Overpass; presence booleans for 6 kinds |
| **Entrance / transit / bike-parking** | 0.20 | Always queried; `log1p(entrances + 0.5×busStops + 0.25×bikeParking) / log1p(25)` |
| **Urban adjacency** | 0.15 | Centroid-only 600 m query; `+0.6` for commercial/retail, `+0.4` for residential, `+0.1` if >10 food amenities |

### Score formula

```
crowdProxyScore = 0.45×parking + 0.20×amenity + 0.20×entrance + 0.15×urban   (clamped 0–1)
```

Classes: `low` < 0.33, `medium` 0.33–0.66, `high` ≥ 0.66

`reactiveDogFriendly = (crowdClass == "low")`

### Fields written

| Field | Type | Description |
|---|---|---|
| `crowdProxyScore` | number | 0–1 |
| `crowdClass` | string | `low` / `medium` / `high` |
| `reactiveDogFriendly` | boolean | True if low crowd |
| `crowdSignals` | json | Compact signal breakdown |
| `crowdReasons` | json | `string[]` max 5 |
| `crowdLastComputedAt` | number | Unix ms timestamp |

---

## Enrichment 7 — Highlights / Scenic POIs

**Script:** `scripts/enrich-systems-highlights.ts`
**CLI:** `npx tsx scripts/enrich-systems-highlights.ts --city "Austin" --state "TX" --nearMeters 150 --write`

### What it does

Fetches scenic POIs from OSM within the system bbox (expanded by `nearMeters`), filters candidates to those within `nearMeters` of the actual trail geometry, deduplicates, sorts, and caps at 40 highlights per system.

### Highlight kinds

| Kind | OSM tags |
|---|---|
| `viewpoint` | `tourism=viewpoint` |
| `waterfall` | `waterway=waterfall` or `natural=waterfall` |
| `peak` | `natural=peak` |
| `cave_entrance` | `natural=cave_entrance` |
| `spring` | `natural=spring` |
| `attraction` | `tourism=attraction` |
| `historic` | `historic=*` |
| `ruins` | `ruins=yes` |

Location extraction: node → `el.lat/lon`; way/relation → `el.center.lat/lon` (from `out center tags`).

Sort order: distance to trail ascending, named items ranked above unnamed at equal distance. Cap: 40 per system.

### Highlight object

```ts
{
  osmType, osmId, kind, name,
  location: { type: "Point", coordinates: [lon, lat] },
  distanceToTrailMeters,
  tags  // subset: name, tourism, natural, waterway, historic, ruins, ele
}
```

### Fields written

| Field | Type | Description |
|---|---|---|
| `highlightsCount` | number | Total highlights stored |
| `highlightsByType` | json | `Record<kind, count>` |
| `highlights` | json | `Highlight[]` (capped at 40) |
| `highlightsLastComputedAt` | number | Unix ms timestamp |

---

## Enrichment 8 — Night Proxy

**Script:** `scripts/enrich-systems-night-winter.ts` (combined with Winter)
**CLI:** `npx tsx scripts/enrich-systems-night-winter.ts --city "Austin" --state "TX" --sampleMeters 50 --nearMeters 30 --write`

### What it does

Samples points every `sampleMeters` along the trail. For each sample, finds the nearest walkable way within `nearMeters` and reads its `lit=*` tag. Counts street lamp nodes within 50 m of the trail for a density bonus.

### OSM queries

- **Query A** — walkable ways: `highway~path|footway|cycleway|track|pedestrian|living_street|residential|service`; `out geom tags`
- **Query B** — `highway=street_lamp` nodes; `out tags`

### Night score formula

```
litPercentKnown = litYesSamples / litKnownSamples   (if litKnownSamples > 0, else 0)
litCoverageProxy = litYesSamples / totalSamples

base = 0.7 × litPercentKnown + 0.3 × litCoverageProxy
lampDensity = streetLampCount / (trailLengthKm + 0.5)
nightScore = clamp(base + min(0.2, lampDensity × 0.03), 0, 1)
```

If `litKnownSamples == 0`: `nightScore = 0` (conservative).

Classes: `low` < 0.25, `medium` 0.25–0.60, `high` ≥ 0.60. `nightFriendly = (nightClass == "high")`.

### Fields written

| Field | Type | Description |
|---|---|---|
| `nightScore` | number | 0–1 |
| `nightClass` | string | `low` / `medium` / `high` |
| `nightFriendly` | boolean | |
| `litKnownSamples` | number | Samples with explicit `lit=yes/no` nearby |
| `litYesSamples` | number | Samples with `lit=yes` nearby |
| `litPercentKnown` | number | Fraction of known samples that are lit |
| `streetLampCountNearTrail` | number | Lamp nodes within 50 m of trail |
| `nightReasons` | json | `string[]` max 5 |
| `nightLastComputedAt` | number | Unix ms timestamp |

---

## Enrichment 9 — Winter Proxy

**Script:** `scripts/enrich-systems-night-winter.ts` (combined with Night)

### What it does

From the same walkable ways fetched for Night enrichment, computes a length-weighted paved fraction for ways within `nearMeters` of the trail, and checks for explicit winter maintenance tags.

### Paved classification

A way counts as paved if:
- `surface` ∈ {asphalt, concrete, paving_stones, paved, sett, metal, rubber, concrete:plates, concrete:lanes}
- OR `highway` ∈ {residential, living_street, pedestrian, cycleway}

### Winter score formula

```
pavedPercentProxy = pavedWayLengthM / totalNearbyWayLengthM
winterScore = clamp(0.70 × pavedPercentProxy + 0.30 × (winterTagPresent ? 1.0 : 0.0), 0, 1)
```

`winterTagFound` is set from the first way with `winter_service`, `winter_road`, or `snowplowing` tag.

Classes: `low` < 0.30, `medium` 0.30–0.65, `high` ≥ 0.65. `winterLikelyMaintained = (winterClass == "high")`.

### Fields written

| Field | Type | Description |
|---|---|---|
| `winterScore` | number | 0–1 |
| `winterClass` | string | `low` / `medium` / `high` |
| `winterLikelyMaintained` | boolean | |
| `pavedPercentProxy` | number | 0–1 fraction of nearby ways that are paved |
| `winterTagFound` | string | Raw `winter_service` tag value if present |
| `winterReasons` | json | `string[]` max 5 |
| `winterLastComputedAt` | number | Unix ms timestamp |
| `nightWinterSignals` | json | Compact debug blob with all raw signal values |

---

## Running all enrichments (Austin TX)

```bash
# 1. Surface & Paw Safety
npx tsx scripts/enrich-systems-surface.ts --city "Austin" --state "TX" --write

# 2. Mud Risk
npx tsx scripts/enrich-systems-mud.ts --city "Austin" --state "TX" --write

# 3. Water Access
npx tsx scripts/enrich-systems-water.ts --city "Austin" --state "TX" --write

# 4. Shade Proxy
npx tsx scripts/enrich-systems-shade.ts --city "Austin" --state "TX" --sampleMeters 50 --nearMeters 25 --write

# 5. Trailhead Logistics
npx tsx scripts/enrich-systems-logistics.ts --city "Austin" --state "TX" --parkingRadius 500 --amenityRadius 250 --write

# 6. Crowd Proxy
npx tsx scripts/enrich-systems-crowd.ts --city "Austin" --state "TX" --anchorRadius 400 --amenityRadius 250 --parkingRadius 500 --write

# 7. Highlights / Scenic POIs
npx tsx scripts/enrich-systems-highlights.ts --city "Austin" --state "TX" --nearMeters 150 --write

# 8 + 9. Night + Winter
npx tsx scripts/enrich-systems-night-winter.ts --city "Austin" --state "TX" --sampleMeters 50 --nearMeters 30 --write
```

Omit `--write` for a dry run. Add `--limit N` to process only N systems. Add `--verbose` for per-system detail.

---

## Austin TX results snapshot (2026-02-26, 55 systems)

| Enrichment | Key metric |
|---|---|
| Surface | 55/55 systems enriched |
| Mud Risk | 46 low, 7 medium, 1 high (colorado-river-trail 73.8% natural) |
| Water Access | 15 swim-likely, avg waterNearPercent 79.7% |
| Shade | 25 low, 19 medium, 11 high; avg shadeProxyScore 0.334 |
| Logistics | 50/55 have parking (90.9%); avg amenitiesIndexScore 0.433 |
| Crowd | 34 low (61.8%), 12 medium, 9 high; avg score 0.349 |
| Highlights | 126 total across 22 systems; top: ann-and-roy-butler (39) |
| Night | 5 nightFriendly (9.1%); avg nightScore 0.089 |
| Winter | 4 winterLikelyMaintained (7.3%); avg winterScore 0.400 |

---

## Schema location

`src/lib/instant/schema.ts` — `trailSystems` entity. All enrichment fields are optional. Schema changes are pushed via:

```bash
npm run instant:pushverify
```
