# Arizona Trail Expansion — Design Spec

**Date:** 2026-03-18
**Status:** Draft

---

## Context

BarkTrails currently covers 6 cities with trails sourced from curated upstream datasets (Socrata open data, city ArcGIS portals, or filtered Overpass named-way queries). The local OSM pipeline (Geofabrik Arizona extract, osmium toolchain) was recently built for Phoenix enrichment (shade, water, highlights). Now the goal is to leverage that same local extract for trail *discovery* — expanding to Tucson, Sedona, Flagstaff, and eventually all of Arizona.

The core problem: beyond cities with published GIS portals, OSM is the only available source. Raw OSM is noisy (unnamed paths, service roads, private driveways). A quality gate is needed to ensure only "real, well-known" trails appear on BarkTrails.

---

## Quality Gate: OSM Route Relations

**Decision:** Only OSM route relations qualify as trail sources for new cities.

An OSM route relation (`type=route`) requires explicit human curation: a mapper must name the trail, define its route type, and assemble the constituent member ways into an ordered route. This is a substantially higher bar than a raw named way.

**Included route types:**
- `route=hiking`
- `route=foot`
- `route=mtb`
- `route=bicycle`

**Minimum filters (applied at ingest time):**
- Must have `name` tag (anonymous relations excluded)
- Total geometry length ≥ 0.25 miles (eliminates micro-loops, test routes, short connectors)
  - Exception: if relation has `tourism=viewpoint` or `natural=peak`, threshold drops to 0.1 miles (relevant for Sedona viewpoint spurs like Cathedral Rock)
- Geometry must be non-null after osmium export (see Geometry Handling section)

---

## Approach: Hybrid — Priority Cities First, Then State-Wide Sweep

### Phase 1: Priority Cities

Three cities targeted in order of data richness:

| City | Primary Source Strategy | Expected OSM Coverage |
|------|------------------------|----------------------|
| Tucson | Check Pima County GIS open data portal first | Strong — Rillito, Sweetwater Wetlands, Rincon Valley, Tumamoc Hill |
| Flagstaff | Check City of Flagstaff open data; check USFS MVUM public data | Strong — Buffalo Park, Observatory Mesa, Dry Lake Hills, Arizona Trail sections |
| Sedona | No city GIS (National Forest land); OSM relations primary | Very strong — Cathedral Rock, Bell Rock, Devil's Bridge, Soldier Pass all well-mapped |

**Per-city decision flow:**
1. Research city/county GIS portal
2. If portal has trail data with geometry + names → write a city-specific ArcGIS ingest script (pattern: `scripts/ingest-{city}-data.mjs`)
3. If portal is sparse or absent → use the generic OSM route relations ingest (`scripts/ingest-osm-routes.ts --city {city}`)

Sedona is expected to skip step 2 and go directly to OSM relations.

**New `CITY_CONFIGS` entries required in `prepare-city-osm.ts`:**
```
sedona:   [-111.95, 34.78, -111.68, 34.92]   (Coconino NF / Red Rock)
tucson:   [-111.10, 32.10, -110.75, 32.35]   (Pima County metro)
flagstaff:[-111.80, 35.10, -111.55, 35.25]   (Coconino NF + city)
```
Each city also needs to be added to the enrichment pipeline's `CITY_CONFIGS` if/when profile scripts are run for it (separate concern from `prepare-city-osm.ts`).

### Phase 2: State-Wide Sweep

After Phase 1 is validated:

1. Add an `arizona` (state-level) config to `prepare-city-osm.ts` with the full state bbox (no bbox clip for this entry; osmium uses the full PBF)
2. Run osmium tag-filter for `routes` category on the full AZ PBF
3. A reverse-geocoding step assigns each trail's centroid to the nearest incorporated AZ city/town (see Reverse Geocoding section)
4. Cities that already have ≥ 5 non-OSM trail systems are in `SKIP_CITIES` — the check runs at script startup by querying InstantDB for distinct `extDataset` values per city, not a hard-coded list
5. Covers: White Mountains, Prescott, Globe, Verde Valley, Payson, Yuma, Sierra Vista, Show Low, etc.

---

## Technical: osmium Route Relation Extraction

### Extraction Strategy

Route relations span arbitrary geographic extents — a multi-day hiking route may cross multiple county bboxes. osmium's default `complete_ways` bbox clip strategy does not guarantee that all member ways of a relation are retained if some members fall outside the clip boundary. This would result in truncated or missing relations.

**Fix:** use osmium `smart` strategy for the `routes` category. This strategy retains complete relations (and all their members) when the relation has at least one member inside the bbox:

