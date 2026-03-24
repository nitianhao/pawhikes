#!/usr/bin/env npx tsx
/**
 * Prepare per-city OSM data from Geofabrik extracts for local enrichment.
 *
 * Downloads a state PBF, clips it to the city bbox, filters by feature
 * category, and exports GeoJSON sequences for use by enrichment scripts.
 *
 * Prerequisites:
 *   brew install osmium-tool
 *
 * Usage:
 *   npx tsx scripts/osm/prepare-city-osm.ts --city phoenix [--force]
 *
 * Output (in .cache/osm/):
 *   arizona-latest.osm.pbf       — state extract (shared across AZ cities)
 *   phoenix/clip.osm.pbf         — city bbox clip
 *   phoenix/shade.osm.pbf        — filtered shade features
 *   phoenix/shade.geojsonseq     — GeoJSON (one feature per line)
 *   phoenix/water.osm.pbf
 *   phoenix/water.geojsonseq
 *   phoenix/highlights.osm.pbf
 *   phoenix/highlights.geojsonseq
 */

import { execFileSync } from "child_process";
import { existsSync, mkdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const CACHE_DIR = join(ROOT, ".cache/osm");

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days before re-download

// ── arg parsing ───────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) { out[key] = next; i++; }
    else out[key] = true;
  }
  return out;
}

const args  = parseArgs(process.argv.slice(2));
const city  = typeof args.city === "string" ? args.city.toLowerCase() : undefined;
const force = !!args.force;

if (!city) {
  console.error("Usage: npx tsx scripts/osm/prepare-city-osm.ts --city <city> [--force]");
  console.error("  --city   City name (e.g., phoenix)");
  console.error("  --force  Re-process even if output files already exist");
  process.exit(1);
}

// ── city configs ──────────────────────────────────────────────────────────────

interface CityConfig {
  /** [minLon, minLat, maxLon, maxLat] — standard GeoJSON / osmium bbox order */
  bbox: [number, number, number, number];
  state: string;
  geofabrikUrl: string;
}

