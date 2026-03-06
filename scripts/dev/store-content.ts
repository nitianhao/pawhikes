#!/usr/bin/env npx tsx
/**
 * Read generated content JSON files from out/content/ and write the seoContent
 * field to the matching trailSystem in InstantDB.
 *
 * Strips evidence/warnings (review-only) before storing — only clean copy goes to DB.
 * Dry-run by default. Pass --write to persist.
 *
 * Usage:
 *   npx tsx scripts/dev/store-content.ts              # dry-run, all files
 *   npx tsx scripts/dev/store-content.ts --write       # persist all
 *   npx tsx scripts/dev/store-content.ts --slug mueller-trail --write
 *   npx tsx scripts/dev/store-content.ts --limit 5 --write
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "out", "content");

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
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

/** Clean section stored to DB — no evidence/warnings. */
interface StoredSection {
  a: string;
  b: string;
}

/** Clean FAQ stored to DB — no evidence/warnings. */
interface StoredFaq {
  q: string;
  a: string;
  confidence: "high" | "medium" | "low";
}

/** What's stored in the seoContent JSON field on trailSystems. */
interface StoredSeoContent {
  sections: Record<string, StoredSection>;
  faqs: StoredFaq[];
  generatedAt: string;
  model: string;
}

interface ContentFile {
  trail: { id: string; slug: string; name: string };
  generatedAt: string;
  model: string;
  sections: Record<string, { a: string; b: string; evidence?: string[]; warnings?: unknown[] }>;
  faqs: Array<{ q: string; a: string; confidence?: string; evidence?: string[]; warnings?: unknown[] }>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal();
  const { slug: slugFilter, write, limit } = parseArgs();

  const appId = process.env.INSTANT_APP_ID;
  const adminToken =
    process.env.INSTANT_APP_ADMIN_TOKEN ?? process.env.INSTANT_ADMIN_TOKEN;

  if (!appId || !adminToken) {
    console.error("❌  Missing INSTANT_APP_ID or INSTANT_ADMIN_TOKEN");
    process.exit(1);
  }

  if (!existsSync(OUT_DIR)) {
    console.error(
      `❌  Output directory not found: ${OUT_DIR}\n    Run npm run gen:content first.`
    );
    process.exit(1);
  }

  // Collect content files (exclude index.md)
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  let targets = files
    .map((f) => {
      const raw = readFileSync(join(OUT_DIR, f), "utf-8");
      return JSON.parse(raw) as ContentFile;
    })
    .filter(
      (d) =>
        d.trail?.id &&
        d.sections &&
        // Skip error-only records (all sections are fallback text)
        Object.values(d.sections).some(
          (s) => s.a !== "Unknown based on available data."
        )
    );

  if (slugFilter) targets = targets.filter((d) => d.trail.slug === slugFilter);
  if (limit) targets = targets.slice(0, limit);

  if (targets.length === 0) {
    console.error(
      "❌  No content files found" +
        (slugFilter ? ` for slug "${slugFilter}"` : "") +
        "."
    );
    process.exit(1);
  }

  console.log(`🐾  store-content  [${write ? "WRITE" : "DRY RUN"}]`);
  console.log(`    Files found: ${targets.length}`);
  console.log();

  const db = init({ appId, adminToken });

  let stored = 0;
  let failed = 0;

  for (const data of targets) {
    const { id, slug, name } = data.trail;

    // Strip evidence/warnings — only clean a/b copy goes to DB
    const sections: Record<string, StoredSection> = {};
    for (const [key, sec] of Object.entries(data.sections)) {
      sections[key] = { a: sec.a, b: sec.b };
    }

    const faqs: StoredFaq[] = data.faqs.map((f) => ({
      q: f.q,
      a: f.a,
      confidence: (["high", "medium", "low"].includes(f.confidence ?? "")
        ? f.confidence
        : "low") as StoredFaq["confidence"],
    }));

    const seoContent: StoredSeoContent = {
      sections,
      faqs,
      generatedAt: data.generatedAt,
      model: data.model,
    };

    process.stdout.write(`  ${name} (${slug})...`);

    if (!write) {
      console.log(
        ` [dry-run] ${Object.keys(sections).length} sections, ${faqs.length} FAQs`
      );
      continue;
    }

    try {
      await (db as any).transact([
        (db as any).tx.trailSystems[id].update({ seoContent }),
      ]);
      console.log(` ✓  ${Object.keys(sections).length} sections, ${faqs.length} FAQs`);
      stored++;
    } catch (err) {
      console.log(` ✗  ${String(err).slice(0, 100)}`);
      failed++;
    }
  }

  console.log("\n" + "─".repeat(52));
  if (write) {
    console.log(`📊  Stored: ${stored}  |  Failed: ${failed}`);
  } else {
    console.log(`📊  Dry run complete — ${targets.length} files ready.`);
    console.log(`    Re-run with --write to persist to InstantDB.`);
  }
  console.log("─".repeat(52));
}

main().catch((err) => {
  console.error("❌  Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