```bash
osmium extract \
  --strategy=smart \
  -b "$BBOX" \
  -o routes-clip.osm.pbf \
  $STATE_PBF
```

The `smart` strategy is slower than `complete_ways` but correct for route relations. The existing enrichment categories (shade, water, highlights) continue using `complete_ways` since those are fine as partial features.

### Tag Filter for Routes

```bash
osmium tags-filter \
  routes-clip.osm.pbf \
  "r/route=hiking" "r/route=foot" "r/route=mtb" "r/route=bicycle" \
  -o routes-filtered.osm.pbf
```

osmium `tags-filter` includes referenced member ways by default (no additional flag needed). The `r/` prefix restricts matching to relations only.

### Export to GeoJSON

```bash
osmium export \
  --geometry-types=linestring,multilinestring \
  routes-filtered.osm.pbf \
  -o routes.geojsonseq
```

osmium exports route relations as `MultiLineString` geometries by concatenating member way geometries in relation order. Discontinuous or reversed members are output as separate LineString entries within the MultiLineString — ordering may not be perfect but is good enough for centroid calculation and length summation. The greedy nearest-neighbor stitcher in `store-surface-profile.ts` already handles disordered segments, so enrichment is unaffected.

---

## Technical: Geometry Handling in the Ingest Script

After osmium export, each GeoJSONseq feature is either:
- A `MultiLineString` with 1+ LineString members → valid; create one `trailSegment` per member
- A feature with `null` geometry → occurs when all member ways were outside the clip boundary (should be prevented by `smart` strategy, but treat as a hard skip — log and continue)
- A `MultiLineString` where some members are null → osmium does not emit null members; the MultiLineString simply has fewer entries. The length filter catches edge cases where too many members were missing (total length < 0.25 miles).

No special null-member handling is needed within the MultiLineString; the pre-export `smart` strategy is the primary guard.

---

## Technical: Reverse Geocoding (Phase 2)

**Source:** US Census Bureau TIGER 2023 incorporated places for Arizona, converted to a static TypeScript constant. 91 cities and towns with official lat/lon centroids. Source: `https://www2.census.gov/geo/tiger/TIGER2023/PLACE/` (public domain). A pre-built constant file (`scripts/lib/az-places.ts`) is generated once and committed.

**Assignment logic:**
1. Compute trail centroid from bounding box midpoint
2. Find nearest AZ place by haversine distance
3. If nearest place is > 75 km away: assign `city: null`, `region: "Rural Arizona"` — do not skip, but flag for manual review in dry-run output
4. City slug is derived from the assigned city name using the same `slugify` utility as all other city fields

**Phoenix metro edge case:** Scottsdale, Tempe, Mesa, Chandler are distinct incorporated places. Trails whose centroids fall within these cities are correctly assigned to them, not "Phoenix". This is the intended behavior — South Mountain Park trails will be split between "Phoenix" and "Ahwatukee" (an unincorporated community) based on centroid proximity. Ahwatukee is not an incorporated place and will fall back to "Phoenix" (nearest incorporated place).

**SKIP_CITIES for Phase 2:** Rather than a hard-coded list, the script queries InstantDB at startup:
```
For each unique city in the DB where extDataset does not end in "_osm_routes":
  if systemCount(city) >= 5: add to skip set
```
This is self-maintaining — as new ArcGIS cities are added in Phase 1, they're automatically excluded from Phase 2.

---

## Upsert Key

The upsert key is compound: `(extDataset, extSystemRef)`.

This means a trail from `extDataset: "sedona_osm_routes"` with `extSystemRef: "sys:cathedral-rock"` is a distinct record from a hypothetical `extDataset: "sedona_pima_arcgis"` record with the same slug. This prevents Phase 2 OSM records from silently overwriting Phase 1 ArcGIS records.

**Note:** the existing ingest scripts (Fort Worth, OKC, Houston, Dallas) key on `extSystemRef` alone (querying existing systems to find the InstantDB `id`). The new `ingest-osm-routes.ts` must explicitly include `extDataset` in its existence check query. This is a deviation from the existing pattern — document it clearly in the script.

---

## Data Model

No schema changes required. The existing `trailSystems` + `trailSegments` entities accommodate OSM route relation data:

- `extDataset`: distinguishes source per city (e.g. `sedona_osm_routes`, `tucson_pima_arcgis`)
- `extSystemRef`: `sys:{slug}` — unique per city per source (compound key with `extDataset`)
- `city` / `state`: set at ingest time
- `lengthMilesTotal`, `bbox`, `centroid`, `segmentCount`: computed by rollup script (unchanged)

---

## Enrichment After Ingest

Same pipeline as existing cities:

