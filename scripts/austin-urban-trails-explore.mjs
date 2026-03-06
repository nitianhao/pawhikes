#!/usr/bin/env node
/**
 * Detailed field exploration for Austin Urban Trails (jdwm-wfps).
 * Fetches 20 records and reports field stats, types, examples, and geometry.
 */

const URL = "https://data.austintexas.gov/resource/jdwm-wfps.json?$limit=20";

function inferType(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "object") return "object";
  return "unknown";
}

function countCoordPairs(geom) {
  if (!geom || typeof geom !== "object" || !geom.coordinates) return 0;
  const coords = geom.coordinates;
  if (geom.type === "LineString") return coords.length;
  if (geom.type === "MultiLineString") return coords.flatMap((line) => line).length;
  return 0;
}

function categorizeField(name) {
  const l = name.toLowerCase();
  if (l.includes("name") || l.includes("title")) return "naming";
  if (l.includes("length") || l.includes("mile") || l.includes("feet") || l.includes("meter") || l.includes("distance")) return "length";
  if (l.includes("surface") || l.includes("material")) return "surface";
  if (l.includes("type") || l.includes("class") || l.includes("facility") || l.includes("category") || l.includes("kind")) return "classification";
  if (l.includes("bike") || l.includes("ped") || l.includes("multi") || l.includes("use")) return "access";
  if (l.includes("geom") || l.includes("geometry") || l.includes("shape")) return "geometry";
  if (/\b(id|objectid|globalid|guid)\b/.test(l) || l === "objectid") return "metadata";
  return "other";
}

function formatSection(title) {
  console.log("\n" + "=".repeat(50));
  console.log(" " + title);
  console.log("=".repeat(50));
}

async function main() {
  let res;
  try {
    res = await fetch(URL);
  } catch (err) {
    console.error("Fetch error:", err.message);
    process.exit(1);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    process.exit(1);
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error("JSON parse error:", err.message);
    process.exit(1);
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.error("No records returned");
    process.exit(1);
  }

  const allKeys = new Set();
  data.forEach((row) => Object.keys(row).forEach((k) => allKeys.add(k)));
  const fields = [...allKeys].sort((a, b) => a.localeCompare(b));

  const stats = {};
  for (const field of fields) {
    const present = data.filter((r) => field in r && r[field] != null && r[field] !== "").length;
    const values = data.map((r) => r[field]).filter((v) => v != null && v !== "");
    const types = values.map(inferType);
    const primaryType = types.length ? types.sort((a, b) => types.filter((t) => t === b).length - types.filter((t) => t === a).length)[0] : "null";
    const examples = [...new Set(values.map((v) => (typeof v === "object" ? "[object]" : String(v).slice(0, 60))))].slice(0, 3);
    let min = null;
    let max = null;
    let avgLen = null;
    const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    if (primaryType === "number" || (primaryType === "string" && nums.length === values.length && values.length > 0)) {
      if (nums.length) {
        min = Math.min(...nums);
        max = Math.max(...nums);
      }
    }
    if (primaryType === "string") {
      const lengths = values.map((v) => String(v).length);
      avgLen = lengths.length ? (lengths.reduce((a, b) => a + b, 0) / lengths.length).toFixed(1) : null;
    }
    stats[field] = {
      present,
      total: data.length,
      primaryType,
      examples,
      min,
      max,
      avgLen,
      category: categorizeField(field),
    };
  }

  const byCategory = {
    metadata: [],
    naming: [],
    length: [],
    classification: [],
    surface: [],
    access: [],
    geometry: [],
    other: [],
  };
  fields.forEach((f) => {
    const cat = stats[f].category;
    if (byCategory[cat]) byCategory[cat].push(f);
  });

  const printField = (field) => {
    const s = stats[field];
    console.log(`  ${field}`);
    console.log(`    present: ${s.present}/${s.total}  type: ${s.primaryType}`);
    if (s.examples.length) console.log(`    examples: ${s.examples.map((e) => JSON.stringify(e)).join(", ")}`);
    if (s.min != null) console.log(`    min: ${s.min}  max: ${s.max}`);
    if (s.avgLen != null) console.log(`    avg string length: ${s.avgLen}`);
  };

  formatSection("BASIC METADATA FIELDS");
  byCategory.metadata.forEach(printField);
  if (!byCategory.metadata.length) console.log("  (none detected: id, objectid, globalid, guid)");

  formatSection("NAMING FIELDS");
  byCategory.naming.forEach(printField);
  if (!byCategory.naming.length) console.log("  (none)");

  formatSection("LENGTH / DISTANCE FIELDS");
  byCategory.length.forEach(printField);
  if (!byCategory.length.length) console.log("  (none)");

  formatSection("CLASSIFICATION FIELDS");
  byCategory.classification.forEach(printField);
  if (!byCategory.classification.length) console.log("  (none)");

  formatSection("SURFACE FIELDS");
  byCategory.surface.forEach(printField);
  if (!byCategory.surface.length) console.log("  (none)");

  formatSection("ACCESS / USE FIELDS");
  byCategory.access.forEach(printField);
  if (!byCategory.access.length) console.log("  (none)");

  formatSection("GEOMETRY");
  const geomKey = data[0] && "the_geom" in data[0] ? "the_geom" : fields.find((f) => categorizeField(f) === "geometry");
  if (geomKey && data[0][geomKey]) {
    const geom = data[0][geomKey];
    const type = typeof geom === "object" && geom && "type" in geom ? geom.type : "unknown";
    const pairs = countCoordPairs(geom);
    console.log(`  field: ${geomKey}`);
    console.log(`  geometry type: ${type}`);
    console.log(`  coordinate pairs (first record): ${pairs}`);
    if (geom.coordinates && geom.coordinates[0] && Array.isArray(geom.coordinates[0][0])) {
      const sample = geom.coordinates[0][0].slice(0, 2);
      console.log(`  coordinate sample: ${JSON.stringify(sample)}`);
    } else if (geom.coordinates && geom.coordinates[0]) {
      console.log(`  coordinate sample: ${JSON.stringify(geom.coordinates[0].slice(0, 2))}`);
    }
  } else {
    console.log("  (no the_geom or geometry field in sample)");
  }

  formatSection("OTHER FIELDS");
  byCategory.other.forEach(printField);
  if (!byCategory.other.length) console.log("  (none)");

  console.log("");
}

main();
