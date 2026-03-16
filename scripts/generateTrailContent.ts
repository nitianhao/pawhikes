#!/usr/bin/env npx tsx
/**
 * BarkTrails — Offline trail content generation pipeline using Vertex AI (Gemini).
 *
 * For every trailSystem in InstantDB, generates:
 *   • Section-matched SEO copy (11 sections × 2 variants)
 *   • 6–10 FAQs derived from the same structured data
 *
 * All output goes to local files. No DB writes, no schema changes, no UI changes.
 *
 * Usage:
 *   npm run gen:content                          # all trails (lengthMilesTotal > 1)
 *   npm run gen:content -- --limit 5            # first 5
 *   npm run gen:content -- --slug mueller-trail # single trail
 *   npx tsx scripts/generateTrailContent.ts --limit 5 --concurrency 2
 *
 * Output:
 *   out/content/{slug}--{id}.json   (per trail)
 *   out/content/index.md            (skim view)
 *
 * Required env vars (in .env.local or shell):
 *   GOOGLE_CLOUD_PROJECT   — GCP project with Vertex AI enabled
 *   INSTANT_APP_ID         — InstantDB app id
 *   INSTANT_ADMIN_TOKEN    — InstantDB admin token
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

import { createContentGeminiClient } from "./lib/geminiVertex.js";
import { buildContentFactsPack, getSectionEvidence, SECTION_EVIDENCE } from "./lib/factsBuilder.js";
import { selectQuestions } from "./lib/faqRules.js";
import { validateContent } from "./lib/validateGenerated.js";
import {
  ensureOutDir,
  writeTrailContent,
  writeContentIndex,
  getOutDir,
  type ContentResult,
  type SectionOutput,
  type FaqOutput,
} from "./lib/writeOutputs.js";

import type { SectionKey } from "./lib/geminiVertex.js";

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
  city?: string;
  concurrency: number;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  let limit: number | undefined;
  let slug: string | undefined;
  let city: string | undefined;
  let concurrency = 3;

  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--limit" || argv[i] === "-l") && argv[i + 1]) {
      limit = parseInt(argv[++i], 10);
    } else if (argv[i] === "--slug" && argv[i + 1]) {
      slug = argv[++i];
    } else if (argv[i] === "--city" && argv[i + 1]) {
      city = argv[++i];
    } else if (argv[i] === "--concurrency" && argv[i + 1]) {
      concurrency = Math.max(1, Math.min(10, parseInt(argv[++i], 10)));
    }
  }
  return { limit, slug, city, concurrency };
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
  const { limit, slug: slugFilter, city: cityFilter, concurrency } = parseArgs();

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

  // createContentGeminiClient() throws with a friendly message if GOOGLE_CLOUD_PROJECT is missing
  const gemini = createContentGeminiClient();

  // ── Setup output ──────────────────────────────────────────────────────────
  ensureOutDir();

  console.log("🐾  BarkTrails Content Generator");
  console.log(`    Model:       ${gemini.modelId}`);
  console.log(`    Concurrency: ${concurrency}`);
  console.log(`    Output:      ${getOutDir()}`);
  if (slugFilter) console.log(`    Filter:      slug=${slugFilter}`);
  if (cityFilter) console.log(`    Filter:      city=${cityFilter}`);
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

  // Only process trails with a meaningful length (same filter as FAQ pipeline)
  if (!slugFilter) {
    const before = systems.length;
    systems = systems.filter(
      (s) => typeof s.lengthMilesTotal === "number" && s.lengthMilesTotal > 1
    );
    if (cityFilter) {
      systems = systems.filter(
        (s) => (s.city as string | undefined)?.toLowerCase() === cityFilter.toLowerCase()
      );
    }
    console.log(
      ` done (${systems.length} of ${before} have lengthMilesTotal > 1 mi${cityFilter ? ` in ${cityFilter}` : ""})`
    );
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

  console.log(
    `\n🔄  Processing ${systems.length} trail${systems.length !== 1 ? "s" : ""} (concurrency=${concurrency})...\n`
  );

  // ── Process each trail ────────────────────────────────────────────────────
  const results: ContentResult[] = new Array(systems.length);
  let processed = 0;
  let failed = 0;
  let totalWarnings = 0;

  const sectionKeys = Object.keys(SECTION_EVIDENCE) as SectionKey[];

  await withConcurrency(systems, concurrency, async (system, idx) => {
    const name = String(system.name ?? "Unknown Trail");
    const slug = String(system.slug ?? system.id ?? `trail-${idx}`);
    const id = String(system.id ?? "");
    const city = system.city as string | undefined;
    const state = system.state as string | undefined;
    const label = `[${idx + 1}/${systems.length}]`;

    try {
      // 1. Build comprehensive facts pack
      const factsPack = buildContentFactsPack(system);

      // 2. Deterministic FAQ question selection (reuse existing faqRules)
      const questionDefs = selectQuestions(system);
      const faqQuestions = questionDefs.map((q) => q.q);

      process.stdout.write(`  ${label} ${name}...`);

      // 3. Single Gemini call — all sections + FAQs
      const raw = await gemini.generateContent(
        name,
        city,
        state,
        factsPack,
        faqQuestions
      );

      // 4. Post-process: attach evidence + section-level warnings
      const allValidationWarnings = validateContent(
        raw.sections,
        raw.faqs,
        factsPack,
        city
      );

      // Group warnings by location
      const warnsByLocation = new Map<string, typeof allValidationWarnings>();
      for (const w of allValidationWarnings) {
        const list = warnsByLocation.get(w.location) ?? [];
        list.push(w);
        warnsByLocation.set(w.location, list);
      }

      // Build typed sections with evidence + per-section warnings
      const sections = {} as Record<SectionKey, SectionOutput>;
      for (const key of sectionKeys) {
        const evidence = getSectionEvidence(key, factsPack);
        const aWarns = warnsByLocation.get(`${key}.a`) ?? [];
        const bWarns = warnsByLocation.get(`${key}.b`) ?? [];
        const sectionWarns = [
          ...aWarns.map((w) => ({ location: `${key}.a`, type: w.type, detail: w.detail })),
          ...bWarns.map((w) => ({ location: `${key}.b`, type: w.type, detail: w.detail })),
        ];
        sections[key] = {
          a: raw.sections[key]?.a ?? "Unknown based on available data.",
          b: raw.sections[key]?.b ?? "Unknown based on available data.",
          evidence,
          warnings: sectionWarns,
        };
      }

      // Build FAQs with evidence + per-FAQ warnings
      const faqs: FaqOutput[] = raw.faqs.map((faqRaw, i) => {
        const qDef = questionDefs[i];
        const faqWarns = warnsByLocation.get(`faqs[${i}]`) ?? [];
        return {
          q: faqRaw.q,
          a: faqRaw.a,
          evidence: qDef?.evidence ?? [],
          confidence: faqRaw.confidence,
          warnings: faqWarns.map((w) => ({
            location: `faqs[${i}]`,
            type: w.type,
            detail: w.detail,
          })),
        };
      });

      // Global warnings (SEO keyphrase, dog-friendly overuse, etc.)
      const globalWarnLocations = ["global[a-variants]"];
      const globalWarnings: string[] = [];
      for (const loc of globalWarnLocations) {
        for (const w of warnsByLocation.get(loc) ?? []) {
          globalWarnings.push(`[${w.type}] ${w.detail}`);
        }
      }

      const result: ContentResult = {
        trail: { id, slug, name, city, state },
        generatedAt: new Date().toISOString(),
        model: gemini.modelId,
        sections,
        faqs,
        globalWarnings,
      };

      writeTrailContent(result);
      results[idx] = result;
      processed++;

      const wCount = allValidationWarnings.length;
      totalWarnings += wCount;
      const wStr = wCount > 0 ? `  ⚠️  ${wCount} warnings` : "";
      console.log(` ✓  ${faqs.length} FAQs${wStr}`);
    } catch (err) {
      failed++;
      processed++;
      const errMsg = err instanceof Error ? err.message : String(err);
      console.log(` ✗  ${errMsg.slice(0, 120)}`);

      // Write an empty-shell result so index doesn't miss the trail
      const emptySections = {} as Record<SectionKey, SectionOutput>;
      for (const key of sectionKeys) {
        emptySections[key] = {
          a: "Unknown based on available data.",
          b: "Unknown based on available data.",
          evidence: [],
          warnings: [],
        };
      }

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
        sections: emptySections,
        faqs: [],
        globalWarnings: [`generation_error: ${errMsg}`],
      };
    }
  });

  // ── Write index ───────────────────────────────────────────────────────────
  const validResults = results.filter(Boolean) as ContentResult[];
  const indexPath = writeContentIndex(validResults);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(52));
  console.log("📊  Summary");
  console.log(`    Trails processed:  ${processed - failed}`);
  if (failed > 0) {
    console.log(`    Trails failed:     ${failed}`);
  }
  console.log(`    Total warnings:    ${totalWarnings}`);
  console.log(`    Output folder:     ${getOutDir()}`);
  console.log(`    Index:             ${indexPath}`);
  console.log("─".repeat(52));
}

main().catch((err) => {
  console.error("\n❌  Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
