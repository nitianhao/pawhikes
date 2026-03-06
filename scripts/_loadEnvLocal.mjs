#!/usr/bin/env node
/**
 * Shared .env.local loader. Always overrides process.env (no "keep existing").
 * Usage: const keysLoaded = loadEnvLocal(repoRoot);
 * @param {string} root - Repo root path (directory containing .env.local)
 * @returns {string[]} List of keys that were set
 */

import { readFileSync } from "fs";
import { join } from "path";

export function loadEnvLocal(root) {
  const envPath = join(root, ".env.local");
  const keys = [];
  let raw;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return keys;
    throw err;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    if (key) {
      process.env[key] = value;
      keys.push(key);
    }
  }
  return keys;
}
