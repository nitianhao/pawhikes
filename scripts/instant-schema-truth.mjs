#!/usr/bin/env node
/**
 * Pull remote schema as single source of truth, then print entity snippets (austinTrailSegments, trailSegments).
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
const token = process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANTDB_ADMIN_TOKEN;

if (!appId) {
  console.error("Error: INSTANT_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!schemaEnv) {
  console.error("Error: INSTANT_SCHEMA_FILE_PATH must be set in .env.local");
  process.exit(1);
}

const resolvedPath = resolve(root, schemaEnv);
const env = { ...process.env, INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: token, INSTANT_SCHEMA_FILE_PATH: resolvedPath };

const child = spawn("npx", ["instant-cli@latest", "pull", "--app", appId], {
  stdio: "inherit",
  cwd: root,
  env,
});

child.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const exists = existsSync(resolvedPath);
  console.log("\n=== SCHEMA TRUTH ===");
  console.log("appId:", appId);
  console.log("schemaPath:", resolvedPath);
  console.log("exists:", exists);
  console.log("====================");

  if (!exists) {
    process.exit(0);
    return;
  }
  const text = readFileSync(resolvedPath, "utf8");
  const lines = text.split("\n");

  const austinIdx = lines.findIndex((l) => /austinTrailSegments\s*[:=]/.test(l));
  console.log("\n=== ENTITY: austinTrailSegments (verbatim) ===");
  if (austinIdx < 0) {
    console.log("austinTrailSegments not present in pulled schema.");
  } else {
    const end = Math.min(lines.length, austinIdx + 200);
    for (let i = austinIdx; i < end; i++) console.log(lines[i]);
  }

  const trailIdx = lines.findIndex((l) => /trailSegments\s*:/.test(l));
  console.log("\n=== ENTITY: trailSegments (verbatim) ===");
  if (trailIdx < 0) {
    console.log("trailSegments not present in pulled schema.");
  } else {
    const end = Math.min(lines.length, trailIdx + 200);
    for (let i = trailIdx; i < end; i++) console.log(lines[i]);
  }

  process.exit(0);
});
