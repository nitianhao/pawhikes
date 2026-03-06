#!/usr/bin/env npx tsx
/**
 * BarkTrails — Offline FAQ generation pipeline using Google Vertex AI (Gemini).
 *
 * For every trailSystem in InstantDB, generates 6–10 FAQ pairs grounded
 * strictly in the record's structured fields.  No DB writes.
 *
 * Usage:
 *   npm run gen:faqs                         # all trails
 *   npm run gen:faqs -- --limit 5            # first 5
 *   npm run gen:faqs -- --slug mueller-trail # single trail
 *   npx tsx scripts/generateTrailFaqs.ts --limit 5 --concurrency 2
 *
 * Output: out/faqs/{slug}--{id}.json + out/faqs/index.md
 *
 * Required env vars (in .env.local or shell):
 *   GOOGLE_CLOUD_PROJECT    — GCP project with Vertex AI enabled
 *   INSTANT_APP_ID          — InstantDB app id
 *   INSTANT_ADMIN_TOKEN     — InstantDB admin token
 *
 * Optional:
 *   GOOGLE_CLOUD_LOCATION   — defaults to us-central1
 *   GEMINI_MODEL            — defaults to gemini-2.0-flash-lite
 *   GOOGLE_APPLICATION_CREDENTIALS — path to service-account key (ADC)
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { init } from "@instantdb/admin";

import { createGeminiClient } from "./lib/geminiVertex.js";
import { selectQuestions, buildFactsPack } from "./lib/faqRules.js";
import { validateFaqs } from "./lib/faqValidate.js";
import {
  ensureOutDir,
  writeTrailFaq,
  writeIndex,
  getOutDir,
  type FaqResult,
  type FaqItem,
} from "./lib/io.js";

// ─── Root path ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");

// ─── Env loading ──────────────────────────────────────────────────────────────

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

// ─── Arg parsing ──────────────────────────────────────────────────────────────

interface CliArgs {
  limit?: number;
  slug?: string;
  concurrency: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let limit: number | undefined;
  let slug: string | undefined;
  let concurrency = 3;

  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--limit" || argv[i] === "-l") && argv[i + 1]) {
      limit = parseInt(argv[++i], 10);
    } else if (argv[i] === "--slug" && argv[i + 1]) {
      slug = argv[++i];
    } else if (argv[i] === "--concurrency" && argv[i + 1]) {
      concurrency = Math.max(1, Math.min(10, parseInt(argv[++i], 10)));
    }
  }
  return { limit, slug, concurrency };
}

// ─── InstantDB helpers ────────────────────────────────────────────────────────

type TrailSystem = Record<string, unknown>;

function entityList<T>(result: unknown, key: string): T[] {
  const r = result as Record<string, unknown>;
  const v = r?.[key];
  if (Array.isArray(v)) return v as T[];
  const nested = (v as Record<string, unknown>)?.data;
  if (Array.isArray(nested)) return nested as T[];
  return [];
}

// ─── Concurrency helper ───────────────────────────────────────────────────────

async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let idx = 0;
  async function worker(): Promise<void> {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal();
  const { limit, slug: slugFilter, concurrency } = parseArgs();

  // ── Validate env ──────────────────────────────────────────────────────────
  const appId = process.env.INSTANT_APP_ID;
  const adminToken =
    process.env.INSTANT_APP_ADMIN_TOKEN ?? process.env.INSTANT_ADMIN_TOKEN;

  if (!appId || !adminToken) {
    console.error(
      "❌  Missing INSTANT_APP_ID or INSTANT_ADMIN_TOKEN.\n" +
        "    Add them to .env.local or export them in your shell."
    );
    process.exit(1);
  }

  // createGeminiClient() will throw with a friendly message if GOOGLE_CLOUD_PROJECT is missing
  const gemini = createGeminiClient();

  // ── Setup output ──────────────────────────────────────────────────────────
  ensureOutDir();

  console.log("🐾  BarkTrails FAQ Generator");
  console.log(`    Model:       ${gemini.modelId}`);
  console.log(`    Concurrency: ${concurrency}`);
  console.log(`    Output:      ${getOutDir()}`);
  if (slugFilter) console.log(`    Filter:      slug=${slugFilter}`);
  if (limit) console.log(`    Limit:       ${limit}`);
  console.log();

  // ── Query trail systems ───────────────────────────────────────────────────
  const db = init({ appId, adminToken });

  process.stdout.write("⏳  Querying InstantDB...");
  const res = await db.query({
    trailSystems: {
      $: {
        ...(slugFilter ? { where: { slug: slugFilter } } : {}),
        limit: limit ?? 5000,
      },
    },
  });

  let systems = entityList<TrailSystem>(res, "trailSystems");

  // Only process trails displayed on the page: lengthMilesTotal > 1
  if (!slugFilter) {
    const before = systems.length;
    systems = systems.filter(
      (s) => typeof s.lengthMilesTotal === "number" && s.lengthMilesTotal > 1
    );
    console.log(` done (${systems.length} of ${before} have lengthMilesTotal > 1 mi)`);
  } else {
    console.log(` done (${systems.length} found)`);
  }

  if (systems.length === 0) {
    console.error(
      "❌  No trail systems found." +
        (slugFilter ? ` Check the slug: "${slugFilter}"` : "")
    );
    process.exit(1);
  }

  if (limit && systems.length > limit) {
    systems = systems.slice(0, limit);
  }

  console.log(`\n🔄  Processing ${systems.length} trail${systems.length !== 1 ? "s" : ""} (concurrency=${concurrency})...\n`);

  // ── Process each trail ────────────────────────────────────────────────────
  const results: FaqResult[] = new Array(systems.length);
  let processed = 0;
  let failed = 0;
  let totalFaqs = 0;
  let totalWarnings = 0;

  await withConcurrency(systems, concurrency, async (system, idx) => {
    const name = String(system.name ?? "Unknown Trail");
    const slug = String(system.slug ?? system.id ?? `trail-${idx}`);
    const id = String(system.id ?? "");
    const label = `[${idx + 1}/${systems.length}]`;

    try {
      // 1. Deterministic question selection
      const questions = selectQuestions(system);

      // 2. Build compact facts pack
      const factsPack = buildFactsPack(system, questions);
      const questionTexts = questions.map((q) => q.q);

      process.stdout.write(`  ${label} ${name}...`);

      // 3. LLM call (one call per trail)
      const rawAnswers = await gemini.generateFaqs(
        name,
        system.city as string | undefined,
        system.state as string | undefined,
        factsPack,
        questionTexts
      );

      // 4. Merge evidence from question definitions into each FAQ item
      const faqs: FaqItem[] = rawAnswers.map((ans, i) => {
        const qDef = questions[i];
        return {
          q: ans.q,
          a: ans.a,
          evidence: qDef?.evidence ?? [],
          confidence: ans.confidence,
        };
      });

      // 5. Post-generation hallucination check
      const warnings = validateFaqs(faqs, factsPack);

      const result: FaqResult = {
        trail: {
          id,
          slug,
          name,
          city: system.city as string | undefined,
          state: system.state as string | undefined,
        },
        generatedAt: new Date().toISOString(),
        model: gemini.modelId,
        faqs,
        warnings,
      };

      // 6. Write JSON (no DB write)
      writeTrailFaq(result);
      results[idx] = result;

      processed++;
      totalFaqs += faqs.length;
      totalWarnings += warnings.length;

      const wStr = warnings.length > 0 ? `  ⚠️  ${warnings.length} warnings` : "";
      console.log(` ✓  ${faqs.length} FAQs${wStr}`);
    } catch (err) {
      failed++;
      processed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(` ✗  ${errMsg.slice(0, 120)}`);

      results[idx] = {
        trail: {
          id,
          slug,
          name,
          city: system.city as string | undefined,
          state: system.state as string | undefined,
        },
        generatedAt: new Date().toISOString(),
        model: gemini.modelId,
        faqs: [],
        warnings: [{ type: "generation_error", question: "N/A", detail: errMsg }],
      };
    }
  });

  // ── Write index ───────────────────────────────────────────────────────────
  const validResults = results.filter(Boolean) as FaqResult[];
  const indexPath = writeIndex(validResults);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(52));
  console.log("📊  Summary");
  console.log(`    Trails processed:  ${processed - failed}`);
  if (failed > 0) {
    console.log(`    Trails failed:     ${failed}`);
  }
  console.log(`    Total FAQs:        ${totalFaqs}`);
  console.log(`    Total warnings:    ${totalWarnings}`);
  console.log(`    Output folder:     ${getOutDir()}`);
  console.log(`    Index:             ${indexPath}`);
  console.log("─".repeat(52));
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
