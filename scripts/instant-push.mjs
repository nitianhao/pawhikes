#!/usr/bin/env node
/**
 * Single push entrypoint: push schema from INSTANT_SCHEMA_FILE_PATH to Instant.
 * Load .env.local (override env). Require INSTANT_APP_ID and INSTANT_SCHEMA_FILE_PATH.
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
  console.error("Error: Schema file not found at", resolvedPath);
  process.exit(1);
}

console.log("INSTANT_SCHEMA_FILE_PATH:", schemaEnv);
console.log("Pushing schema from:", resolvedPath, "to app:", appId);

const child = spawn("npx", ["instant-cli@latest", "push", "--app", appId, "--yes"], {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, INSTANT_SCHEMA_FILE_PATH: resolvedPath },
});

child.on("exit", (code) => process.exit(code ?? 0));
