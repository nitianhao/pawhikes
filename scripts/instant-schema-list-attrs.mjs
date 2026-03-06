#!/usr/bin/env node
/**
 * Pull remote schema, then list attribute keys inside austinTrailSegments_v2 entity.
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
  if (!existsSync(resolvedPath)) {
    console.error("Schema file not found:", resolvedPath);
    process.exit(1);
  }
  const text = readFileSync(resolvedPath, "utf8");
  const lines = text.split("\n");

  const startIdx = lines.findIndex((l) => l.includes("austinTrailSegments_v2"));
  if (startIdx < 0) {
    console.log("austinTrailSegments_v2 not found in schema.");
    process.exit(0);
    return;
  }

  let braceIdx = -1;
  for (let i = startIdx; i < lines.length; i++) {
    const idx = lines[i].indexOf("{");
    if (idx >= 0) {
      braceIdx = i;
      break;
    }
  }
  if (braceIdx < 0) {
    console.log("Opening brace for austinTrailSegments_v2 not found.");
    process.exit(0);
    return;
  }

  let depth = 0;
  const blockLines = [];
  for (let i = braceIdx; i < lines.length; i++) {
    const line = lines[i];
    for (const c of line) {
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    blockLines.push(line);
    if (depth === 0) break;
  }

  const attrRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/;
  const attrs = new Set();
  for (const line of blockLines) {
    const m = line.match(attrRe);
    if (m) attrs.add(m[1]);
  }
  const sorted = [...attrs].sort();

  console.log("\naustinTrailSegments_v2 attributes:");
  sorted.forEach((a) => console.log(" -", a));

  console.log("\n--- Raw block (first 60 lines) ---");
  const rawLimit = Math.min(60, blockLines.length);
  for (let i = 0; i < rawLimit; i++) {
    console.log(blockLines[i]);
  }
  if (blockLines.length > 60) console.log("... (" + (blockLines.length - 60) + " more lines)");

  process.exit(0);
});
