# City Onboarding Playbook

> **Purpose:** Everything needed to repeat the data pipeline for a new city, in order, with exact commands verified against the actual source code. Feed this document to Claude and it can execute the full pipeline without guesswork.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites & Environment](#2-prerequisites--environment)
3. [Step 0 — Explore the Data Source](#3-step-0--explore-the-data-source)
4. [Step 1 — Write the Ingest Script](#4-step-1--write-the-ingest-script)
5. [Step 2 — Run the Ingest](#5-step-2--run-the-ingest)
6. [Step 3 — Rollup System Aggregates](#6-step-3--rollup-system-aggregates)
7. [Step 4 — Wire InstantDB Links](#7-step-4--wire-instantdb-links)
8. [Step 5 — Rebuild Trailheads (Hybrid OSM + Google)](#8-step-5--rebuild-trailheads-hybrid-osm--google)
9. [Step 5b — Primary Trailhead Linkage](#9-step-5b--primary-trailhead-linkage)
10. [Step 6 — Enrich Google Places (Supplementary)](#10-step-6--enrich-google-places-supplementary)
11. [Step 6b — Trailhead Photos](#11-step-6b--trailhead-photos)
12. [Step 7 — System Enrichment Modules](#12-step-7--system-enrichment-modules)
13. [Step 8 — Dog Policy Seeding](#13-step-8--dog-policy-seeding)
14. [Complete Checklist](#14-complete-checklist)
15. [Invariants & Gotchas — Never Break These](#15-invariants--gotchas--never-break-these)
16. [Troubleshooting Guide](#16-troubleshooting-guide)

---

## 1. Architecture Overview

### Data flow

```
External source (Socrata API / ArcGIS / local GeoJSON)
        │
        ▼
  [Step 1] ingest-<city>-data.mjs
        │ writes: trailSystems, trailSegments
        ▼
  [Step 3] rollup-systems-from-segments.ts
        │ writes: trailSystems.bbox/centroid/lengthMilesTotal/
        │         segmentCount/surfaceSummary/widthSummary/computedAt
        ▼
  [Step 4] link-segments-to-systems.mjs
        │ writes: InstantDB typed links (trailSegments ↔ trailSystems)
        ▼
  [Step 5] rebuild-trailheads.ts   ◄── NEW unified hybrid script
        │ source: Overpass API (OSM) + Google Places API (New)
        │         queried in parallel against trail centroid
        │         hard reject if >150m from actual route geometry
        │ writes: trailHeads + links (trailHeads ↔ trailSystems)
        │         Google metadata (placeId, address, rating, etc.) already
        │         attached — no separate enrich step needed for coordinates
        ▼
  [Step 5b-1] backfill-primary-trailheads.mjs
        │ writes: trailSystems.primaryTrailHeadId / trailHeadsLastLinkedAt /
        │         trailHeadsLinkConfidence / trailHeadsLinkReason
        ▼
  [Step 5b-2] backfill-trailhead-isPrimary.mjs
        │ writes: trailHeads.isPrimary (true on primary, false on others)
        ▼
  [Step 6] enrich-google-places.ts   (supplementary only)
        │ source: Google Places API (New)
        │ use this only to add phone/hours/nearbyDogLogistics that
        │ rebuild-trailheads.ts does not fetch
        ▼
  [Step 6b] enrich-trailhead-photos.ts
        │ source: Google Places API (New) — Place details + getMedia
        │ requires: trailHeads with googlePlaceId (from Step 5 or 6)
        │ writes: trailHeads.googlePhotoName, trailHeads.googlePhotoUri
        ▼
  [Step 7] enrich-systems-*.ts + enrich-city.ts
        │ source: Overpass API / OpenTopoData
        │ writes: trailSystems enrichment fields (see per-module tables)
        ▼
  [Step 8] policy/seed-policy-austin.ts
        │ source: manually curated policy-seeds.ts
        │ writes: trailSystems.dogsAllowed / leashPolicy / policy* fields
```

### Database entities (4 canonical)

| Entity | Primary purpose |
|---|---|
| `trailSystems` | One record per named trail network (e.g. "Barton Creek Trail") |
| `trailSegments` | Individual GIS linestring segments — raw GIS data from source |
| `trailHeads` | Access points (parking, entrances, trail markers) |
| `trails` | Optional: named sub-trails within a system (not populated by pipeline) |

**Schema fields added by Step 5b** (must exist in `src/lib/instant/schema.ts` before running):

`trailSystems`:
- `primaryTrailHeadId` (string, optional) — InstantDB `id` of the chosen primary trailhead
- `trailHeadsLastLinkedAt` (string, optional) — ISO timestamp of the last run that set primary
- `trailHeadsLinkConfidence` (number, optional) — 0–1 confidence score for the link
- `trailHeadsLinkReason` (string, optional) — human-readable reason (rank, score, gConf, distM, reviews)

`trailHeads`:
- `isPrimary` (boolean, optional) — `true` on the head chosen as primary; `false` on all others in the same system

If these attributes are missing from the remote schema, writes will silently fail or produce schema errors. **Run `npm run instant:push` before running Step 5b scripts for the first time.**

### InstantDB typed links

| Link name | Relationship |
|---|---|
| `trailSegmentsSystem` | trailSegments → trailSystems (many-to-one) |
| `trailHeadsSystem` | trailHeads → trailSystems (many-to-one) |

---

## 2. Prerequisites & Environment

### `.env.local` — all required variables

```bash
# InstantDB — both names must be set (same UUID value)
NEXT_PUBLIC_INSTANTDB_APP_ID=<UUID>     # Client-side env var (Next.js prefix required)
INSTANT_APP_ID=<UUID>                   # Server-side env var used by all scripts

# InstantDB admin token — scripts accept either name
INSTANT_ADMIN_TOKEN=<token>
# Note: INSTANT_APP_ADMIN_TOKEN is also accepted as fallback by all scripts

# Google Places API (New) — required only for Step 6
GOOGLE_MAPS_API_KEY=<key>

# Schema file path — used by instant-cli commands
INSTANT_SCHEMA_FILE_PATH=src/lib/instant/schema.ts
```

**Critical notes on env vars:**
- Scripts read `.env.local` themselves via an inline `loadEnvLocal()` function. You do NOT need to `source` or `export` anything.
- All scripts accept both `INSTANT_ADMIN_TOKEN` and `INSTANT_APP_ADMIN_TOKEN` as fallbacks. Either works.
- `enrich-google-places.ts` also accepts `INSTANTDB_APP_ID` and `INSTANTDB_ADMIN_TOKEN` as additional fallbacks.
- If `GOOGLE_MAPS_API_KEY` is missing, empty, or literally `__PASTE_YOUR_KEY_HERE__`, `enrich-google-places.ts` throws immediately and exits — not just a warning.

### Schema sync — run once on a fresh environment

Before any ingest work on a new machine or new InstantDB app:

```bash
npm run instant:pushverify
```

This runs three steps sequentially:
1. Push local `src/lib/instant/schema.ts` to InstantDB
2. Pull the remote schema back
3. Grep the pulled file and verify all 4 canonical entities are present: `trails`, `trailHeads`, `trailSystems`, `trailSegments`

Exits with a non-zero code and an error message if any entity is missing. Fix by checking the schema file and re-running.

### Node.js / tooling

- `.mjs` scripts: `node scripts/<name>.mjs` — no transpilation needed
- `.ts` scripts: `npx tsx scripts/<name>.ts` — uses the `tsx` dev dependency
- `npm run <scriptname>` aliases exist for the most common scripts (see [package.json scripts](#packagejson-npm-script-aliases))

### package.json npm script aliases

These are the only npm-aliased scripts. Everything else is called with `npx tsx` or `node` directly.

```json
"austin:trails:count"     → node scripts/austin-urban-trails-count.mjs
"austin:hiking:count"     → node scripts/austin-hiking-trails-count.mjs
"austin:trails:fields"    → node scripts/austin-urban-trails-fields.mjs
"austin:hiking:count:strict" → node scripts/austin-hiking-trails-count-strict.mjs
"austin:trails:explore"   → node scripts/austin-urban-trails-explore.mjs

"instant:push"            → node scripts/instant-push.mjs
"instant:pull"            → node scripts/instant-pull.mjs
"instant:pushverify"      → node scripts/instant-pushverify.mjs
"instant:schema:pushverify" → node scripts/instant-push-and-verify-schema.mjs
"instant:schema:verify"   → node scripts/instant-pull-and-grep.mjs
"instant:schema:doctor"   → node scripts/instant-schema-doctor.mjs
"instant:schema:truth"    → node scripts/instant-schema-truth.mjs
"instant:schema:attrs"    → node scripts/instant-schema-list-attrs.mjs
"instant:pull:schema"     → node scripts/instant-pull-schema.mjs

"austin:ingest"           → node scripts/ingest-austin-open-data.mjs
"rollup:systems"          → tsx scripts/rollup-systems-from-segments.ts
"link:segments"           → node scripts/link-segments-to-systems.mjs
"rebuild:trailheads"               → tsx scripts/rebuild-trailheads.ts
"backfill:trailheads"              → tsx scripts/backfill-trailheads.ts  (legacy — prefer rebuild:trailheads)
"trailheads:backfill:primary"      → node scripts/backfill-primary-trailheads.mjs
"trailheads:backfill:isPrimary"    → node scripts/backfill-trailhead-isPrimary.mjs
"policy:seed:austin"               → tsx scripts/policy/seed-policy-austin.ts --city Austin --state TX --dryRun
"enrich:google"                    → tsx scripts/enrich-google-places.ts
```

> **Note:** `policy:seed:austin` bakes in `--dryRun` — do NOT use `npm run policy:seed:austin` for actual writes; call the script directly with `--commit` (see Step 8).

---

## 3. Step 0 — Explore the Data Source

Before writing a new ingest script, understand what field names the source actually uses. Guessing leads to silent `undefined` values that are invisible until Step 3 fails.

### For Socrata sources (same structure as Austin)

The Austin exploration scripts work against any Socrata endpoint with the same field shape. For a genuinely different dataset, use them as reading material to build your own.

```bash
# Count total records (checks the API is reachable and returns data)
node scripts/austin-urban-trails-count.mjs

# List every field name + infer types from first record
node scripts/austin-urban-trails-fields.mjs

# Deep analysis: presence %, type, examples, min/max, avg length — fetch 20 records
node scripts/austin-urban-trails-explore.mjs
```

### Field mapping worksheet

For each new source, fill this in before touching code:

| Canonical field | Austin source field | New city source field | Notes |
|---|---|---|---|
| `extSegmentRef` (upsert key) | `objectid` | | Must be stable across re-ingests. Prefer integer object IDs. |
| System name (→ `extSystemRef`) | `urban_trail_system_name` | | Used to derive slug and `extSystemRef = "sys:" + slug` |
| Segment name | `urban_trail_name` | | Can be null |
| Feature/type | `urban_trail_feature` or `urban_trail_type` | | Austin tries feature first, falls back to type |
| Surface | `trail_surface_type` | | String like "Asphalt", "Natural Surface" |
| Length | `length_miles` | | Must be in miles; convert if source uses feet/km |
| Width | `width` | | Must be in feet; convert if source uses metres |
| Geometry | `the_geom` | | Must be GeoJSON `LineString` or `MultiLineString` with coordinates `[lon, lat]` |
| City | `city_municipal` | | Used for `--city` filter downstream |
| County | `county` | | Optional |
| Status filter fields | `phase_simple`, `build_status` | | Used in the `$where` clause to exclude non-existing trails |
| Audit: created by | `created_by` | | Optional |
| Audit: created date | `created_date` | | Optional |
| Audit: modified by | `modified_by` | | Optional |
| Audit: modified date | `modified_date` | | Optional |

**Geometry critical detail:** GeoJSON coordinates must be `[longitude, latitude]` (x, y order). If the source provides `[lat, lon]`, you must swap them in `recordToSegmentPayload`. All downstream geometry code (bbox computation, Overpass queries, haversine distances) depends on this being correct. A swapped geometry will produce a valid-looking bbox in the wrong hemisphere.

### For non-Socrata / local file sources

If the data is a local GeoJSON file, a shapefile converted to GeoJSON, a CSV, or an ArcGIS REST endpoint, the ingest script's API fetch section must be replaced. The field mapping and upsert logic stay identical.

Local GeoJSON example:
```js
import { readFileSync } from "fs";
const raw = JSON.parse(readFileSync("./data/denver-trails.geojson", "utf-8"));
// GeoJSON FeatureCollection → flatten properties + geometry into record objects
const allRecords = raw.features.map(f => ({
  ...f.properties,       // all source fields become top-level keys
  the_geom: f.geometry,  // geometry under the key your mapping function expects
}));
// Then pass allRecords into the same processing loop as the Socrata version
```

ArcGIS REST example — the API returns paginated JSON with a `features` array:
```js
const url = `https://gis.example.gov/arcgis/rest/services/.../query?` +
  `where=1=1&outFields=*&returnGeometry=true&f=geojson&resultOffset=${offset}&resultRecordCount=1000`;
```
ArcGIS GeoJSON already uses `[lon, lat]` order. Fields will have different names (often all-caps or with underscores).

---

## 4. Step 1 — Write the Ingest Script

### Template

Copy `scripts/ingest-austin-open-data.mjs` to `scripts/ingest-<city>-data.mjs`.

The sections you **must** change are marked with `// ← CHANGE` below. Everything else (env loading, upsert logic, batching, summary) stays identical.

```js
// ── SECTION 1: constants ──────────────────────────────────────────────────────
// For Socrata sources:
const SOCRATA_BASE = "https://<city-domain>/resource/<dataset-id>.json"; // ← CHANGE
// For other API sources: replace the fetch function entirely (see below)

const LIMIT = 1000;          // records per API page — keep at 1000 for Socrata
const DELAY_MS = 200;        // ms between paginated requests — polite delay
const BATCH_SIZE = 200;      // segments per InstantDB transaction
const INDEX_LIMIT = 5000;    // max records to load when querying existing data

// EXT_DATASET is the canonical identifier for this city's data.
// Format: "<city>_<source>_<dataset-id>"
// Examples: "austin_socrata_jdwm-wfps", "denver_socrata_abc123", "seattle_arcgis_xyz"
// This value is stored on every trailSystem and trailSegment. It NEVER changes once set.
const EXT_DATASET = "<city>_<source>_<dataset-id>"; // ← CHANGE

// ── SECTION 2: Socrata filter ─────────────────────────────────────────────────
async function fetchSocrataPage(offset) {
  // ← CHANGE: adapt the $where clause to filter for existing/active trails only
  // Austin used: phase_simple='Existing' AND build_status='Existing' AND starts_with(city_municipal,'Austin')
  // Your source will have different status field names and values — inspect them in Step 0
  const where = "YOUR_STATUS_FIELD='Active' AND starts_with(YOUR_CITY_FIELD,'YourCity')";
  const url = `${SOCRATA_BASE}?$where=${encodeURIComponent(where)}&$limit=${LIMIT}&$offset=${offset}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Socrata ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  return res.json();
}

// ── SECTION 3: field mapping ──────────────────────────────────────────────────
// This is the most important function. Every field name from the source goes here.
function recordToSegmentPayload(r) {
  // System name is used to derive extSystemRef and systemSlug
  // If the source has no system grouping, use a fixed string (e.g. city name)
  const systemName = safeStr(r.YOUR_SYSTEM_NAME_FIELD) || "Unknown"; // ← CHANGE

  const systemSlug = slugify(systemName) || "unknown";
  const extSystemRef = "sys:" + systemSlug; // format is fixed — do NOT change this

  // extSegmentRef must uniquely identify this segment and be stable across re-ingests.
  // Use the source's integer object ID (most reliable) or any field that never changes.
  const extSegmentRef = String(r.YOUR_UNIQUE_ID_FIELD ?? ""); // ← CHANGE

  return {
    extDataset: EXT_DATASET,
    extSegmentRef,
    systemRef: extSystemRef,   // string FK — matches system.extSystemRef
    systemSlug,
    name:        safeStr(r.YOUR_SEGMENT_NAME_FIELD) || undefined,  // ← CHANGE
    city:        safeStr(r.YOUR_CITY_FIELD),                       // ← CHANGE
    county:      safeStr(r.YOUR_COUNTY_FIELD),                     // ← CHANGE
    // Feature: try the more specific field first, fall back to type
    feature:     safeStr(r.YOUR_FEATURE_FIELD) || safeStr(r.YOUR_TYPE_FIELD), // ← CHANGE
    surface:     safeStr(r.YOUR_SURFACE_FIELD),                    // ← CHANGE
    // IMPORTANT: lengthMiles must be in MILES. Convert if source uses other units.
    //   Feet → miles: parseFloat(r.length_feet) / 5280
    //   Km → miles:   parseFloat(r.length_km) * 0.621371
    //   Metres → miles: parseFloat(r.length_m) * 0.000621371
    lengthMiles: safeNum(r.YOUR_LENGTH_FIELD),                     // ← CHANGE + convert if needed
    // IMPORTANT: width must be in FEET. Convert if source uses other units.
    //   Metres → feet: parseFloat(r.width_m) * 3.28084
    width:       safeNum(r.YOUR_WIDTH_FIELD),                      // ← CHANGE + convert if needed
    // IMPORTANT: geometry must be a GeoJSON object with coordinates in [lon, lat] order.
    // If source provides {lat, lon} point arrays, you need a conversion function.
    geometry:    r.YOUR_GEOMETRY_FIELD ?? undefined,                // ← CHANGE
    // Audit fields — optional but store them if available
    createdBy:   safeStr(r.created_by),
    createdDate: safeStr(r.created_date),
    modifiedBy:  safeStr(r.modified_by),
    modifiedDate:safeStr(r.modified_date),
    // raw: preserve original fields for debugging/future use
    raw: {
      objectid:             r.YOUR_UNIQUE_ID_FIELD,   // ← CHANGE
      urban_trail_type:     r.YOUR_TYPE_FIELD,         // ← CHANGE (or rename key)
      urban_trail_feature:  r.YOUR_FEATURE_FIELD,      // ← CHANGE (or rename key)
      // add any other source-specific fields worth keeping
    },
  };
}
```

### State field on systems (important for filtering)

The Austin ingest does NOT write a `state` field to `trailSystems`. If you are ingesting multiple cities in different states, write state explicitly so `--state` filters work:

```js
// In the systemsByRef building loop, add state:
systemsByRef.set(ref, {
  extDataset: EXT_DATASET,
  extSystemRef: ref,
  name,
  slug: seg.systemSlug,
  city: seg.city,
  state: "CO",   // ← hardcode the two-letter state abbreviation for this city
  county: seg.county,
  raw: { dataset: EXT_DATASET },
});
```

Without this, `--state` filters in all downstream scripts will be silently lenient (they skip systems where state is not set).

### Non-Socrata: replacing the fetch function

If the data is not from a Socrata API, replace `fetchSocrataPage` and the pagination loop in `main()`:

```js
// Option A: local GeoJSON file — no pagination needed
async function main() {
  // ... (env + schema checks stay the same) ...
  const raw = JSON.parse(readFileSync("./data/denver-trails.geojson", "utf-8"));
  const allRecords = raw.features.map(f => ({ ...f.properties, the_geom: f.geometry }));
  console.log(`Loaded ${allRecords.length} records from file`);
  // ... (rest of main stays the same) ...
}

// Option B: ArcGIS REST with pagination
async function fetchArcGISPage(offset) {
  const url = `https://gis.example.gov/arcgis/rest/services/.../query?` +
    `where=1=1&outFields=*&returnGeometry=true&geometryType=esriGeometryPolyline` +
    `&outSR=4326&f=geojson&resultOffset=${offset}&resultRecordCount=${LIMIT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ArcGIS ${res.status}`);
  const json = await res.json();
  return json.features?.map(f => ({ ...f.properties, the_geom: f.geometry })) ?? [];
}
```

ArcGIS note: request `outSR=4326` to get WGS84 coordinates in `[lon, lat]` order. Without this, coordinates may be in a local projection.

---

## 5. Step 2 — Run the Ingest

### Add npm script alias (optional but recommended)

```json
// in package.json "scripts":
"<city>:ingest": "node scripts/ingest-<city>-data.mjs"
```

### Run

```bash
# With logging to file (recommended for large datasets)
node scripts/ingest-<city>-data.mjs 2>&1 | tee ingest-<city>.log

# Or via npm alias:
npm run <city>:ingest 2>&1 | tee ingest-<city>.log
```

### Expected output

```
=== INSTANT CONFIG ===
appId: <uuid>
adminToken: abc123...xyz9
extDataset: denver_socrata_abc123
======================

--- Schema presence check ---
  OK trails
  OK trailHeads
  OK trailSystems
  OK trailSegments
Schema check passed.

Fetched 1000 records (offset=0, total=1000)
Fetched 250 records (offset=1000, total=1250)

Total records fetched: 1250

Systems upserted: 42
  Segments upserted 200/1250...
  Segments upserted 400/1250...
  ...
  Segments upserted 1250/1250...

=== INGEST SUMMARY ===
extDataset:        denver_socrata_abc123
totalFetched:      1250
systemsUpserted:   42
segmentsUpserted:  1250
skipped:           0
======================
```

### Diagnosing a bad ingest

| Symptom | Cause | Fix |
|---|---|---|
| `skipped: N` with `missing_extSegmentRef` | `r.YOUR_UNIQUE_ID_FIELD` is null/undefined for some records | Check the field name; some records may genuinely lack the field — inspect them with `austin:trails:explore` equivalent |
| `systemsUpserted: 1` with all segments under one system | `urban_trail_system_name` equivalent is always the same value, or you forgot to change the field name | Check the field mapping |
| `totalFetched: 0` | The `$where` filter returned nothing | Test the filter directly in a browser against the Socrata API |
| `Schema entity "X" not found` | Schema not pushed yet | Run `npm run instant:pushverify` first |
| `No records to ingest.` | `fetchSocrataPage` returned empty on first call | Same as totalFetched=0 |
| Geometry appears to be in the wrong place on a map | Coordinates are in `[lat, lon]` order instead of `[lon, lat]` | Swap the coordinates in `recordToSegmentPayload` |

### Re-running the ingest (idempotency)

Safe to re-run at any time. The upsert logic:
1. Loads all existing `trailSystems` and `trailSegments` from InstantDB into memory maps keyed by `extSystemRef` and `extSegmentRef` respectively.
2. For each incoming record: if the key exists in the map, reuses the existing InstantDB UUID; otherwise generates a new `id()`.
3. Calls `.update(payload)` — this merges new fields onto existing records. It does NOT delete fields that are missing from the payload.

**Consequence:** if you change a field mapping and re-ingest, the old field value stays on the record. The new field gets added/overwritten. To clear old incorrect fields you must write `null` explicitly or delete the records and re-ingest from scratch (not supported by the script — would require manual InstantDB console cleanup or a migration script).

---

## 6. Step 3 — Rollup System Aggregates

Computes 7 aggregate fields on each `trailSystem` by reading its linked `trailSegments`.

**Computed fields:** `bbox`, `centroid`, `lengthMilesTotal`, `segmentCount`, `surfaceSummary`, `widthSummary`, `computedAt`

**Join key:** `segment.systemRef == system.extSystemRef` (string equality, exact match)

### Always dry-run first

```bash
# Via npm alias (always dry run):
npm run rollup:systems -- --city "Denver" --dataset "denver_socrata_abc123"

# Direct (dry run):
npx tsx scripts/rollup-systems-from-segments.ts \
  --city "Denver" \
  --dataset "denver_socrata_abc123" \
  --state "CO"

# With verbose diffs to see old → new values:
npx tsx scripts/rollup-systems-from-segments.ts \
  --city "Denver" \
  --dataset "denver_socrata_abc123" \
  --verbose
```

### Write when output looks correct

```bash
npx tsx scripts/rollup-systems-from-segments.ts \
  --city "Denver" \
  --dataset "denver_socrata_abc123" \
  --state "CO" \
  --write
```

### All flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--city` | string | **required** | Case-insensitive substring match on `system.city` |
| `--dataset` | string | (all datasets) | Exact match on `system.extDataset` AND `segment.extDataset`. Use to scope to new city only. |
| `--state` | string | (all states) | Case-insensitive substring. **Lenient**: systems without a `state` field are always included. |
| `--limit` | number | (all) | Limit to first N systems after filtering. Useful for spot-checking. |
| `--write` | flag | off | Enable writes. Without this flag, nothing is written. |
| `--verbose` | flag | off | Show full old/new JSON for every changed system. |

### Filtering order (important — applied sequentially)

1. `--dataset` filter applied to BOTH systems and segments (exact match on `extDataset`)
2. `--city` filter on systems (substring, case-insensitive)
3. `--state` filter on systems (substring, case-insensitive; skipped if `state` not set on system)
4. `--limit` slice applied last

### What "no-change" means

The script compares existing values against newly computed values using `JSON.stringify`. Systems where nothing changed are logged as `no-change` and skipped from the write batch. This makes re-running safe and cheap.

### Expected output

```
=== ROLLUP SUMMARY ===
Systems processed:  42
Skipped (0 segs):   0
No geometry:        0
Need update:        42
Already current:    0
```

On re-run after writes:
```
Systems processed:  42
Skipped (0 segs):   0
No geometry:        0
Need update:        0
Already current:    42
```

### surfaceSummary format

```json
{
  "primary": "Asphalt",
  "distribution": { "Asphalt": 0.72, "Natural Surface": 0.23, "unknown": 0.05 },
  "unknownPct": 0.05
}
```

Surface values come directly from `segment.surface` as written during ingest. If the source uses different names (e.g. "Paved" vs "Asphalt"), the summary reflects those exact strings.

### widthSummary format

```json
{
  "min": 4.0,
  "p50": 8.0,
  "p90": 12.0,
  "max": 15.0,
  "unknownPct": 0.05
}
```

`unknownPct` = fraction of segments with no `width` value. `p50`/`p90` are unweighted (not weighted by length). If all segments have no width: `{ min: 0, p50: 0, p90: 0, max: 0, unknownPct: 1 }`.

---

## 7. Step 4 — Wire InstantDB Links

Creates the typed `trailSegmentsSystem` link between each segment and its system in InstantDB. This is separate from the string FK (`systemRef`) — InstantDB needs an explicit `.link()` call to make the typed relationship queryable.

```bash
# Via npm alias:
npm run link:segments

# Direct:
node scripts/link-segments-to-systems.mjs
```

**No flags.** No city filter. Operates on ALL segments and systems in the database.

**Safe to re-run.** Linking the same pair twice is idempotent in InstantDB — no duplicates are created.

### Expected output

```
Admin SDK initialized OK
Fetching trailSystems...
  55 systems indexed
Fetching trailSegments...
  1296 segments fetched
  Linked 200/1296...
  Linked 400/1296...
  ...
  Linked 1296/1296...

=== LINK SUMMARY ===
linked:  1296
skipped: 0
====================
```

### If `skipped > 0`

| Skip reason | Cause |
|---|---|
| `missing_systemRef` | Segment has no `systemRef` field — ingest mapping error |
| `no_system_for_ref:<value>` | Segment's `systemRef` doesn't match any system's `extSystemRef` — likely a typo or slug mismatch in ingest |

---

## 8. Step 5 — Rebuild Trailheads (Hybrid OSM + Google)

> **Replaces the old two-step `backfill-trailheads.ts` + `enrich-google-places.ts` flow.** Use `rebuild-trailheads.ts` for all new cities and for re-running existing ones.

Discovers and scores trailhead access points using both OSM and Google Places data:

1. Reconstruct route geometry from all linked segments
2. Compute bounding box (0.003° buffer) and trail centroid
3. **OSM (Overpass):** query POIs within bbox (same tags as before)
4. **Google Places:** `searchText` for `"{systemName} trailhead"` and `"{systemName} park"` biased to trail centroid within 600m
5. **Merge + deduplicate** candidates from both sources (within 60m → prefer Google coordinates and metadata)
6. **Score** all candidates: distance-to-route (hard reject >150m), type match, review count/rating, name contains "trail"
7. Deduplicate nearby candidates (within 80m), pick top N per system
8. Write `trailHeads` with Google metadata already attached — no separate enrich step needed for location/name/rating

**This script writes by default.** Pass `--dryRun` to skip writes.

### Dry run first (always)

```bash
npx tsx scripts/rebuild-trailheads.ts \
  --city "Denver" \
  --state "CO" \
  --dryRun \
  --verbose
```

The verbose dry-run output shows per-system counts: `OSM | GOOG | MRGD | KEPT` (raw candidates from each source, merged total, and kept after hard filter + top-N). Each trailhead shows `dist=Xm` from route and `src=merged|osm|google`.

### Write

```bash
npx tsx scripts/rebuild-trailheads.ts \
  --city "Denver" \
  --state "CO"

# Via npm alias (no city filter — use direct call for multi-city DBs):
npm run rebuild:trailheads -- --city "Denver" --state "CO"
```

### All flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--city` | string | (all) | Case-insensitive substring match on `system.city` |
| `--state` | string | (all) | Case-insensitive substring match on `system.state`. **Lenient**: systems without `state` are always included. |
| `--system` | string | (all) | Substring match on `system.slug`, `system.name`, or `system.extSystemRef`. Useful for testing a single system. |
| `--limit` | number | (all) | Process only first N systems after filtering. |
| `--maxPerCluster` | number | 3 | Max trailheads to create per system. |
| `--dryRun` | flag | off | **Skip all writes.** (Default is to write.) |
| `--verbose` | flag | off | Show each kept trailhead with lat/lon, dist-to-route, score, and Google place ID. |

### Scoring breakdown

| Factor | Points |
|---|---|
| dist ≤30m from route | +10 |
| dist 31–60m | +8 |
| dist 61–100m | +5 |
| dist 101–150m | +2 |
| dist >150m | **hard reject** |
| OSM tag = `highway=trailhead` | +4 |
| OSM tag = `amenity=parking` | +3 |
| OSM tag = `entrance` or `barrier=gate` | +2 |
| OSM tag = `information` / `tourism=information` | +1 |
| Google type = park / hiking area / tourist attraction | +2 |
| Google review count > 0 | +1 |
| Google review count > 50 | +1 |
| Google rating ≥ 4.0 | +1 |
| Name contains "trail" or "trailhead" | +2 |
| Source = `merged` (OSM + Google matched) | +2 |

Final sort: score desc, then distance asc. Candidates within 80m of an already-selected head are discarded.

### OSM POI types queried

| OSM tag | Stored source |
|---|---|
| `highway=trailhead` | `osm:trailhead` |
| `amenity=parking` | `osm:parking` |
| `entrance=*` | `osm:entrance` |
| `barrier=gate` | `osm:gate` |
| `information=guidepost/map/board` | `osm:information` |
| `tourism=information` | `osm:information` |

### Merge logic

An OSM candidate and a Google candidate are merged if they are within 60m of each other. The merged record uses **Google coordinates and metadata** (name, address, maps URL, rating) while retaining **OSM tags** for parking info (capacity, fee, access). Merged candidates receive the `source = "merged"` label.

### Fallback (when no candidates survive the 150m filter)

Collects all line endpoints from segments, clusters by 50m proximity, uses cluster centroids as trailhead locations. Stored with `source = "derived:endpoints"`. These have no Google metadata attached.

### upsert key format

`trailSlug` field = `"<extSystemRef>::<osmSource or google:placeId>::<rank>"`

Examples:
- `sys:barton-creek-trail::osm:parking::1`
- `sys:barton-creek-trail::google:ChIJ...::2`
- `sys:barton-creek-trail::derived:endpoints::1`

> **Note:** The upsert key format changed from the legacy `backfill-trailheads.ts` format. If you previously ran the old script and are switching to `rebuild-trailheads.ts`, the new keys will create new records. Delete or archive the old trailHeads records first if you want a clean slate.

### Fields written to `trailHeads`

```
trailSlug               — upsert key (composite)
name                    — Google canonical name, OSM name tag, or "<type> #<rank>"
lat, lon                — coordinates (Google's if merged/google, OSM's if osm-only)
systemRef               — extSystemRef (string FK to system)
parking                 — JSON { osmId, capacity, fee, access } when source contains osm:parking
raw                     — JSON { source, osmSource, osmId, osmTags, rank, distToRouteM,
                                 score, systemRef, systemSlug, systemName, computedAt }
googlePlaceId           — Google stable place ID (if found)
googleCanonicalName     — Google display name
googleAddress           — Formatted address
googleMapsUrl           — Google Maps URL
googleRating            — 0.0–5.0
googleReviewCount       — integer
googleMatchConfidence   — 0.5 (google-only) or 0.8 (merged)
googleMatchReason       — string e.g. "hybrid;distToRouteM=9.3;source=merged"
```

Links written: `trailHeads → trailSystems` (typed link via `.link({ system: systemInstantId })`)

### Expected output

```
=== REBUILD TRAILHEADS SUMMARY ===
Systems processed:          55
Systems skipped (no geom):  1
Systems hybrid (OSM+Goog):  28
Systems OSM only:           21
Systems Google only:        2
Systems fallback:           4
Total trailHeads to write:  152
Existing trailHeads in DB:  162
  → UPDATE (existing):      60
  → CREATE (new):           92

Upserting 152 trailHead(s)...
  Written 50/152...
  Written 100/152...
  Written 150/152...
  Written 152/152...

Done. 152 trailHead(s) upserted.
```

### Rate limits and timing

The script makes Overpass + two Google Places calls per system, plus an 800ms polite delay between Overpass queries. For 55 systems, expect ~35–40 minutes. Safe to re-run from scratch if interrupted (all writes are idempotent via upsert key).

If `GOOGLE_MAPS_API_KEY` is missing or empty, Google candidates are silently skipped and the script falls back to OSM-only mode with a warning at startup.

---

## 9. Step 5b — Primary Trailhead Linkage

Two short scripts that must run **after Step 5 (`rebuild-trailheads.ts`)**. They select one primary trailhead per system and flag it on both the system and the head record. Step 5b can run before Step 6 since `rebuild-trailheads.ts` already writes `googleMatchConfidence`, which the primary-selection algorithm uses.

> **Schema prerequisite:** `primaryTrailHeadId`, `trailHeadsLastLinkedAt`, `trailHeadsLinkConfidence`, `trailHeadsLinkReason` on `trailSystems` and `isPrimary` on `trailHeads` must be in `src/lib/instant/schema.ts` and pushed to InstantDB **before** running these scripts. Run `npm run instant:push` once if in doubt.

> **Scope:** These two scripts have **no `--city` or `--state` flags**. They operate on all systems and heads in the database. This is fine when you have a single city; for multi-city DBs you would need to run them after each city ingest and they will safely re-evaluate all cities (idempotent).

---

### 5b-1 — `backfill-primary-trailheads.mjs` — Pick primary head per system

**Purpose:** For each `trailSystem`, inspect all `trailHeads` linked by `trailHead.systemRef === trailSystem.extSystemRef`, pick the best one as primary, and write the result to the system record.

**Selection algorithm (tie-breaks applied in order):**

| Priority | Field | Direction | Missing value used |
|---|---|---|---|
| 1 | `raw.rank` | ASC (lower = better) | 999 |
| 2 | `raw.score` | DESC (higher = better) | -1 |
| 3 | `googleMatchConfidence` | DESC | -1 |
| 4 | `raw.distanceMeters` | ASC (closer = better) | 1e12 |
| 5 | `googleReviewCount` | DESC | -1 |

**`linkConfidence` score:** Starts at 0.5. Bonuses: +0.2 if `raw.rank === 1`, +0.2 if `googleMatchConfidence >= 0.8`, +0.1 if `raw.distanceMeters <= 100`. Clamped to 0–1.

**Dry run by default.** Pass `--write` to persist.

```bash
# Dry run (inspect decisions + low-confidence warnings):
npm run trailheads:backfill:primary

# Dry run — cap to first 100 systems for spot-checking:
npm run trailheads:backfill:primary -- --limit 100

# Write (skip systems that already have primaryTrailHeadId):
npm run trailheads:backfill:primary -- --write

# Write AND overwrite existing primaryTrailHeadId:
npm run trailheads:backfill:primary -- --write --force
```

**All flags:**

| Flag | Description |
|---|---|
| `--limit N` | Cap systems processed to N. |
| `--write` | Enable writes. Without this, dry run only. |
| `--force` | Only valid with `--write`. Overwrite systems that already have `primaryTrailHeadId`. Without `--force`, those systems are skipped. |

**Fields written to `trailSystems`:**

```
primaryTrailHeadId          — InstantDB id string of the chosen trailHead
trailHeadsLastLinkedAt      — ISO timestamp of this run
trailHeadsLinkConfidence    — 0.0–1.0 float
trailHeadsLinkReason        — string, e.g. "rank=1,score=4,gConf=0.85,distM=42,reviews=312"
```

**Dry-run output:**

```
systemsProcessed: 55
with0Heads:       1
with1Head:        20
withManyHeads:    34

(10 sample decisions)
(picks where linkConfidence < 0.6)
```

**Env vars:** Same as all other scripts — `.env.local` loaded automatically. Accepts `INSTANT_APP_ID` or `INSTANTDB_APP_ID`; `INSTANT_ADMIN_TOKEN`, `INSTANT_APP_ADMIN_TOKEN`, or `INSTANTDB_ADMIN_TOKEN`.

---

### 5b-2 — `backfill-trailhead-isPrimary.mjs` — Sync `isPrimary` onto heads

**Purpose:** For each system that has a `primaryTrailHeadId`, find all `trailHeads` belonging to that system and set `isPrimary = true` on the chosen head and `isPrimary = false` on all others.

This script is always run **after** `backfill-primary-trailheads.mjs` so that the system-side `primaryTrailHeadId` is already populated.

**Dry run by default.** Pass `--write` to persist. Without `--force`, only heads where `isPrimary` is currently `null`/`undefined` are updated — already-set heads are left alone. With `--force`, all matching heads are updated regardless.

```bash
# Dry run:
npm run trailheads:backfill:isPrimary

# Dry run — cap to first 100 systems:
npm run trailheads:backfill:isPrimary -- --limit 100

# Write (only update heads with isPrimary not yet set):
npm run trailheads:backfill:isPrimary -- --write

# Write AND overwrite all heads (recommended after any re-run of script 5b-1):
npm run trailheads:backfill:isPrimary -- --write --force
```

**All flags:**

| Flag | Description |
|---|---|
| `--limit N` | Cap systems processed to N. |
| `--write` | Enable writes. Without this, dry run only. |
| `--force` | Only valid with `--write`. Update `isPrimary` on all matched heads, not just those where it is unset. |

**Fields written to `trailHeads`:**

```
isPrimary    — true on the system's primary head, false on all other heads in the same system
```

Heads belonging to systems with no `primaryTrailHeadId` are not touched.

**Dry-run output:**

```
systemsProcessed:       55
systemsMissingPrimaryId: 1
systemsWithPrimaryId:   54
trailHeadsScanned:      163
wouldSetTrue:           54
wouldSetFalse:          109

(up to 10 sample rows: system slug/name, primaryTrailHeadId, head id/name, googleCanonicalName, googleMapsUrl, shouldBePrimary)
```

**Env vars:** Same as all other scripts.

---

### Canonical run order for Step 5b

```bash
# 1. Ensure schema has the new fields:
npm run instant:push

# 2. Pick primary head per system (first run — no existing ids to worry about):
npm run trailheads:backfill:primary -- --write

# 3. Sync isPrimary flag onto the head records:
npm run trailheads:backfill:isPrimary -- --write --force

# --- On subsequent re-runs (e.g. after adding a new city or re-running Step 5) ---
# Overwrite existing choices:
npm run trailheads:backfill:primary -- --write --force
# Re-sync isPrimary:
npm run trailheads:backfill:isPrimary -- --write --force
```

---

## 10. Step 6 — Enrich Google Places (Supplementary)

> **Role changed.** `rebuild-trailheads.ts` (Step 5) now fetches Google Places data (name, address, rating, maps URL) as part of the hybrid pipeline. `enrich-google-places.ts` is now supplementary — use it only to add fields that `rebuild-trailheads.ts` does not fetch: phone number, opening hours, `nearbyDogLogistics`, and business status. It also re-enriches any trailHeads that were created by the legacy `backfill-trailheads.ts` and still lack Google data.

Enriches each `trailHead` with additional data from the Google Places API (New). Requires `GOOGLE_MAPS_API_KEY` in `.env.local`.

**Dry run by default.** Pass `--write` to persist.

### Dry run

```bash
npx tsx scripts/enrich-google-places.ts \
  --city "Denver" \
  --state "CO"
```

In dry-run mode, each processed trailhead prints a JSON preview to stdout showing `chosenPlaceId`, `confidence`, `reason`, and the full `payloadToWrite`.

### Write

```bash
npx tsx scripts/enrich-google-places.ts \
  --city "Denver" \
  --state "CO" \
  --write
```

### Via npm alias (no flags — always dry run, no city filter)

```bash
npm run enrich:google -- --city "Denver" --write
```

### All flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--write` | flag | off | Enable writes. Without this, nothing is written. |
| `--force` | flag | off | Re-fetch even if trailHead already has `googlePlaceId`. Without this, trailHeads with existing Google data are skipped. |
| `--city` | string | (all) | **Note:** filtered on trailHead.city field. If trailHeads don't have a `city` field, this filter is skipped with a warning message (not an error). |
| `--state` | string | (all) | Same note as city. |
| `--limit` | number | (all) | Process only first N trailHeads after filtering. |
| `--radiusBiasM` | number | 800 | Search radius for text search bias (metres). |
| `--radiusDogM` | number | 1500 | Radius for nearby dog-logistics search (metres). |

### City/state filtering caveat

The Google enrichment script filters `trailHeads` by their own `city`/`state` fields, not by system. TrailHeads populated in Step 5 do NOT have `city` or `state` fields written to them (those fields are not in the backfill payload). If you pass `--city` and no trailHeads have that city field, you'll see:

```
--city provided but trailHeads has no city field; skipping city filter.
```

This means all trailHeads in the DB get considered. Safe to proceed — the Google search uses lat/lon coordinates so geographic scoping happens implicitly.

### Search logic

For each trailHead (that does not already have a `googlePlaceId` unless `--force` is passed):
1. Search: `"<system name> trailhead"` within `radiusBiasM` centered on the trailHead's lat/lon
2. If no confident match: Search `"<system name> park"` within `radiusBiasM`
3. Score each result: distance bucket (0.15–0.60) + type match (+0.25) + review presence (+0.15) + review boost + rating boost + trail word boost
4. Reject candidates >1200m from the trailHead
5. Fetch full details for the top candidate (hours, phone, website, business status)
6. Search for nearby dog logistics (vets, pet stores, dog parks, cafes) within `radiusDogM`

> **Note:** Trailheads produced by `rebuild-trailheads.ts` already have accurate coordinates, so the search bias in step 1 is well-placed. Use `--force` only when you want to re-fetch hours/phone/dog logistics on heads that already have `googlePlaceId`.

### Fields written to `trailHeads`

```
googlePlaceId           — Google's stable place ID
googleCanonicalName     — Display name from Google
googleAddress           — Formatted address
googleMapsUrl           — Google Maps URL
googlePhone             — National phone number
googleWebsite           — Website URI
googleRating            — 0.0–5.0
googleReviewCount       — Integer
googleOpenNow           — Boolean (null if hours unknown)
googleWeekdayText       — Array of 7 strings like "Monday: 6:00 AM – 10:00 PM"
googleLastSyncAt        — ISO timestamp of this fetch
googleBusinessStatus    — "OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"
googleMatchConfidence   — 0.0–1.0 float
googleMatchReason       — String describing match quality
nearbyDogLogistics      — JSON: { radiusM, totals, top } with counts+top3 per dog type
```

### Expected output

```
=== ENRICH GOOGLE PLACES SUMMARY ===
trailHeads considered:      105
processed:                  87
skipped (missing coords):   0
skipped (has googlePlaceId):0
skipped (no candidate):     18
errors:                     0
written:                    87
```

`skipped (no candidate)` = no Google Place found within 1200m with sufficient confidence. Normal for remote or poorly-mapped trail access points.

---

## 11. Step 6b — Trailhead Photos

Fetches one photo per trailhead from the Google Places API (New) and writes `googlePhotoName` and `googlePhotoUri` to each `trailHead`. Used by the app to show trailhead imagery (e.g. in TrailheadsSection).

**Prerequisites:** Trailheads must have `googlePlaceId` set. That comes from Step 5 (`rebuild-trailheads.ts`) or Step 6 (`enrich-google-places.ts`). The script skips any trailhead that already has `googlePhotoUri` or `googlePhotoName`.

**Dry run by default.** Pass `--write` to persist.

### Workflow

1. Load all `trailHeads` from InstantDB.
2. Keep only those with a non-empty `googlePlaceId` and no existing `googlePhotoUri` / `googlePhotoName`.
3. For each: call Google Place Details with field mask `id,name,photos`; take the first photo’s `name`; call getMedia with `maxHeightPx=400` and `skipHttpRedirect=true` to get a `photoUri`.
4. Write `googlePhotoName` and `googlePhotoUri` to the trailhead (when `--write`).

### Dry run

```bash
npx tsx scripts/enrich-trailhead-photos.ts
```

With a limit (e.g. to test on a few heads):

```bash
npx tsx scripts/enrich-trailhead-photos.ts --limit 10
```

### Write

```bash
npx tsx scripts/enrich-trailhead-photos.ts --write

# Optional: cap how many to process in one run
npx tsx scripts/enrich-trailhead-photos.ts --limit 50 --write
```

### All flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--write` | flag | off | Enable writes. Without this, nothing is written. |
| `--limit` | number | (all) | Process only first N trailheads (after filtering to eligible). |

**No `--city` or `--state`.** The script runs over all eligible trailheads in the DB. Eligibility = has `googlePlaceId`, missing both `googlePhotoUri` and `googlePhotoName`.

### Environment

Requires `GOOGLE_MAPS_API_KEY` in `.env.local`. Same as Step 6. Script exits with an error if the key is missing, empty, or the placeholder `__PASTE_YOUR_KEY_HERE__`.

### Rate limiting

Uses a 300 ms minimum delay between Google API calls (Place details + getMedia per head). For large batches, expect roughly two calls per head; total time scales with `--limit` or total eligible count.

### Fields written to `trailHeads`

```
googlePhotoName   — Google's photo resource name (e.g. places/ChIJ.../photos/...)
googlePhotoUri    — Signed or redirect URI from getMedia (maxHeightPx=400, skipHttpRedirect=true)
```

### Expected output

```
Enrich trailhead photos (Google Places API)

Config: limit=undefined, write=false

Processing 87 trailhead(s).

--- Barton Creek Greenbelt - Trailhead ---
  placeId: ChIJ...
  photoName: places/ChIJ.../photos/...
  photoUri: https://...
  [dry run] would write googlePhotoName, googlePhotoUri

Done.
Run with --write to persist.
```

If no trailheads have `googlePlaceId`: `No trailHeads with googlePlaceId found. Nothing to do.`  
If all eligible heads already have photos: `No trailHeads left to process. Done.`

### When to run

- **After Step 5 or Step 6** so that trailheads have `googlePlaceId`.
- Safe to re-run: already-enriched heads are skipped. Use `--limit` for a small test run before a full `--write`.

---

## 12. Step 7 — System Enrichment Modules

All scripts enrich `trailSystems` using Overpass API or other external sources. All require `--city`. All are **dry run by default** (pass `--write` to persist), **except `enrich-city.ts`** which uses `--dry-run false`.

All scripts share this filtering behavior:
- `--city`: substring match on `system.city`, case-insensitive, **required**
- `--state`: substring match on `system.state`, case-insensitive, **lenient** (systems without `state` field pass through)
- `--limit`: slice first N systems after filtering
- City/state filtering happens client-side after fetching all systems from DB

---

### 7a. `enrich-city.ts` — Elevation, Hazards, Route Structure, Access Rules

A single runner for 4 computationally heavier modules that use shared segment geometry infrastructure.

**Default mode: DRY RUN.** Use `--dry-run false` to write.

```bash
# Single module, dry run:
npx tsx scripts/enrich-city.ts \
  --city "Denver" \
  --state "CO" \
  --modules elevation

# Multiple modules, dry run:
npx tsx scripts/enrich-city.ts \
  --city "Denver" \
  --state "CO" \
  --modules "elevation,hazards,route_structure,access_rules"

# Write — MUST use --dry-run false (not --write):
npx tsx scripts/enrich-city.ts \
  --city "Denver" \
  --state "CO" \
  --modules "elevation,hazards,route_structure,access_rules" \
  --dry-run false
```

**Flags specific to `enrich-city.ts`:**

| Flag | Type | Default | Description |
|---|---|---|---|
| `--modules` | string | `elevation` | Comma-separated list. Valid: `elevation`, `hazards`, `route_structure`, `access_rules` |
| `--dry-run` | string | `true` | Pass `false` to write. Also accepts `--dry false`. Does NOT accept `--write`. |
| `--slug` | string | (all) | Exact slug match. Process a single system only. Useful for spot-checking one system. |
| `--limit` | number | (all) | Max systems to process. |

**Fields written per module:**

`elevation`:
```
elevationMinFt, elevationMaxFt, elevationGainFt, elevationLossFt,
gradeP50, gradeP90, elevationSampleCount, elevationProvider, elevationComputedAt
```

`hazards`:
```
hazardsScore, hazardsClass ("low"|"medium"|"high"),
hazards (JSON: roadCrossings, waterCrossings, cliffOrSteepEdge, bikeConflictProxy, offLeashConflictProxy),
hazardPoints (JSON array), hazardsReasons (string array), hazardsLastComputedAt
```

`route_structure`:
```
routeType ("loop"|"out_and_back"|"lollipop"|"network"|"point_to_point"|"unknown"),
bailoutScore, bailoutClass ("low"|"medium"|"high"), bailoutPoints (JSON array),
bailoutReasons (string array), accessPoints (JSON), loopStats (JSON),
routeGraphStats (JSON: nodeCount, edgeCount, intersectionCount, deadEndCount, componentCount),
structureLastComputedAt
```

`access_rules`:
```
accessRulesScore, accessRulesClass ("easy"|"some_constraints"|"restricted"|"unknown"),
accessRules (JSON: hours, fees, access, landManager),
accessRulesReasons (string array), accessRulesLastComputedAt
```
Also writes to trailHeads: `headAccessClass`, `headFeeReason`, `headOpenNow`, `headLandManager`, `headHoursText`, `accessRulesLastComputedAt`

---

### 7b. `enrich-systems-surface.ts` — Surface & Paw Safety

Queries Overpass for walkable OSM ways, intersects with trail geometry, computes surface distribution.

```bash
# Dry run:
npx tsx scripts/enrich-systems-surface.ts \
  --city "Denver" --state "CO"

# Write:
npx tsx scripts/enrich-systems-surface.ts \
  --city "Denver" --state "CO" \
  --write
```

Fields: `surfaceBreakdown` (JSON), `heatRisk`, `roughnessRisk`, `asphaltPercent`, `naturalSurfacePercent`, `surfaceLastComputedAt`

---

### 7c. `enrich-systems-shade.ts` — Shade Proxy

Queries Overpass for tree/forest/park polygons. Samples points along trail geometry every N metres and classifies shade by proximity to OSM shade features.

```bash
npx tsx scripts/enrich-systems-shade.ts \
  --city "Denver" --state "CO" \
  [--sampleMeters 50] [--nearMeters 25] \
  --write
```

Extra flags: `--sampleMeters` (default 50), `--nearMeters` (default 25)

Fields: `shadeClass`, `shadeProxyScore`, `shadeProxyPercent`, `shadeSources`, `shadeLastComputedAt`

---

### 7d. `enrich-systems-water.ts` — Water Features

Two Overpass queries: water bodies (lakes, rivers, streams) + access candidates (beaches, fords, drinking water). Filters by distance to trail geometry.

```bash
npx tsx scripts/enrich-systems-water.ts \
  --city "Denver" --state "CO" \
  --write
```

Fields: `waterNearScore`, `waterNearPercent`, `waterTypesNearby`, `swimAccessPoints`, `swimLikely`, `waterLastComputedAt`

---

### 7e. `enrich-systems-crowd.ts` — Crowd Proxy

Gathers crowd signals: parking capacity, amenity density, transit access, urban adjacency. Reuses `parkingCapacityEstimate` if already set by logistics enrichment.

```bash
npx tsx scripts/enrich-systems-crowd.ts \
  --city "Denver" --state "CO" \
  [--anchorRadius 400] [--amenityRadius 250] [--parkingRadius 500] \
  --write
```

Extra flags: `--anchorRadius` (default 400), `--amenityRadius` (default 250), `--parkingRadius` (default 500)

Fields: `crowdClass` ("low"|"medium"|"high"), `crowdProxyScore`, `crowdSignals` (JSON), `crowdReasons` (string array), `crowdLastComputedAt`

---

### 7f. `enrich-systems-highlights.ts` — Scenic POIs

Overpass query for viewpoints, waterfalls, peaks, art, historic features within N metres of the trail.

```bash
npx tsx scripts/enrich-systems-highlights.ts \
  --city "Denver" --state "CO" \
  [--nearMeters 150] \
  --write
```

Extra flags: `--nearMeters` (default 150)

Fields: `highlights` (JSON array, capped at 40), `highlightsByType` (JSON), `highlightsCount`, `highlightsLastComputedAt`

---

### 7g. `enrich-systems-logistics.ts` — Parking & Amenities

Three Overpass queries around anchor points (start, end, centroid of system geometry). Counts parking lots, amenities (toilets, water, shelter, info boards).

```bash
npx tsx scripts/enrich-systems-logistics.ts \
  --city "Denver" --state "CO" \
  [--parkingRadius 500] [--amenityRadius 250] \
  --write
```

Extra flags: `--parkingRadius` (default 500), `--amenityRadius` (default 250)

Fields: `parkingCount`, `parkingCapacityEstimate`, `parkingFeeKnown`, `logisticsLastComputedAt`

> **Note:** Run logistics before crowd, since crowd reuses `parkingCapacityEstimate` if present.

---

### 7h. `enrich-systems-mud.ts` — Mud Risk

Same OSM surface way query as surface enrichment. Classifies surfaces into HARD/SEMI/NATURAL/UNKNOWN buckets.

```bash
npx tsx scripts/enrich-systems-mud.ts \
  --city "Denver" --state "CO" \
  --write
```

Fields: `mudRisk` ("low"|"medium"|"high"), `mudRiskScore`, `mudRiskReason`, `mudLastComputedAt`

---

### 7i. `enrich-systems-night-winter.ts` — Night & Winter Proxy

Two Overpass queries: lit walkable ways + street lamp nodes. Computes lit coverage and paved/winter-maintained coverage.

```bash
npx tsx scripts/enrich-systems-night-winter.ts \
  --city "Denver" --state "CO" \
  [--sampleMeters 50] [--nearMeters 30] \
  --write
```

Extra flags: `--sampleMeters` (default 50), `--nearMeters` (default 30)

Fields: `nightClass`, `nightFriendly`, `nightScore`, `winterClass`, `winterLikelyMaintained`, `winterScore`

---

### 7j. `enrich-systems-personalization.ts` — Personalization & Safety

Runs `computePersonalization` and `computeSafety` modules from `src/lib/enrich/modules/`. May query Overpass via the modules.

**Default mode: DRY RUN.** Use `--dry false` to write.

```bash
# Dry run (default):
npx tsx scripts/enrich-systems-personalization.ts \
  --city "Denver" --state "CO"

# Write — MUST use --dry false:
npx tsx scripts/enrich-systems-personalization.ts \
  --city "Denver" --state "CO" \
  --dry false
```

Flags: `--dry` (`true`|`false`, default `true`), `--modules` (`personalization,safety`, default `personalization`), `--slug` (single system), `--batchSize` (default 50), `--radiusMeters` (default 10000)

Fields: `personalization` (JSON), `personalizationLastComputedAt`, `safety` (JSON), `safetyLastComputedAt`

---

### Recommended enrichment order (dependencies)

1. `enrich-systems-logistics` — sets `parkingCapacityEstimate` and `parkingCount`
2. `enrich-systems-crowd` — uses `parkingCapacityEstimate` if present
3. All others are independent of each other

The `enrich-city.ts` modules (elevation, hazards, route_structure, access_rules) are independent of the `enrich-systems-*` scripts. `access_rules` reads `trailHeads` so ensure Step 5 is done first.

---

## 13. Step 8 — Dog Policy Seeding

Dog policy data is **manually curated**. There is no automated scraper. Data lives in `scripts/policy/policy-seeds.ts` and is versioned in git.

**Default mode: DRY RUN.** Writes require `--commit`.

### Add policies to `policy-seeds.ts`

Open [scripts/policy/policy-seeds.ts](../scripts/policy/policy-seeds.ts) and add an entry to `POLICY_SEEDS`:

```ts
export const POLICY_SEEDS: Record<string, PolicySeed> = {
  // Key: systemSlug (preferred) or extSystemRef
  // systemSlug = slugify(system_name) = all-lowercase, hyphens replace spaces and special chars
  "cherry-creek-trail": {
    dogsAllowed: "allowed",          // "allowed" | "prohibited" | "unknown"
    leashPolicy: "required",         // "required" | "off_leash_allowed" | "conditional" | "unknown"
    leashDetails: "Dogs must be on a leash no longer than 6 feet at all times.",
    policySourceUrl: "https://example.gov/cherry-creek-rules",
    policySourceTitle: "Cherry Creek Trail Rules | example.gov",
    policyConfidence: 0.9,           // 0.0–1.0; must be >= minConfidence (default 0.7) to be written
    policyMethod: "manual_seed",     // always "manual_seed" in this file
    policyNotes: "Verified from official city parks page 2026-01.",
  },
};
```

**Confidence gate:** By default only seeds with `policyConfidence >= 0.7` are written. Seeds below that threshold are logged as `LOW_CONFIDENCE_SKIP`. Use `--minConfidence 0.5` to lower the gate, or `--allowUnknown` to allow seeds where `dogsAllowed = "unknown"` (those fail validation by default).

**Skip list:** Any slug in `POLICY_SEED_SKIP_SLUGS` is always skipped regardless of confidence. Currently contains `"not-assigned"`. Add placeholder or artifact slugs here.

### Finding slugs for new systems

The slug is stored on each `trailSystem` as `slug`. You can see it in the rollup output table or query InstantDB directly. Alternatively, apply `slugify()` manually: lowercase, replace non-alphanumeric runs with `-`, trim leading/trailing `-`.

Examples:
- `"Cherry Creek Trail"` → `cherry-creek-trail`
- `"Bear Creek/Ute Valley Trail"` → `bear-creek-ute-valley-trail`
- `"5280 Trail"` → `5280-trail`

### Run dry-run first

```bash
# Dry run showing the full report table:
npx tsx scripts/policy/seed-policy-austin.ts \
  --city "Denver" \
  --state "CO"
```

Report columns: `slug | name | dogsAllowed | leashPolicy | conf | sourceUrl | action`

Action values:
- `WOULD_UPDATE` — will be written on `--commit`
- `SKIP_NO_CHANGE` — already up to date
- `SKIP_SLUG` — in the skip list
- `NO_MAPPING` — no entry in `POLICY_SEEDS` for this slug
- `INVALID` — fails validation (missing required fields)
- `LOW_CONFIDENCE_SKIP` — confidence below threshold

### Commit

```bash
npx tsx scripts/policy/seed-policy-austin.ts \
  --city "Denver" \
  --state "CO" \
  --commit
```

> **Note:** The npm alias `npm run policy:seed:austin` bakes in `--dryRun` and will never write. Always use the direct call with `--commit` for actual writes.

### All flags

| Flag | Type | Default | Description |
|---|---|---|---|
| `--city` | string | **required** | Exact match on `system.city` (NOT substring — see note below) |
| `--state` | string | (all) | Exact match on `system.state` |
| `--dataset` | string | (all) | Exact match on `system.extDataset` |
| `--limit` | number | (all) | Max systems to process |
| `--onlySlugs` | string | (all) | Comma-separated slug list. Only these systems are processed. |
| `--skipSlugs` | string | (none) | Additional slugs to skip (added to `POLICY_SEED_SKIP_SLUGS`). |
| `--minConfidence` | number | 0.7 | Minimum confidence to write a seed. |
| `--allowUnknown` | flag | off | Allow `dogsAllowed: "unknown"` seeds to pass validation. |
| `--commit` | flag | off | Actually write to DB. Without this, dry run only. |

**Important:** The policy script uses **exact match** on `city` (not substring). If the system was ingested with `city: "Austin"`, you must pass `--city "Austin"` (not `--city "aust"`). This differs from all other scripts.

### Fields written to `trailSystems`

```
dogsAllowed         — "allowed" | "prohibited" | "unknown"
leashPolicy         — "required" | "off_leash_allowed" | "conditional" | "unknown"
leashDetails        — string (if set in seed)
policySourceUrl     — string (if set)
policySourceTitle   — string (if set)
policyConfidence    — 0.0–1.0 float
policyMethod        — "manual_seed"
policyVerifiedAt    — ISO timestamp of the commit run
policyNotes         — string (if set)
```

---

## 14. Complete Checklist

Replace `Denver`, `CO`, `denver_socrata_abc123` with the actual values for your city.

```
PHASE 0 — ENVIRONMENT
[ ] Verify .env.local has INSTANT_APP_ID, INSTANT_ADMIN_TOKEN, GOOGLE_MAPS_API_KEY
[ ] npm run instant:pushverify
    Expected: "Schema check passed." with all 4 entities listed as OK

PHASE 1 — EXPLORE
[ ] Fetch a sample from the data source and identify all field names
[ ] Fill in the field mapping worksheet (Section 3 of this doc)
[ ] Confirm geometry is GeoJSON in [lon, lat] order
[ ] Confirm length is in miles (or plan conversion)
[ ] Confirm width is in feet (or plan conversion)
[ ] Identify the right filter to get only existing/active trails

PHASE 2 — INGEST
[ ] Copy scripts/ingest-austin-open-data.mjs → scripts/ingest-<city>-data.mjs
[ ] Update EXT_DATASET constant
[ ] Update SOCRATA_BASE constant (or replace fetch function for non-Socrata)
[ ] Update $where filter in fetchSocrataPage (or replace with file load)
[ ] Update all ← CHANGE fields in recordToSegmentPayload()
[ ] Add state field to systemsByRef payload if needed
[ ] Verify lengthMiles and width conversions if source uses non-imperial units
[ ] node scripts/ingest-<city>-data.mjs 2>&1 | tee ingest-<city>.log
    Expected: skipped: 0, systemsUpserted: N, segmentsUpserted: M

PHASE 3 — ROLLUP
[ ] npx tsx scripts/rollup-systems-from-segments.ts --city "Denver" --dataset "denver_socrata_abc123"
    (dry run — inspect table output)
[ ] npx tsx scripts/rollup-systems-from-segments.ts --city "Denver" --dataset "denver_socrata_abc123" --write
    Expected: "Skipped (0 segs): 0", all systems updated

PHASE 4 — LINK
[ ] node scripts/link-segments-to-systems.mjs
    Expected: linked: M, skipped: 0

PHASE 5 — TRAILHEADS (hybrid OSM + Google)
[ ] npx tsx scripts/rebuild-trailheads.ts --city "Denver" --state "CO" --dryRun --verbose
    (review: OSM | GOOG | MRGD | KEPT counts per system, check dist= values ≤150m)
[ ] npx tsx scripts/rebuild-trailheads.ts --city "Denver" --state "CO"
    Expected: Systems hybrid (OSM+Goog): N, Total trailHeads to write: N, written: N
    Timing: ~35–40 min for 55 systems (Overpass + Google API calls)

PHASE 5b — PRIMARY TRAILHEAD LINKAGE
(Runs on ALL systems in DB — no city flag. Safe to re-run.)
[ ] npm run instant:push
    (only needed first time these schema fields are added)
[ ] npm run trailheads:backfill:primary -- --write
    Expected: systemsProcessed: N, with0Heads: 0 (ideally), writes confirmed
[ ] npm run trailheads:backfill:isPrimary -- --write --force
    Expected: wouldSetTrue: N, wouldSetFalse: M, writes confirmed

NOTE: On subsequent re-runs after adding a new city or re-running Step 5:
[ ] npm run trailheads:backfill:primary -- --write --force   (overwrite existing)
[ ] npm run trailheads:backfill:isPrimary -- --write --force

PHASE 6 — GOOGLE PLACES (supplementary — phone/hours/dog logistics only)
NOTE: rebuild-trailheads.ts (Phase 5) already wrote googlePlaceId, googleCanonicalName,
      googleAddress, googleMapsUrl, googleRating, googleReviewCount.
      Run enrich-google-places.ts only to add phone, opening hours, and nearbyDogLogistics.
[ ] npx tsx scripts/enrich-google-places.ts --city "Denver" --state "CO"
    (dry run — review JSON previews, check confidence scores)
[ ] npx tsx scripts/enrich-google-places.ts --city "Denver" --state "CO" --write
    Expected: processed: N, errors: 0

PHASE 6b — TRAILHEAD PHOTOS
NOTE: Requires trailHeads with googlePlaceId (from Phase 5 or 6). Writes googlePhotoName + googlePhotoUri.
[ ] npx tsx scripts/enrich-trailhead-photos.ts
    (dry run — check "Processing N trailhead(s)", photoName/photoUri per head)
[ ] npx tsx scripts/enrich-trailhead-photos.ts --limit 5 --write
    (optional: test on 5 heads first)
[ ] npx tsx scripts/enrich-trailhead-photos.ts --write
    Expected: per-head "written: googlePhotoName, googlePhotoUri" or "photos: none"; Done at end.

PHASE 7 — SYSTEM ENRICHMENT
(Run logistics before crowd. All others are independent.)

[ ] npx tsx scripts/enrich-systems-logistics.ts --city "Denver" --state "CO" --write
[ ] npx tsx scripts/enrich-systems-crowd.ts --city "Denver" --state "CO" --write
[ ] npx tsx scripts/enrich-systems-surface.ts --city "Denver" --state "CO" --write
[ ] npx tsx scripts/enrich-systems-shade.ts --city "Denver" --state "CO" --write
[ ] npx tsx scripts/enrich-systems-water.ts --city "Denver" --state "CO" --write
[ ] npx tsx scripts/enrich-systems-highlights.ts --city "Denver" --state "CO" --write
[ ] npx tsx scripts/enrich-systems-mud.ts --city "Denver" --state "CO" --write
[ ] npx tsx scripts/enrich-systems-night-winter.ts --city "Denver" --state "CO" --write
[ ] npx tsx scripts/enrich-city.ts --city "Denver" --state "CO" --modules elevation --dry-run false
[ ] npx tsx scripts/enrich-city.ts --city "Denver" --state "CO" --modules hazards --dry-run false
[ ] npx tsx scripts/enrich-city.ts --city "Denver" --state "CO" --modules route_structure --dry-run false
[ ] npx tsx scripts/enrich-city.ts --city "Denver" --state "CO" --modules access_rules --dry-run false
[ ] npx tsx scripts/enrich-systems-personalization.ts --city "Denver" --state "CO" --dry false

PHASE 8 — DOG POLICY
[ ] Add entries to scripts/policy/policy-seeds.ts for each system slug
[ ] npx tsx scripts/policy/seed-policy-austin.ts --city "Denver" --state "CO"
    (dry run — review WOULD_UPDATE vs NO_MAPPING counts)
[ ] npx tsx scripts/policy/seed-policy-austin.ts --city "Denver" --state "CO" --commit
    Expected: "Done." with N systems written
```

---

## 15. Invariants & Gotchas — Never Break These

### Identifier naming — forbidden field names

**Never use** these field names anywhere in the schema or ingest payloads:

`*Id`, `*Key`, `sourceKey`, `sourceObjectId`, `sourceNetworkId`, `sourceObjectKey`, `sourceNetworkKey`

These names have caused InstantDB schema validation errors. Use descriptive alternatives:
- ~~`sourceId`~~ → `extSegmentRef`
- ~~`systemId`~~ → `extSystemRef` / `systemRef`
- ~~`networkKey`~~ → `extDataset`

### Identifier format contracts

| Field | Format | Example | Notes |
|---|---|---|---|
| `extDataset` | `<city>_<source>_<dataset-id>` | `austin_socrata_jdwm-wfps` | Frozen once written. Never change. |
| `extSystemRef` | `"sys:" + slugify(system_name)` | `sys:barton-creek-trail` | `sys:` prefix is mandatory |
| `extSegmentRef` | `String(objectid)` | `"12345"` | Stable GIS ID from source |
| `systemRef` (on segment) | same value as `extSystemRef` | `sys:barton-creek-trail` | String FK, must match exactly |
| `systemSlug` (on segment) | `slugify(system_name)` | `barton-creek-trail` | Without `sys:` prefix |
| `trailSlug` (on trailHead) | `<extSystemRef>::<source>::<rank>` | `sys:barton-creek-trail::osm:parking::1` | Upsert key — composite stable key |

### `slugify()` function (used in ingest script)

```js
function slugify(s) {
  if (s == null || typeof s !== "string") return "";
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
```

All non-alphanumeric characters (including `/`, `&`, `.`, `'`) become `-`. Consecutive special chars collapse to one `-`. Leading/trailing `-` are stripped.

### InstantDB query — never include `id: {}`

```js
// WRONG — throws "id needs to be a link" validation error:
const res = await db.query({ trailSystems: { id: {}, $: { limit: 100 } } });

// CORRECT — InstantDB always returns id automatically:
const res = await db.query({ trailSystems: { $: { limit: 100 } } });
```

### Upsert pattern — always reuse existing ids

```js
// Load existing records into a Map
const existingMap = new Map();
for (const record of existingRecords) {
  existingMap.set(record.extSegmentRef, record.id); // key → InstantDB UUID
}

// For each incoming record:
const internalId = existingMap.get(incoming.extSegmentRef) ?? id(); // id() from @instantdb/admin
steps.push(db.tx.trailSegments[internalId].update(payload));
```

If you use `id()` for a record that already exists, you create a duplicate. The old record remains with its data and the new record has the new data. This silently corrupts the DB.

### Dry-run flag reference (varies per script — memorise this)

| Script | Write enabled by | Dry run by default? |
|---|---|---|
| `rollup-systems-from-segments.ts` | `--write` | Yes |
| `rebuild-trailheads.ts` | *(writes by default)* | **No — WRITES by default** |
| `backfill-trailheads.ts` | *(writes by default)* | **No — WRITES by default** (legacy) |
| `backfill-primary-trailheads.mjs` | `--write` | Yes |
| `backfill-trailhead-isPrimary.mjs` | `--write` | Yes |
| `enrich-google-places.ts` | `--write` | Yes |
| `enrich-trailhead-photos.ts` | `--write` | Yes |
| `enrich-systems-surface.ts` | `--write` | Yes |
| `enrich-systems-shade.ts` | `--write` | Yes |
| `enrich-systems-water.ts` | `--write` | Yes |
| `enrich-systems-crowd.ts` | `--write` | Yes |
| `enrich-systems-highlights.ts` | `--write` | Yes |
| `enrich-systems-logistics.ts` | `--write` | Yes |
| `enrich-systems-mud.ts` | `--write` | Yes |
| `enrich-systems-night-winter.ts` | `--write` | Yes |
| `enrich-city.ts` | `--dry-run false` | Yes |
| `enrich-systems-personalization.ts` | `--dry false` | Yes |
| `seed-policy-austin.ts` | `--commit` | Yes |

### `.update()` is a merge, not a replace

`db.tx.entity[id].update(payload)` merges `payload` onto the existing record. Fields NOT in `payload` are untouched. To clear a field, explicitly set it to `null`:

```js
payload.someField = null; // clears the field
// Omitting it → field keeps its old value
```

### `--city` filter is a substring match (except policy script)

All scripts except `seed-policy-austin.ts` use `includes()` for city matching:
```js
system.city.toLowerCase().includes(cityFilter.toLowerCase())
```

`seed-policy-austin.ts` uses exact equality (`===`). This means `--city "Aust"` would match systems with `city: "Austin"` in all enrichment scripts but NOT in the policy script.

### `--state` filter is lenient everywhere

All scripts treat missing `state` as "pass through":
```js
if (!system.state) return true; // keep system even if --state was specified
```

This is intentional for the Austin dataset where `state` was not written during ingest. For new cities where you write `state` explicitly, the filter works strictly. The leniency means passing `--state "TX"` will still process systems with no state field set.

### Geometry must be GeoJSON in `[lon, lat]` order

All geometry processing code assumes `[longitude, latitude]` (x, y) order per the GeoJSON spec. Common trap: many APIs return coordinates as `[lat, lon]`. Verify by checking if bboxes land in the correct geographic location.

Expected bbox range for US cities:
- Longitude: -125 to -65 (Western Hemisphere, negative values)
- Latitude: 25 to 50

If your bbox shows something like `[30.2, -97.8, 30.4, -97.5]`, lat/lon are swapped.

---

## 16. Troubleshooting Guide

### Ingest

**`skipped: N` with reason `missing_extSegmentRef`**
`extSegmentRef = String(r.YOUR_FIELD ?? "")` produced an empty string. The source field is null/undefined for those records. Options:
1. Check the field name is correct
2. Some records may genuinely not have a unique ID — skip them (current behavior) or derive an ID from other fields

**`systemsUpserted: 1` — all segments under one system**
The system name field always returns the same value. Check `recordToSegmentPayload` — `r.urban_trail_system_name` equivalent is probably wrong or the field doesn't exist on the source.

**`totalFetched: 0`**
The `$where` filter returned nothing. Test it manually: paste the URL with the `$where` clause into a browser. Common issues: wrong field names, wrong status values, apostrophes need escaping in Socrata SoQL (`'` → `''`).

**Schema entity not found error**
```
Schema entity "trailSegments" not found. Run: npm run instant:pushverify
```
Run `npm run instant:pushverify`. This happens on a fresh DB or if the schema was reset.

**Geometry bbox in wrong hemisphere / wrong location**
Lat/lon are swapped. Find where coordinates are read in your ingest script and swap them:
```js
geometry: {
  type: r.the_geom.type,
  coordinates: r.the_geom.coordinates.map(([lat, lon]) => [lon, lat]) // swap
}
```

### Rollup

**`Skipped (0 segs): N` — systems have no segments**
`segment.systemRef` doesn't match `system.extSystemRef` for those systems. The join key must be exactly equal. Check:
1. `extSystemRef` format: must start with `"sys:"` and use the slugified system name
2. `systemRef` on segments: must be the same value assigned in `recordToSegmentPayload`
3. No accidental whitespace or casing differences

**`No geometry: N` systems**
Those systems have segments but none with a parseable GeoJSON geometry. Check that `geometry` is correctly mapped in the ingest and that the source actually provides geometry for those records.

**All systems show `no-change` after first write**
Correct behavior on re-run. The rollup script compares existing vs computed values and only writes if there's a difference.

### Link

**`skipped: N` with `no_system_for_ref:<value>`**
The segment's `systemRef` value doesn't exist as any system's `extSystemRef`. This means the slug/systemRef derivation in the ingest produced different values for segments and systems. Most likely cause: the system was ingested from a different run with a different capitalization or special character handling in `slugify`.

### Rebuild trailheads

**`Systems skipped (no geom): N`**
Those systems have no segments with geometry in the DB. Run rollup first to verify geometry is present, or check ingest.

**`Systems fallback: N` is very high (all or most)**
Overpass and Google both found nothing within 150m of those systems' routes. This can happen for:
- Very new trails not yet in OSM with no Google Places listing
- Rural/suburban areas with sparse data
- Very small connector trails with no named access points

The fallback endpoints are geometry-derived — they're valid but have no Google metadata. For important trail systems, add a trailhead to OSM or ensure it has a Google Places listing.

**OSM column shows 0 for all systems (Overpass not working)**
Overpass may be under heavy load. The script retries 3 times per endpoint. If all fail, it skips OSM and tries Google only. To retry, re-run the script — the upsert key means fallback records are replaced by better candidates on subsequent runs.

**Google column shows 0 for all systems**
Check that `GOOGLE_MAPS_API_KEY` is set in `.env.local`. The CONFIG block at startup shows `google places: enabled` or `google places: DISABLED`. If disabled, fix the key and re-run.

**`dist=Xm` values are unexpectedly large in verbose output**
If many candidates show dist >100m, the trail geometry may not have been correctly reconstructed (check that `trailSegments` are linked to the system) or the trail is very short with few sampled points. Also verify that segment geometry is in `[lon, lat]` order — swapped coordinates push everything far from the centroid.

**`--dryRun` not stopping writes**
The flag is `--dryRun` (camelCase). `--dry-run` (kebab-case) is NOT recognised by this script and will be silently ignored, causing writes to proceed. Verify: the CONFIG block printed at start should show `mode: DRY RUN`.

**Switching from legacy `backfill-trailheads.ts` to `rebuild-trailheads.ts`**
The upsert key format is different. Old keys used `<extSystemRef>::<osmSource>::<rank>` with no change to format when Google was involved (enrich-google-places updated in place). New keys use `<extSystemRef>::<osmSource or google:placeId>::<rank>`. Re-running `rebuild-trailheads.ts` will CREATE new records alongside the old ones unless you first delete the old trailHeads in the InstantDB console and wipe `primaryTrailHeadId` from affected systems. After cleanup, re-run Step 5 and Step 5b.

### Google Places

**`throw new Error("Missing GOOGLE_MAPS_API_KEY...")`**
Set `GOOGLE_MAPS_API_KEY` in `.env.local`. The script validates it is not empty and not the placeholder string.

**`skipped (no candidate): N` is high**
Normal for trail access points in areas with sparse Google Places data. The search uses a 1200m max distance cutoff. For remote trails, there may simply be nothing close enough. Adjust `--radiusBiasM` upward (e.g. `--radiusBiasM 1200`) to cast a wider initial search net.

**`--city` filter warning but all trailheads processed**
Expected behavior — trailHeads don't have a `city` field so the script skips city filtering and processes all of them. Geographic scoping happens through lat/lon coordinates in the API calls.

### Enrichment scripts

**`Error: --city is required`**
All `enrich-systems-*.ts` and `enrich-city.ts` require `--city`. Always pass it.

**`enrich-city.ts` not writing despite `--dry-run false`**
Check the flag: `--dry-run false` (not `--write`). Also check for typo: `--dryrun false` won't work.

**`enrich-systems-personalization.ts` not writing despite `--dry false`**
Check the flag: this script uses `--dry false` (not `--dry-run false` and not `--write`).

**Systems processed: 0 after filtering**
The `--city` filter found no systems. Verify the city was written correctly during ingest. Note that city matching is case-insensitive substring — if ingest wrote `city: "austin"` and you pass `--city "Austin"`, it still matches. But if `city` was never written (undefined/null during ingest), nothing will match. Check: did your `recordToSegmentPayload` have `city: safeStr(r.YOUR_CITY_FIELD)` correctly mapped?

**Overpass errors during enrichment**
Same retry logic as backfill-trailheads: 3 retries, two endpoints, exponential backoff. If persistent: check overpass-api.de status page, try running during off-peak hours (weekday mornings UTC), or add `--limit 10` to process in smaller batches.

### Policy seeding

**`NO_MAPPING: N` — all or most systems have no mapping**
Expected on first run for a new city — `POLICY_SEEDS` doesn't have entries for the new city's slugs yet. Add them manually before committing.

**`INVALID` entries in report**
Seed has a validation issue. Common causes:
- `policyConfidence` missing or not a number 0–1
- `dogsAllowed = "unknown"` without `--allowUnknown` flag
- `leashPolicy` has an invalid value

**`LOW_CONFIDENCE_SKIP` entries**
Seed exists but `policyConfidence < minConfidence` (default 0.7). Either raise the confidence in the seed (once you have a verified source URL), or lower the gate with `--minConfidence 0.5`.

**Policy script wrote nothing despite `--commit`**
Check the report for `WOULD_UPDATE` count. If it's 0, all systems are either `SKIP_NO_CHANGE` (already up to date), `NO_MAPPING` (no seed entry), or `LOW_CONFIDENCE_SKIP`. The script prints `"Nothing to commit — no eligible updates."` in that case.

**`--city` doesn't filter correctly for policy script**
Unlike all other scripts, `seed-policy-austin.ts` uses **exact equality** for city matching, not substring. `city: "austin"` and `--city "Austin"` will NOT match (different case). Ensure the value matches exactly what was written to `trailSystem.city` during ingest.

### Primary trailhead linkage (Step 5b)

**`backfill-primary-trailheads.mjs` writes nothing despite `--write`**
Check the dry-run output for `with0Heads`. Systems with no trailHeads are skipped entirely (no primary to pick). This typically means Step 5 (`rebuild-trailheads.ts`) did not run or produced 0 heads for those systems — check that `trailHead.systemRef` values match `trailSystem.extSystemRef` exactly.

**All systems show low `linkConfidence` (< 0.6)**
The confidence formula rewards: `raw.rank === 1` (+0.2) and `googleMatchConfidence >= 0.8` (+0.2). `rebuild-trailheads.ts` writes `googleMatchConfidence = 0.8` for merged candidates and `0.5` for Google-only candidates, so Step 5b can run immediately after Step 5 without needing Step 6 first. Heads sourced from OSM-only will have no `googleMatchConfidence` (no bonus). Re-run `-- --write --force` after Step 6 if you want to update the picks based on any additional enrichment.

**`backfill-primary-trailheads.mjs` skips systems with existing `primaryTrailHeadId` (without `--force`)**
Expected behavior. The script is conservative by default: it will not overwrite an already-set primary. Pass `--force` to re-evaluate and overwrite.

**`backfill-trailhead-isPrimary.mjs` leaves some heads untouched**
Without `--force`, the script only updates heads where `isPrimary` is `null`/`undefined`. Heads that were already set to `true` or `false` are skipped. If you re-ran `backfill-primary-trailheads.mjs --force` and the primary changed, you must also run `backfill-trailhead-isPrimary.mjs --write --force` to sync the head records.

**`systemsMissingPrimaryId: N` in `backfill-trailhead-isPrimary.mjs` output**
Those systems have no `primaryTrailHeadId` set — `backfill-primary-trailheads.mjs` either hasn't run for them or they had 0 heads. Run `backfill-primary-trailheads.mjs --write` first, then re-run `backfill-trailhead-isPrimary.mjs --write --force`.

**Schema write errors: `attribute not found` or writes silently ignored**
The new fields (`primaryTrailHeadId`, `trailHeadsLastLinkedAt`, `trailHeadsLinkConfidence`, `trailHeadsLinkReason`, `isPrimary`) must exist in `src/lib/instant/schema.ts` and be pushed to the remote schema. Run `npm run instant:push` and then `npm run instant:pushverify` to confirm. If the attributes are missing from the schema file, add them before pushing.
