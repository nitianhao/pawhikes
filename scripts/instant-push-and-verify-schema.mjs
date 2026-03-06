#!/usr/bin/env node
/**
 * Push schema to Instant, then pull and verify austinTrailSegments_v2 and austinTrailSystems_v2 are present.
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
const schemaExists = existsSync(resolvedPath);

console.log("appId:", appId);
console.log("schemaPath:", resolvedPath);
console.log("schema file exists?", schemaExists);

if (!schemaExists) {
  console.error("Error: Schema file not found.");
  process.exit(1);
}

const env = { ...process.env, INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: token, INSTANT_SCHEMA_FILE_PATH: resolvedPath };

function run(cmd, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: "inherit", cwd: root, env });
    child.on("exit", (code) => (code === 0 ? resolvePromise() : rejectPromise(new Error(`exit ${code}`))));
  });
}

(async () => {
  try {
    await run("npx", ["instant-cli@latest", "push", "schema", "--app", appId, "--yes"]);
  } catch (e) {
    console.error("Push failed:", e.message);
    process.exit(1);
  }

  try {
    await run("npx", ["instant-cli@latest", "pull", "--app", appId]);
  } catch (e) {
    console.error("Pull failed:", e.message);
    process.exit(1);
  }

  const text = readFileSync(resolvedPath, "utf8");

  const REQUIRED_ENTITIES = ["trails", "trailHeads", "trailSystems", "trailSegments"];
  let allPresent = true;
  for (const entity of REQUIRED_ENTITIES) {
    const found = text.includes(`${entity}:`);
    console.log(`\n=== VERIFY: ${entity} present? ===`);
    console.log(found ? "FOUND" : "NOT FOUND");
    if (!found) allPresent = false;
  }

  if (!allPresent) {
    console.error("\nOne or more canonical entities missing in pulled schema. Fix schema push.");
    process.exit(1);
  }
  console.log("\nAll 4 canonical entities verified.");
})();
