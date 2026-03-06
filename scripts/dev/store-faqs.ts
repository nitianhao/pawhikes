#!/usr/bin/env npx tsx
/**
 * Read generated FAQ JSON files from out/faqs/ and write the faqs array
 * to the matching trailSystem in InstantDB.
 *
 * Strips evidence/warnings (script-review-only) before storing.
 * Dry-run by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/dev/store-faqs.ts              # dry-run, all files
 *   npx tsx scripts/dev/store-faqs.ts --write       # persist all
 *   npx tsx scripts/dev/store-faqs.ts --slug mueller-trail --write
 *   npx tsx scripts/dev/store-faqs.ts --limit 5 --write
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "out", "faqs");

// ─── Env ──────────────────────────────────────────────────────────────────────

function loadEnvLocal(): void {
  const envPath = join(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(): { slug?: string; write: boolean; limit?: number } {
  const argv = process.argv.slice(2);
  let slug: string | undefined;
  let write = false;
  let limit: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--slug" && argv[i + 1]) slug = argv[++i];
    if (argv[i] === "--write") write = true;
    if (argv[i] === "--limit" && argv[i + 1]) limit = parseInt(argv[++i], 10);
  }
  return { slug, write, limit };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface StoredFaqItem {
  q: string;
  a: string;
  confidence: "high" | "medium" | "low";
}

interface FaqFile {
  trail: { id: string; slug: string; name: string };
  faqs: Array<{ q: string; a: string; confidence?: string; evidence?: string[] }>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal();
  const { slug: slugFilter, write, limit } = parseArgs();

  const appId = process.env.INSTANT_APP_ID;
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN ?? process.env.INSTANT_ADMIN_TOKEN;
  if (!appId || !adminToken) {
    console.error("❌  Missing INSTANT_APP_ID or INSTANT_ADMIN_TOKEN");
    process.exit(1);
  }

  if (!existsSync(OUT_DIR)) {
    console.error(`❌  Output directory not found: ${OUT_DIR}\n    Run npm run gen:faqs first.`);
    process.exit(1);
  }

  // Collect FAQ files
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let targets = files.map((f) => {
    const raw = readFileSync(join(OUT_DIR, f), "utf-8");
    return JSON.parse(raw) as FaqFile;
  }).filter((d) => d.trail?.id && Array.isArray(d.faqs) && d.faqs.length > 0);

  if (slugFilter) {
    targets = targets.filter((d) => d.trail.slug === slugFilter);
  }
  if (limit) {
    targets = targets.slice(0, limit);
  }

  if (targets.length === 0) {
    console.error("❌  No FAQ files found" + (slugFilter ? ` for slug "${slugFilter}"` : "") + ".");
    process.exit(1);
  }

  console.log(`🐾  store-faqs  [${write ? "WRITE" : "DRY RUN"}]`);
  console.log(`    Files found: ${targets.length}`);
  console.log();

  const db = init({ appId, adminToken });

  let stored = 0;
  let skipped = 0;

  for (const data of targets) {
    const { id, slug, name } = data.trail;

    // Strip to DB-safe fields only (no evidence/warnings/notes)
    const stripped: StoredFaqItem[] = data.faqs.map((f) => ({
      q: f.q,
      a: f.a,
      confidence: (["high", "medium", "low"].includes(f.confidence ?? "")
        ? f.confidence
        : "low") as StoredFaqItem["confidence"],
    }));

    process.stdout.write(`  ${name} (${stripped.length} FAQs)...`);

    if (!write) {
      console.log(" [dry-run skip]");
      skipped++;
      continue;
    }

    try {
      await db.transact([
        (db as any).tx.trailSystems[id].update({ faqs: stripped }),
      ]);
      console.log(" ✓");
      stored++;
    } catch (err) {
      console.log(` ✗  ${String(err).slice(0, 100)}`);
      skipped++;
    }
  }

  console.log("\n" + "─".repeat(48));
  if (write) {
    console.log(`📊  Stored: ${stored}  |  Failed: ${skipped}`);
  } else {
    console.log(`📊  Dry run complete — ${targets.length} files ready.`);
    console.log(`    Re-run with --write to persist to InstantDB.`);
  }
  console.log("─".repeat(48));
}

main().catch((err) => {
  console.error("❌  Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
