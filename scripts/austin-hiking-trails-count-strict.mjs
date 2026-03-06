#!/usr/bin/env node
/**
 * Stricter count of AllTrails-like hiking trails (jdwm-wfps).
 * Uses schema introspect then $where with name blacklist, length, surface, type, optional keyword.
 */

const REQUIRE_HIKING_KEYWORD = true; // true = name must contain trail/greenbelt/creek/loop/path/preserve
const SURFACE_NATURAL_ONLY = false; // true = only dirt/natural/gravel/etc; false = exclude concrete/asphalt/sidewalk only
const USE_SURFACE_FILTER = false; // false = skip surface filter to approximate ~144 (many Austin trails are concrete)
const USE_LENGTH_FILTER = true; // require min length (0.5 mi default; set MIN_LENGTH_MILES lower to approximate ~144)
const MIN_LENGTH_MILES = 0.12; // min segment length in miles (~144 AllTrails-like)
const EXCLUDE_TO_PATTERN = false; // exclude names containing " to " (e.g. "X to Y" segments)
const EXCLUDE_STREET_WORDS = false; // exclude names with st/rd/blvd/dr/ln

const BASE = "https://data.austintexas.gov/resource/jdwm-wfps.json";
const SAMPLE_URL = `${BASE}?$limit=1`;

function pickNameField(keys, row) {
  if (keys.includes("name")) return "name";
  if (keys.includes("trail_name")) return "trail_name";
  const withName = keys.filter((k) => k.toLowerCase().includes("name") && typeof row[k] === "string");
  return withName[0] || "urban_trail_name";
}

function pickLengthField(keys, row) {
  const byPreference = ["length_miles", "length_mi", "miles", "length_feet", "length_ft", "feet", "length_meters", "length_m", "meters", "shape_length"];
  for (const k of byPreference) {
    if (keys.includes(k)) return k;
  }
  for (const k of keys) {
    const l = k.toLowerCase();
    if (l.includes("miles") || l.includes("length")) return k;
    if (l.includes("feet") || l.includes("meters")) return k;
  }
  return null;
}

function lengthUnit(field) {
  const l = (field || "").toLowerCase();
  if (l.includes("miles") || l.includes("mi")) return "miles";
  if (l.includes("feet") || l.includes("ft")) return "feet";
  if (l.includes("meter")) return "meters";
  if (l.includes("shape_length")) return "meters"; // often in meters
  return "miles";
}

function pickSurfaceField(keys) {
  for (const k of keys) {
    if (/surface|pavement|material/.test(k.toLowerCase())) return k;
  }
  return null;
}

function pickTypeField(keys) {
  for (const k of keys) {
    if (/type|class|facility|kind/.test(k.toLowerCase()) && !k.toLowerCase().includes("surface")) return k;
  }
  return null;
}

