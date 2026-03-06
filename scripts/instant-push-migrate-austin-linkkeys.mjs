#!/usr/bin/env node
/**
 * Push schema with renames: sourceObjectKey -> sourceObjectLink, sourceNetworkKey -> sourceNetworkLink
 * so we can use new string attrs sourceObjectKeyStr, sourceNetworkKeyStr for filtering/upserts.
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
  "austinTrailSegments_v2.sourceObjectKey:austinTrailSegments_v2.sourceObjectLink",
  "--rename",
  "austinTrailSegments_v2.sourceNetworkKey:austinTrailSegments_v2.sourceNetworkLink",
  "--yes",
];
console.log("Spawning args (npx + args):", JSON.stringify(["npx", ...args]));

const child = spawn("npx", args, {
  stdio: "inherit",
  cwd: root,
  env: { ...process.env, INSTANT_APP_ID: appId, INSTANT_SCHEMA_FILE_PATH: resolvedPath },
});

child.on("exit", (code) => process.exit(code ?? 0));
