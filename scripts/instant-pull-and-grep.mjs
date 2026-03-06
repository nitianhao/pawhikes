#!/usr/bin/env node
/**
 * Pull remote schema, then print lines containing trailSegments, sourceLink, sourceKey, trailSystems.
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
const token = process.env.INSTANT_ADMIN_TOKEN || process.env.INSTANTDB_ADMIN_TOKEN;
const schemaEnv = process.env.INSTANT_SCHEMA_FILE_PATH;

if (!appId) {
  console.error("Error: INSTANT_APP_ID must be set in .env.local");
  process.exit(1);
}
if (!token) {
  console.error("Error: INSTANT_ADMIN_TOKEN must be set in .env.local");
  process.exit(1);
}

const resolvedPath = schemaEnv ? resolve(root, schemaEnv) : resolve(root, "src/lib/instant/schema.ts");
const env = { ...process.env, INSTANT_APP_ID: appId, INSTANT_ADMIN_TOKEN: token, INSTANT_SCHEMA_FILE_PATH: resolvedPath };

const child = spawn("npx", ["instant-cli@latest", "pull", "--app", appId], {
  stdio: "inherit",
  cwd: root,
  env,
});

child.on("exit", (code) => {
  if (code !== 0) process.exit(code ?? 1);
  try {
    const text = readFileSync(resolvedPath, "utf8");
    const lines = text.split("\n");
    const keywords = ["trailSegments", "sourceLink", "sourceKey", "trailSystems"];
    console.log("\n--- Lines containing trailSegments, sourceLink, sourceKey, trailSystems ---");
    lines.forEach((line, i) => {
      if (keywords.some((k) => line.includes(k))) console.log(`${i + 1}: ${line.trim()}`);
    });
  } catch (e) {
    console.warn("Could not read schema file:", e.message);
  }
  process.exit(0);
});