1. `npm run rollup:systems -- --city {city} --dataset {extDataset} --write`
2. `npx tsx scripts/enrich-city.ts --city {city} --state AZ --modules elevation`
3. OSM enrichment cache must be prepared first: `npm run osm:prepare -- --city {city}`
   - This populates `.cache/osm/{city}/` for shade, water, highlights, amenities
4. Profile scripts (each with `--write`):
   - `store-shade-profile.ts`
   - `store-water-profile.ts`
   - `store-surface-profile.ts`
   - `store-highlights-profile.ts`
   - `store-amenity-profile.ts`
   - `store-elevation-profile.ts`
5. Dog policy seeding: `npx tsx scripts/policy/seed-policy-{city}.ts --write`
   - This must be written per city (see Dog Policy section)
6. FAQ generation: `npm run gen:faqs -- --city {city}` then `npm run store:faqs -- --city {city} --write`
   - Only for trails with `lengthMilesTotal > 1 mile` (existing filter)
7. Rebuild and commit search index: `npm run build:search` → commit `public/search-index.json`
8. Deploy to Vercel: `vercel --prod` (sitemap reflects new trails after deployment)

---

## Dog Policy Seeding

**This step is required for every new city.** Trails without policy data show empty policy blocks on the detail page.

For Sedona (Coconino National Forest):
- Dogs allowed on most trails (NF policy)
- Leash required in developed recreation areas and trailheads; voice control on trails where posted
- Source: Coconino NF Use Regulations

For Tucson:
- Pima County regional parks: dogs allowed on leash
- Saguaro National Park (East + West): dogs NOT allowed on trails (allowed on paved roads only)
- Mixed — must apply policy at system level, not city-wide

For Flagstaff:
- City parks: dogs allowed on leash
- Coconino NF land: same as Sedona policy
- Arizona Trail: dogs allowed

The `seed-policy-{city}.ts` script pattern applies policies to individual `trailSystems` records by slug. This must be written and run after trails are ingested. Policy `confidence: "high"` for NF-land trails (published federal policy), `"medium"` for city parks.

---

## Deduplication Strategy

- Phase 1 city ingest: compound `(extDataset, extSystemRef)` key prevents duplicate writes within a source
- Phase 2 state-wide sweep: cities with ≥ 5 non-OSM systems are skipped automatically via DB query
- If a trail appears in both a city ArcGIS source (Phase 1) and the state sweep finds it via OSM: the city is in the skip set, so the OSM version is never ingested. The ArcGIS version remains the canonical record.

---

## Verification

**Phase 1 validation checklist (per city):**
1. `npm run osm:prepare -- --city sedona` → confirm `routes.geojsonseq` generated
2. Inspect `.cache/osm/sedona/routes.geojsonseq`: spot-check Cathedral Rock, Bell Rock, Devil's Bridge by feature name
3. `npx tsx scripts/ingest-osm-routes.ts --city sedona --dry-run` → review trail count and names; compare against [AllTrails Sedona](https://www.alltrails.com/us/arizona/sedona) listing
4. `--write`, then rollup, then visit trail detail page in dev server — verify trail renders correctly
5. `npm run build:search` → verify new trails appear in search results
6. Verify policy block renders on trail page (not empty)

**Phase 2 validation checklist:**
1. After state-wide sweep, check total AZ trail count (expect 200–800 route relations)
2. Verify city assignments for a sample across regions (Prescott, Show Low, Yuma, Sierra Vista)
3. Verify `SKIP_CITIES` logic correctly excluded Phoenix, Tucson (if ArcGIS), Sedona (if Phase 1 OSM)
4. Spot-check Arizona Trail sections (multi-city route — each city-length segment should appear under its correct city)
5. Rebuild and deploy: `npm run build:search` → commit → `vercel --prod` → verify sitemap has new city URLs

---

## Open Questions

- **USFS MVUM data for Flagstaff:** If osmium relations are sparse for Flagstaff's Coconino NF trails (e.g., if trails there are mapped as named ways rather than relations), MVUM shapefiles may be worth ingesting as supplemental source. Check OSM relation coverage first before deciding.
- **Arizona Trail sub-routes:** The AZT is a 800-mile statewide route with sections in OSM as both the master relation and sub-section relations. The master relation will likely produce a geometry spanning the whole state — exclude relations with `distance > 200 miles` or `length > 200 miles` from ingest.
- **Maricopa County Parks vs Phoenix ArcGIS:** Phoenix already has `extDataset: "phoenix_arcgis_trails"`. The Phase 2 sweep should skip Phoenix (it will have >> 5 systems). Confirm the SKIP_CITIES DB query correctly identifies it.
