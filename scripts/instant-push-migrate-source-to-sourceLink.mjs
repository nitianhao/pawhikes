#!/usr/bin/env node
/**
 * Push schema with renames: trailSegments.source -> sourceLink, trailSystems.source -> sourceLink.
 * After this, schema defines sourceKey (string) for dataset tagging.
 */

import { existsSync } from "fs";
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
  console.error("Error: INSTANT_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!schemaEnv) {
  console.error("Error: INSTANT_SCHEMA_FILE_PATH must be set in .env.local");
  process.exit(1);
}

const resolvedPath = resolve(root, schemaEnv);
if (!existsSync(resolvedPath)) {
  console.error("Error: Schema file not found:", resolvedPath);
  process.exit(1);
}

console.log("appId:", appId);
console.log("schemaPath:", resolvedPath);

const args = [
  "instant-cli@latest",
  "push",
  "--app",
  appId,
  "--rename",
  "trailSegments.source:trailSegments.sourceLink",
  "--rename",
  "trailSystems.source:trailSystems.sourceLink",
  "--yes",
];

const child = spawn("npx", args, {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, INSTANT_APP_ID: appId, INSTANT_SCHEMA_FILE_PATH: resolvedPath },
});

child.on("exit", (code) => process.exit(code ?? 0));
