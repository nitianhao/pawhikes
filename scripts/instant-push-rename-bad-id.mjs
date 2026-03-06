#!/usr/bin/env node
/**
 * Push schema with rename so remote trailSegments.id becomes trailSegments.legacyIdLink.
 * Run once to fix "id needs to be a link" then use normal instant:push.
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
const token = process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANTDB_ADMIN_TOKEN;

if (!appId) {
  console.error("Error: INSTANT_APP_ID or INSTANTDB_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!token) {
  console.error("Error: INSTANT_ADMIN_TOKEN or INSTANTDB_ADMIN_TOKEN must be set in .env.local");
  process.exit(1);
}

const schemaEnv = process.env.INSTANT_SCHEMA_FILE_PATH;
const defaultPath = resolve(root, schemaEnv || "src/lib/instant/schema.ts");
const resolvedPath = schemaEnv ? resolve(root, schemaEnv) : defaultPath;

if (!existsSync(resolvedPath)) {
  console.error("Error: Schema file not found:", resolvedPath);
  process.exit(1);
}

const child = spawn(
  "npx",
  ["instant-cli@latest", "push", "schema", "--app", appId, "--rename", "trailSegments.id:trailSegments.legacyIdLink", "--yes"],
  {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: token, INSTANT_SCHEMA_FILE_PATH: resolvedPath },
  }
);

child.on("exit", (code) => process.exit(code ?? 0));
