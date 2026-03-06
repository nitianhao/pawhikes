#!/usr/bin/env node
/**
 * Sanity check: count Austin Urban Trails (Socrata jdwm-wfps).
 * No ingestion; count query only.
 */

const URL =
  "https://data.austintexas.gov/resource/jdwm-wfps.json?$select=count(*)&$limit=1";

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
    console.error("Unexpected response shape: expected [{ count: \"...\" }]");
    process.exit(1);
  }

  const raw = data[0]?.count;
  const count = raw != null ? parseInt(String(raw), 10) : NaN;
  if (Number.isNaN(count) || count < 0) {
    console.error("Invalid count value:", raw);
    process.exit(1);
  }

  console.log(`Austin Urban Trails records: ${count}`);
}

main();
