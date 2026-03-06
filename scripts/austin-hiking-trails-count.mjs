#!/usr/bin/env node
/**
 * Count distinct named hiking-style trails (Austin Urban Trails, Socrata jdwm-wfps).
 * Excludes generic segments: Sidewalk, Connector, Bike Lane, Shared Use Path, etc.
 */

const BASE = "https://data.austintexas.gov/resource/jdwm-wfps.json";
const WHERE =
  "urban_trail_name IS NOT NULL AND urban_trail_name != '' AND lower(urban_trail_name) NOT LIKE '%sidewalk%' AND lower(urban_trail_name) NOT LIKE '%connector%' AND lower(urban_trail_name) NOT LIKE '%bike%' AND lower(urban_trail_name) NOT LIKE '%lane%' AND lower(urban_trail_name) NOT LIKE '%shared use path%'";
const URL = `${BASE}?$select=count(distinct urban_trail_name)&$where=${encodeURIComponent(WHERE)}`;

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
    const preview = body.slice(0, 300);
    console.error(`HTTP ${res.status}: ${preview}`);
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
    console.error("Unexpected response shape: expected [{ count_distinct_urban_trail_name: \"...\" }]");
    process.exit(1);
  }

  const row = data[0];
  const raw = row?.count_distinct_urban_trail_name ?? row?.count;
  const count = raw != null ? parseInt(String(raw), 10) : NaN;
  if (Number.isNaN(count) || count < 0) {
    console.error("Invalid count value:", raw);
    process.exit(1);
  }

  console.log(`Austin distinct hiking-style trail names: ${count}`);
}

main();
