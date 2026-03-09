#!/usr/bin/env npx tsx
/**
 * Builds a compact search index from InstantDB trailSystems and writes it to
 * public/search-index.json for use by the client-side search engine.
 *
 * Usage:
 *   npm run build:search
 *   npx tsx scripts/build-search-index.ts
 *
 * Required env vars: INSTANT_APP_ID, INSTANT_ADMIN_TOKEN (reads from .env.local)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ─── Env loading ──────────────────────────────────────────────────────────────

function loadEnv(): void {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

// ─── Slug helpers (mirrored from src/lib/slug.ts + src/lib/trailSlug.ts) ─────

function safeSlug(input: string): string {
  const base = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "unknown";
}

function slugifyCity(name: string): string {
  return safeSlug(name);
}

function normalizeState(state: string): string {
  const raw = String(state ?? "").trim();
  if (/^[a-zA-Z]{2}$/.test(raw)) return raw.toUpperCase();
  return safeSlug(raw) || "unknown";
}

function truncateOnToken(slug: string, maxLen: number): string {
  const value = String(slug ?? "");
  if (maxLen <= 0) return "";
  if (value.length <= maxLen) return value;
  const head = value.slice(0, maxLen);
  const lastDash = head.lastIndexOf("-");
  return (lastDash > 0 ? head.slice(0, lastDash) : head).replace(/-+$/g, "");
}

function lastN(value: string, n: number): string {
  const v = String(value ?? "");
  if (n <= 0) return "";
  return v.length <= n ? v : v.slice(v.length - n);
}

function canonicalTrailSlug(input: {
  name?: string | null;
  id?: string | null;
  extSystemRef?: string | null;
}): string {
  let base = safeSlug(String(input?.name ?? "")) || "trail";
  if (base.length > 42) base = truncateOnToken(base, 42) || base.slice(0, 42);
  base = base || "trail";

  const idRaw = String(input?.id ?? "").trim();
  const ext = String(input?.extSystemRef ?? "").trim();
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

  return `${base}--${suffixFinal}`;
}

// ─── Tokenize (mirrored from src/lib/search/tokenize.ts) ─────────────────────

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const words = lower.split(/[\s\-_,./():]+/).filter(Boolean);
  return [...new Set(words)];
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SearchEntry = {
  slug: string;
  name: string;
  city: string;
  state: string;
  citySlug: string;
  len: number | null;
  leash: string | null;
  shade: string | null;
  gradeP90: number | null;
  waterScore: number | null;
  paved: number | null;
  crowdScore: number | null;
  tokens: string[];
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnv();

  const appId = process.env.INSTANT_APP_ID ?? "";
  const adminToken = process.env.INSTANT_ADMIN_TOKEN ?? "";

  if (!appId || !adminToken) {
    console.error("Missing INSTANT_APP_ID or INSTANT_ADMIN_TOKEN in .env.local");
    process.exit(1);
  }

  const db = init({ appId, adminToken });

  console.log("Querying trailSystems...");
  const result = await db.query({
    trailSystems: {
      $: {
        limit: 5000,
        fields: [
          "id",
          "name",
          "slug",
          "city",
          "state",
          "extSystemRef",
          "lengthMilesTotal",
          "leashPolicy",
          "shadeClass",
          "gradeP90",
          "waterNearScore",
          "pavedPercentProxy",
          "crowdProxyScore",
        ],
      },
    },
  });

  const systems: Record<string, unknown>[] = (() => {
    const r = result as Record<string, unknown>;
    const v = r?.trailSystems;
    if (Array.isArray(v)) return v as Record<string, unknown>[];
    const nested = (v as Record<string, unknown>)?.data;
    return Array.isArray(nested) ? (nested as Record<string, unknown>[]) : [];
  })();

  console.log(`Found ${systems.length} trail systems.`);

  const entries: SearchEntry[] = [];

  for (const s of systems) {
    const name = String(s.name ?? "").trim();
    const city = String(s.city ?? "").trim();
    const rawState = String(s.state ?? "").trim();

    if (!name || !city) continue;

    const len = typeof s.lengthMilesTotal === "number" ? s.lengthMilesTotal : null;
    if (len === null || len <= 1) continue;

    const state = normalizeState(rawState);
    const citySlug = slugifyCity(city);
    const trailSlug = canonicalTrailSlug({
      name: s.name as string ?? null,
      id: s.id as string ?? null,
      extSystemRef: s.extSystemRef as string ?? null,
    });

    const leash = typeof s.leashPolicy === "string" ? s.leashPolicy : null;
    const shade = typeof s.shadeClass === "string" ? s.shadeClass : null;
    const gradeP90 = typeof s.gradeP90 === "number" ? s.gradeP90 : null;
    const waterScore = typeof s.waterNearScore === "number" ? s.waterNearScore : null;
    const paved = typeof s.pavedPercentProxy === "number" ? s.pavedPercentProxy : null;
    const crowdScore = typeof s.crowdProxyScore === "number" ? s.crowdProxyScore : null;

    const tokens = [
      ...tokenize(name),
      ...tokenize(city),
    ];

    entries.push({
      slug: trailSlug,
      name,
      city,
      state,
      citySlug,
      len,
      leash,
      shade,
      gradeP90,
      waterScore,
      paved,
      crowdScore,
      tokens,
    });
  }

  const outPath = join(ROOT, "public", "search-index.json");
  mkdirSync(join(ROOT, "public"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(entries), "utf-8");

  console.log(`Wrote ${entries.length} entries to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
