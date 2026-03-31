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
  houston: {
    // City of Houston + Bayou Greenway corridors (Harris County core)
    bbox: [-95.8, 29.5, -95.0, 30.1],
    state: "texas",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/texas-latest.osm.pbf",
  },
  dallas: {
    // City of Dallas proper
    bbox: [-97.0, 32.6, -96.5, 33.0],
    state: "texas",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/texas-latest.osm.pbf",
  },
  "fort-worth": {
    // City of Fort Worth (matches Overpass bbox in ingest script)
    bbox: [-97.65, 32.5, -97.0, 33.05],
    state: "texas",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/texas-latest.osm.pbf",
  },
  "oklahoma-city": {
    // OKC metro (matches Overpass ingest bbox; covers Edmond to the north)
    bbox: [-97.80, 35.30, -97.20, 35.75],
    state: "oklahoma",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf",
  },
  norman: {
    // Norman, OK — south of OKC along I-35 (OU trails, Thunderbird Lake area)
    bbox: [-97.55, 35.15, -97.35, 35.30],
    state: "oklahoma",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf",
  },
  edmond: {
    // Edmond, OK — north suburb of OKC (Mitch Park, Hafer Park)
    bbox: [-97.55, 35.60, -97.35, 35.75],
    state: "oklahoma",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf",
  },
  tulsa: {
    // Tulsa, OK — River Parks, Turkey Mountain, Osage Hills
    bbox: [-96.10, 35.95, -95.75, 36.30],
    state: "oklahoma",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf",
  },
  "broken-arrow": {
    // Broken Arrow, OK — SE suburb of Tulsa (Fry Creek, Riverwalk)
    bbox: [-95.90, 35.95, -95.65, 36.15],
    state: "oklahoma",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/oklahoma-latest.osm.pbf",
  },
  tucson: {
    // Tucson, AZ — Saguaro NP, Rillito River Park, Pantano Riverwalk
    bbox: [-111.10, 32.06, -110.70, 32.40],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  flagstaff: {
    // Flagstaff, AZ — Buffalo Park, Mt Elden, Walnut Canyon
    bbox: [-111.75, 35.10, -111.55, 35.25],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  sedona: {
    // Sedona, AZ — Red Rock State Park, Bell Rock, Cathedral Rock
    bbox: [-111.95, 34.80, -111.75, 34.95],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  prescott: {
    // Prescott, AZ — Prescott National Forest, Thumb Butte, Willow Lake
    bbox: [-112.55, 34.50, -112.35, 34.65],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  yuma: {
    // Yuma, AZ — Colorado River path, Gateway Park
    bbox: [-114.75, 32.55, -114.45, 32.80],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  "lake-havasu-city": {
    // Lake Havasu City, AZ — SARA Park, Mohave Wash, waterfront trail
    bbox: [-114.45, 34.40, -114.25, 34.60],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  "sierra-vista": {
    // Sierra Vista, AZ — San Pedro River trail, Huachuca Mountains
    bbox: [-110.40, 31.45, -110.20, 31.65],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  "casa-grande": {
    // Casa Grande, AZ — Dave White Regional Park, Pinal area
    bbox: [-111.85, 32.82, -111.65, 32.98],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  kingman: {
    // Kingman, AZ — Hualapai Mountain Park, Andy Devine area
    bbox: [-114.15, 35.15, -113.95, 35.30],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  "bullhead-city": {
    // Bullhead City, AZ — Colorado River waterfront, Laughlin area
    bbox: [-114.65, 35.05, -114.45, 35.25],
    state: "arizona",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/arizona-latest.osm.pbf",
  },
  albuquerque: {
    // Albuquerque, NM — Bosque Trail, Sandia Foothills, Paseo del Bosque
    bbox: [-106.85, 35.00, -106.45, 35.25],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  "santa-fe": {
    // Santa Fe, NM — Dale Ball Trails, Atalaya Mountain, Santa Fe Rail Trail
    bbox: [-106.00, 35.60, -105.90, 35.72],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  "las-cruces": {
    // Las Cruces, NM — Tortugas Mountain, Mesilla Valley Bosque, Organ Mountains
    bbox: [-106.85, 32.25, -106.65, 32.42],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  "rio-rancho": {
    // Rio Rancho, NM — Petroglyph NM, Mesa trails, Cabezon area
    bbox: [-107.10, 35.20, -106.85, 35.35],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  roswell: {
    // Roswell, NM — Spring River Park, Bottomless Lakes, greenway paths
    bbox: [-104.60, 33.35, -104.45, 33.45],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  farmington: {
    // Farmington, NM — Animas River Trail, Piñon Hills, Berg Park
    bbox: [-108.30, 36.68, -108.12, 36.80],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  "south-valley": {
    // South Valley, NM — Bernalillo Co unincorporated, Bosque area
    bbox: [-106.77, 34.95, -106.65, 35.02],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  clovis: {
    // Clovis, NM — Ned Houk Park, Greene Acres
    bbox: [-103.25, 34.38, -103.17, 34.45],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  hobbs: {
    // Hobbs, NM — Harry McAdams Park, Lea County trails
    bbox: [-103.18, 32.67, -103.09, 32.74],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  alamogordo: {
    // Alamogordo, NM — White Sands, Lincoln NF, Sacramento Mountains
    bbox: [-106.00, 32.85, -105.92, 32.95],
    state: "new-mexico",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-mexico-latest.osm.pbf",
  },
  // ── California ───────────────────────────────────────────────────────────────
  "los-angeles": {
    // Los Angeles, CA — Griffith Park, Santa Monica Mtns, Runyon Canyon, Topanga
    bbox: [-118.66, 33.90, -118.16, 34.34],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  "san-diego": {
    // San Diego, CA — Torrey Pines, Mission Trails, Cowles Mountain
    bbox: [-117.30, 32.62, -116.90, 32.98],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  "san-jose": {
    // San Jose, CA — Alum Rock, Quicksilver, Sierra Vista OSP
    bbox: [-122.05, 37.20, -121.70, 37.44],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  "san-francisco": {
    // San Francisco, CA — Golden Gate Park, Presidio, Lands End, Glen Canyon
    bbox: [-122.52, 37.70, -122.35, 37.82],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  fresno: {
    // Fresno, CA — Woodward Park, Lewis Eaton Trail, San Joaquin River
    bbox: [-119.90, 36.68, -119.65, 36.85],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  sacramento: {
    // Sacramento, CA — American River Parkway, Folsom area
    bbox: [-121.60, 38.48, -121.35, 38.68],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  "long-beach": {
    // Long Beach, CA — El Dorado Park, LA River Trail south
    bbox: [-118.25, 33.73, -118.06, 33.85],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  oakland: {
    // Oakland, CA — Redwood Regional, Joaquin Miller, Lake Merritt
    bbox: [-122.35, 37.73, -122.10, 37.88],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  bakersfield: {
    // Bakersfield, CA — Kern River Parkway, Hart Park
    bbox: [-119.15, 35.30, -118.90, 35.45],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  anaheim: {
    // Anaheim, CA — Yorba Regional, Santiago Oaks, Oak Canyon
    bbox: [-117.98, 33.78, -117.75, 33.90],
    state: "california",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/california-latest.osm.pbf",
  },
  // ── New York ──────────────────────────────────────────────────────────────────
  "new-york-city": {
    // NYC 5 boroughs — Central Park, Prospect Park, Van Cortlandt, Greenbelt, Pelham Bay
    bbox: [-74.26, 40.49, -73.70, 40.92],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  buffalo: {
    // Buffalo, NY — Delaware Park, Tifft Nature Preserve, Outer Harbor
    bbox: [-78.95, 42.83, -78.78, 42.97],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  rochester: {
    // Rochester, NY — Genesee Riverway, Highland Park, Durand Eastman
    bbox: [-77.70, 43.10, -77.53, 43.23],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  yonkers: {
    // Yonkers, NY — Old Croton Aqueduct, Tibbetts Brook Park, Untermyer Gardens
    bbox: [-73.91, 40.91, -73.82, 40.98],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  syracuse: {
    // Syracuse, NY — Onondaga Creekwalk, Clark Reservation, Green Lakes
    bbox: [-76.22, 42.98, -76.08, 43.10],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  albany: {
    // Albany, NY — Corning Preserve, Pine Bush, Washington Park
    bbox: [-73.82, 42.61, -73.72, 42.72],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  "new-rochelle": {
    // New Rochelle, NY — Glen Island Park, Twin Lakes, Huguenot trails
    bbox: [-73.80, 40.88, -73.74, 40.94],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  "mount-vernon": {
    // Mount Vernon, NY — Hutchinson River Parkway, Willson's Woods
    bbox: [-73.85, 40.90, -73.80, 40.93],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  schenectady: {
    // Schenectady, NY — Mohawk-Hudson Bike-Hike Trail, Central Park, Vale Park
    bbox: [-73.98, 42.77, -73.88, 42.84],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
  },
  utica: {
    // Utica, NY — Mohawk River Trail, Roscoe Conkling Park, Proctor Park
    bbox: [-75.28, 43.07, -75.17, 43.13],
    state: "new-york",
    geofabrikUrl: "https://download.geofabrik.de/north-america/us/new-york-latest.osm.pbf",
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
  trails: [
    // Named trail ways — for local ingest (replaces Overpass in ingest scripts)
    "w/highway=footway",
    "w/highway=path",
    "w/highway=track",
    "w/highway=cycleway",
    "w/highway=bridleway",
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
  vets: [
    "nwr/amenity=veterinary",
    "nwr/healthcare=veterinary",
    "nwr/healthcare=animal_hospital",
    "nwr/amenity=animal_hospital",
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
