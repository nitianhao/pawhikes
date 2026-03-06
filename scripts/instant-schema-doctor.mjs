#!/usr/bin/env node
/**
 * Pull live Instant schema, then print snippets relevant to trailSegments.source
 * so we can see how it's defined and how to migrate it.
 */

import { readFileSync, existsSync } from "fs";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { loadEnvLocal } from "./_loadEnvLocal.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
loadEnvLocal(root);

const appId = process.env.INSTANT_APP_ID || process.env.INSTANTDB_APP_ID;
const schemaEnv = process.env.INSTANT_SCHEMA_FILE_PATH;

if (!appId) {
  console.error("Error: INSTANT_APP_ID or INSTANTDB_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!schemaEnv) {
  console.error("Error: INSTANT_SCHEMA_FILE_PATH must be set in .env.local");
  process.exit(1);
}

const resolvedPath = resolve(root, schemaEnv);

const env = {
  ...process.env,
  INSTANT_APP_ID: appId,
  INSTANT_SCHEMA_FILE_PATH: resolvedPath,
};

const child = spawn("npx", ["instant-cli@latest", "pull", "--app", appId], {
  stdio: "inherit",
  cwd: root,
  env,
});

child.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  if (!existsSync(resolvedPath)) {
    console.error("Schema file not found after pull:", resolvedPath);
    process.exit(1);
  }
  const text = readFileSync(resolvedPath, "utf8");
  const lines = text.split("\n");

  console.log("\n=== SCHEMA PATH ===");
  console.log(resolvedPath);

  const trailSegmentsIdx = lines.findIndex((l) => l.includes("trailSegments"));
  if (trailSegmentsIdx >= 0) {
    const half = 60;
    const start = Math.max(0, trailSegmentsIdx - half);
    const end = Math.min(lines.length, trailSegmentsIdx + half + 1);
    console.log("\n=== TRAILSEGMENTS SNIPPET ===");
    for (let i = start; i < end; i++) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  } else {
    console.log("\n=== TRAILSEGMENTS SNIPPET ===\n(not found)");
  }

  const linksIdx = lines.findIndex((l) => l.includes("links:"));
  if (linksIdx >= 0) {
    const half = 100;
    const start = Math.max(0, linksIdx - half);
    const end = Math.min(lines.length, linksIdx + half + 1);
    console.log("\n=== LINKS SNIPPET ===");
    for (let i = start; i < end; i++) {
      console.log(`${i + 1}: ${lines[i]}`);
    }
  } else {
    console.log("\n=== LINKS SNIPPET ===\n(not found)");
  }

  const sourceWordRe = /\bsource\b/;
  const matchIndices = [];
  lines.forEach((l, i) => {
    if (sourceWordRe.test(l)) matchIndices.push(i);
  });
  console.log("\n=== SOURCE OCCURRENCES ===");
  const printed = new Set();
  for (const idx of matchIndices) {
    const start = Math.max(0, idx - 2);
    const end = Math.min(lines.length, idx + 3);
    for (let i = start; i < end; i++) {
      if (printed.has(i)) continue;
      printed.add(i);
      console.log(`${i + 1}: ${lines[i]}`);
    }
    if (end < lines.length || start > 0) console.log("---");
  }
  if (matchIndices.length === 0) console.log("(no line contains the exact word 'source')");

  process.exit(0);
});