const CITY_CONFIGS: Record<string, CityConfig> = {
  phoenix: {
    bbox: [-112.35, 33.22, -111.59, 33.90],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  austin: {
    // Full Austin metro: Georgetown (N) → Kyle/Buda (S), Lakeway/Bee Cave (W) → Manor/Pflugerville (E)
    bbox: [-98.1, 29.85, -97.3, 30.75],
    state: "texas",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/texas-latest.osm.pbf",
  },
};

// ── osmium tag filter expressions per category ────────────────────────────────

const CATEGORIES: Record<string, string[]> = {
  shade: [
    "nwr/natural=wood",
    "nwr/landuse=forest",
    "nwr/natural=scrub",
    "nwr/leisure=park",
    "nwr/natural=tree_row",
    "n/natural=tree",
  ],
  water: [
    // Water bodies (for proximity / profile computation)
    "nwr/natural=water",
    "nwr/natural=bay",
    "nwr/natural=strait",
    "nwr/waterway=river",
    "nwr/waterway=stream",
    "nwr/waterway=canal",
    "nwr/waterway=drain",
    "nwr/natural=spring",
    // Water-access candidates (beach, ford, pier, drinking water)
    "nwr/natural=beach",
    "nwr/ford=yes",
    "nwr/highway=ford",
    "nwr/man_made=pier",
    "nwr/man_made=slipway",
    "n/amenity=drinking_water",
    "n/drinking_water=yes",
  ],
  highlights: [
    "nwr/tourism=viewpoint",
    "nwr/tourism=attraction",
    "nwr/waterway=waterfall",
    "nwr/natural=waterfall",
    "nwr/natural=peak",
    "nwr/natural=cave_entrance",
    "nwr/natural=spring",
    "nwr/historic",
    "nwr/ruins=yes",
  ],
  amenities: [
    "nwr/amenity=parking",
    "n/amenity=parking_entrance",
    "nwr/amenity=toilets",
    "n/amenity=drinking_water",
    "n/drinking_water=yes",
    "n/leisure=picnic_table",
    "n/amenity=bench",
    "nwr/amenity=shelter",
    "n/tourism=information",
    "n/information=board",
    "n/information=guidepost",
    "n/information=map",
    "n/amenity=waste_basket",
    "n/amenity=waste_disposal",
  ],
  surface: [
    "w/highway=path",
    "w/highway=footway",
    "w/highway=track",
    "w/highway=cycleway",
    "w/highway=pedestrian",
    "w/highway=living_street",
    "w/highway=residential",
    "w/highway=service",
  ],
  landuse: [
    "nwr/landuse=residential",
    "nwr/landuse=commercial",
    "nwr/landuse=retail",
    "nwr/landuse=industrial",
    "n/amenity=restaurant",
    "n/amenity=cafe",
    "n/amenity=bar",
    "n/amenity=fast_food",
  ],
  hazards: [
    "nwr/highway=crossing",
    "nwr/crossing",
    "nwr/ford",
    "nwr/highway=ford",
    "nwr/bridge",
    "nwr/natural=cliff",
    "nwr/geological=cliff",
    "nwr/man_made=embankment",
    "nwr/natural=scree",
    "w/highway=cycleway",
    "w/bicycle=designated",
    "w/cycleway",
    "nwr/leisure=dog_park",
    "nwr/designation=dog_off_leash",
    "nwr/dogs=off_leash",
    "nwr/access",
    "nwr/barrier",
    "nwr/fee",
    "nwr/permit",
    "nwr/opening_hours",
    "nwr/operator",
    "nwr/owner",
    "nwr/boundary=protected_area",
    "n/highway=street_lamp",
    "n/entrance",
    "n/highway=bus_stop",
    "n/amenity=bicycle_parking",
  ],
};

// ── helpers ───────────────────────────────────────────────────────────────────

function run(cmd: string, cmdArgs: string[]): void {
  console.log(`  $ ${cmd} ${cmdArgs.join(" ")}`);
  execFileSync(cmd, cmdArgs, { stdio: "inherit" });
}

function isStale(filePath: string): boolean {
  if (!existsSync(filePath)) return true;
  if (force) return true;
  const ageMs = Date.now() - statSync(filePath).mtimeMs;
  return ageMs > MAX_AGE_MS;
}

function fileSize(filePath: string): string {
  if (!existsSync(filePath)) return "(missing)";
  const bytes = statSync(filePath).size;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

// ── main ──────────────────────────────────────────────────────────────────────

const config = CITY_CONFIGS[city];
if (!config) {
  console.error(
    `Unknown city: "${city}". Available: ${Object.keys(CITY_CONFIGS).join(", ")}`,
  );
  process.exit(1);
}

// Verify osmium-tool is installed
try {
  execFileSync("osmium", ["version"], { stdio: "pipe" });
} catch {
  console.error("osmium-tool not found. Install with: brew install osmium-tool");
  process.exit(1);
}

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(join(CACHE_DIR, city), { recursive: true });

const statePbf = join(CACHE_DIR, `${config.state}-latest.osm.pbf`);
const clipPbf  = join(CACHE_DIR, city, "clip.osm.pbf");

console.log(`\n=== prepare-city-osm: ${city} ===`);
console.log(`bbox: ${config.bbox.join(", ")}`);
console.log(`state: ${config.state}`);
console.log(`force: ${force}`);
console.log(`cache: ${CACHE_DIR}\n`);

// ── Step 1: Download state PBF ────────────────────────────────────────────────

if (isStale(statePbf)) {
  console.log(`Downloading ${config.geofabrikUrl} ...`);
  run("curl", ["-L", "--progress-bar", "-o", statePbf, config.geofabrikUrl]);
  console.log(`  Downloaded: ${fileSize(statePbf)}`);
} else {
  console.log(`State PBF up to date: ${statePbf} (${fileSize(statePbf)})`);
}

// ── Step 2: Clip to city bbox ─────────────────────────────────────────────────

const bboxStr = config.bbox.join(","); // minLon,minLat,maxLon,maxLat
if (force || !existsSync(clipPbf)) {
  console.log(`\nClipping to ${city} bbox: ${bboxStr}`);
  run("osmium", [
    "extract",
    "-b", bboxStr,
    statePbf,
    "-o", clipPbf,
    "-O",
    "-s", "complete_ways",
  ]);
  console.log(`  Clip: ${fileSize(clipPbf)}`);
} else {
  console.log(`\nClip PBF exists: ${clipPbf} (${fileSize(clipPbf)})`);
}

// ── Steps 3+4: Tag-filter + GeoJSON export per category ──────────────────────

for (const [category, tags] of Object.entries(CATEGORIES)) {
  const filteredPbf = join(CACHE_DIR, city, `${category}.osm.pbf`);
  const geojsonseq  = join(CACHE_DIR, city, `${category}.geojsonseq`);

  console.log(`\n[${category}]`);

  if (force || !existsSync(filteredPbf)) {
    console.log(`  Filtering ${tags.length} tag expressions...`);
    run("osmium", [
      "tags-filter",
      clipPbf,
      ...tags,
      "-o", filteredPbf,
      "-O",
    ]);
    console.log(`  Filtered PBF: ${fileSize(filteredPbf)}`);
  } else {
    console.log(`  Filtered PBF exists: ${fileSize(filteredPbf)}`);
  }

  if (force || !existsSync(geojsonseq)) {
    console.log(`  Exporting to GeoJSON...`);
    run("osmium", [
      "export",
      filteredPbf,
      "-o", geojsonseq,
      "-f", "geojsonseq",
      "-u", "type_id",
      "-O",
    ]);
    console.log(`  GeoJSON: ${fileSize(geojsonseq)}`);
  } else {
    console.log(`  GeoJSON exists: ${fileSize(geojsonseq)}`);
  }
}

console.log(`\n=== Done: ${city} OSM data ready in .cache/osm/${city}/ ===`);
console.log(
  `Next: npx tsx scripts/enrich-systems-shade.ts --city Phoenix --state AZ --write`,
);
