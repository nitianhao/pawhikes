#!/usr/bin/env node
/**
 * Dev helper: print canonical trail slugs for sanity checks.
 *
 * Usage:
 *   node scripts/dev/print-trail-slugs.mjs
 *
 * Prints 50 trailSystems with:
 * - name
 * - id
 * - extSystemRef
 * - canonicalTrailSlug
 *
 * Also prints:
 * - max slug length observed
 * - duplicates count
 *
 * Exits nonzero if duplicates found.
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { loadEnvLocal } from "../_loadEnvLocal.mjs";
import { init } from "@instantdb/admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
loadEnvLocal(root);

const appId = process.env.INSTANT_APP_ID || process.env.INSTANTDB_APP_ID;
const adminToken =
  process.env.INSTANT_APP_ADMIN_TOKEN ||
  process.env.INSTANT_ADMIN_TOKEN ||
  process.env.INSTANTDB_ADMIN_TOKEN;

if (!appId) {
  console.error("Error: INSTANTDB_APP_ID (or INSTANT_APP_ID) must be set in .env.local");
  process.exit(1);
}
if (!adminToken) {
  console.error(
    "Error: INSTANTDB_ADMIN_TOKEN (or INSTANT_ADMIN_TOKEN / INSTANT_APP_ADMIN_TOKEN) must be set in .env.local"
  );
  process.exit(1);
}

function safeSlug(input) {
  const base = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "unknown";
}

function truncateOnToken(slug, maxLen) {
  const value = String(slug ?? "");
  if (maxLen <= 0) return "";
  if (value.length <= maxLen) return value;
  const head = value.slice(0, maxLen);
  const lastDash = head.lastIndexOf("-");
  const trimmed = lastDash > 0 ? head.slice(0, lastDash) : head;
  return trimmed.replace(/-+$/g, "");
}

function lastN(value, n) {
  const v = String(value ?? "");
  if (n <= 0) return "";
  return v.length <= n ? v : v.slice(v.length - n);
}

function canonicalTrailSlug({ name, id, extSystemRef }) {
  // A) Base slug (readable)
  let base = safeSlug(String(name ?? "")) || "trail";
  if (base.length > 42) base = truncateOnToken(base, 42) || base.slice(0, 42);
  base = base || "trail";

  // B) Stable suffix (compact but stable)
  const idRaw = String(id ?? "").trim();
  const ext = String(extSystemRef ?? "").trim();
  const extStripped = ext.startsWith("sys:") ? ext.slice(4) : ext;
  const stableRaw = extStripped || idRaw || "unknown";

  let stableSlug = safeSlug(stableRaw) || "unknown";

  if (stableSlug.length > 30) {
    const prefix = truncateOnToken(stableSlug, 22) || stableSlug.slice(0, 22) || "unknown";
    const tail6Raw = idRaw ? lastN(idRaw, 6) : lastN(stableSlug, 6);
    const tail6 = safeSlug(tail6Raw) || tail6Raw || "unknown";
    stableSlug = `${prefix}-${tail6}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  }

  const tailRaw = idRaw ? lastN(idRaw, 8) : lastN(stableSlug, 8);
  const tail = safeSlug(tailRaw) || "unknown";

  let suffixFinal = stableSlug || "unknown";
  if (!suffixFinal.endsWith(tail) && !suffixFinal.endsWith(`-${tail}`)) {
    suffixFinal = `${suffixFinal}-${tail}`;
  }
  suffixFinal = suffixFinal.replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "unknown";

  // C) Final canonical
  return `${base}--${suffixFinal}`;
}

function entityList(res, name) {
  return res?.[name] ?? res?.data?.[name] ?? [];
}

async function main() {
  const db = init({ appId, adminToken });

  const res = await db.query({ trailSystems: { $: { limit: 50 } } });
  const systems = entityList(res, "trailSystems");

  let maxLen = 0;
  const seen = new Map();
  const dups = [];

  for (const s of systems) {
    const slug = canonicalTrailSlug({
      name: s.name ?? null,
      id: s.id ?? null,
      extSystemRef: s.extSystemRef ?? null,
    });

    maxLen = Math.max(maxLen, String(slug).length);

    if (seen.has(slug)) {
      dups.push({ slug, first: seen.get(slug), second: s });
    } else {
      seen.set(slug, s);
    }

    console.log("—".repeat(80));
    console.log("name:       ", s.name ?? "(no name)");
    console.log("id:         ", s.id ?? "(no id)");
    console.log("extSystemRef:", s.extSystemRef ?? "(none)");
    console.log("canonical:  ", slug);
  }

  console.log("\n=== SUMMARY ===");
  console.log("records:", systems.length);
  console.log("maxLengthObserved:", maxLen);
  console.log("duplicates:", dups.length);

  if (dups.length > 0) {
    console.log("\n=== DUPLICATES ===");
    for (const d of dups) {
      console.log("\nslug:", d.slug);
      console.log(" first:", d.first?.id, d.first?.name);
      console.log(" second:", d.second?.id, d.second?.name);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  if (err?.body) console.error("API body:", JSON.stringify(err.body, null, 2));
  process.exit(1);
});