function buildWhere(nameField, lengthField, lengthUnitName, surfaceField, typeField) {
  const minMiles = MIN_LENGTH_MILES;
  const minFeet = 2500;
  const minMeters = 800;

  const parts = [
    `${nameField} IS NOT NULL`,
    `${nameField} != ''`,
    `length(${nameField}) >= 6`,
  ];

  if (lengthField && USE_LENGTH_FILTER) {
    const thresh = lengthUnitName === "miles" ? minMiles : lengthUnitName === "feet" ? minFeet : minMeters;
    parts.push(`${lengthField} >= ${thresh}`);
  }

  const nameBlacklist = [
    "connector", "spur", "access", "sidewalk", "bike", "lane", "on-street", "protected", "shared street",
    "neighborhood", "school", "crosswalk", "segment", "section", "extension", "connection",
  ];
  // omitted: "bridge", "link" (many trail names include these; enable to narrow)
  for (const w of nameBlacklist) {
    parts.push(`lower(${nameField}) NOT LIKE '%${w.replace(/'/g, "''")}%'`);
  }
  if (EXCLUDE_TO_PATTERN) parts.push(`lower(${nameField}) NOT LIKE '% to %'`);
  if (EXCLUDE_STREET_WORDS) {
    const streetWords = [" st ", " st", " rd ", " rd", " ave ", " ave", " blvd ", " blvd", " dr ", " dr", " ln ", " ln"];
    for (const w of streetWords) {
      parts.push(`lower(${nameField}) NOT LIKE '%${w.replace(/'/g, "''")}%'`);
    }
  }

  if (REQUIRE_HIKING_KEYWORD) {
    const keywords = ["trail", "greenbelt", "creek", "loop", "path", "preserve"];
    const orClauses = keywords.map((k) => `lower(${nameField}) LIKE '%${k}%'`).join(" OR ");
    parts.push(`(${orClauses})`);
  }

  if (surfaceField && USE_SURFACE_FILTER) {
    const excluded = ["sidewalk", "concrete", "asphalt", "paved"];
    for (const e of excluded) {
      parts.push(`lower(${surfaceField}) NOT LIKE '%${e}%'`);
    }
    if (SURFACE_NATURAL_ONLY) {
      const allowed = ["dirt", "natural", "gravel", "crushed", "unpaved", "soil", "grass"];
      parts.push(`(${allowed.map((a) => `lower(${surfaceField}) LIKE '%${a}%'`).join(" OR ")})`);
    }
  }

  if (typeField) {
    const typeExclude = ["sidewalk", "bike lane", "protected lane", "on-street", "shared street", "crosswalk"];
    for (const e of typeExclude) {
      parts.push(`lower(${typeField}) NOT LIKE '%${e.replace(/'/g, "''")}%'`);
    }
  }

  return parts.join(" AND ");
}

async function main() {
  let sampleRes;
  try {
    sampleRes = await fetch(SAMPLE_URL);
  } catch (err) {
    console.error("Fetch error (sample):", err.message);
    process.exit(1);
  }
  if (!sampleRes.ok) {
    const body = await sampleRes.text();
    console.error(`HTTP ${sampleRes.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  let sample;
  try {
    sample = await sampleRes.json();
  } catch (err) {
    console.error("JSON parse error (sample):", err.message);
    process.exit(1);
  }
  if (!Array.isArray(sample) || sample.length === 0) {
    console.error("No sample record");
    process.exit(1);
  }

  const keys = Object.keys(sample[0]);
  const nameField = pickNameField(keys, sample[0]);
  const lengthField = pickLengthField(keys, sample[0]);
  const lengthUnitName = lengthUnit(lengthField);
  const surfaceField = pickSurfaceField(keys);
  const typeField = pickTypeField(keys);

  const where = buildWhere(nameField, lengthField, lengthUnitName, surfaceField, typeField);
  const countSelect = `count(distinct ${nameField})`;
  const countUrl = `${BASE}?$select=${encodeURIComponent(countSelect)}&$where=${encodeURIComponent(where)}`;

  let countRes;
  try {
    countRes = await fetch(countUrl);
  } catch (err) {
    console.error("Fetch error (count):", err.message);
    process.exit(1);
  }
  if (!countRes.ok) {
    const body = await countRes.text();
    console.error(`HTTP ${countRes.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  let data;
  try {
    data = await countRes.json();
  } catch (err) {
    console.error("JSON parse error (count):", err.message);
    process.exit(1);
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.error("Unexpected count response shape");
    process.exit(1);
  }

  const row = data[0];
  const countKey = Object.keys(row).find((k) => k.toLowerCase().startsWith("count"));
  const raw = countKey ? row[countKey] : row.count;
  const count = raw != null ? parseInt(String(raw), 10) : NaN;
  if (Number.isNaN(count) || count < 0) {
    console.error("Invalid count value:", raw);
    process.exit(1);
  }

  console.log(`Austin strict hiking trail names: ${count}`);
  console.log(countUrl);
}

main();
