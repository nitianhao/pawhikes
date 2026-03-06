/**
 * File I/O utilities for the FAQ generation pipeline.
 *
 * Writes per-trail JSON files and a skim-able index.md.
 * All output goes to out/faqs/ relative to the project root.
 * No DB writes anywhere in this module.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve project root whether the script is run via tsx (ESM) or CJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "out", "faqs");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaqItem {
  q: string;
  a: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  notes?: string;
}

export interface FaqWarning {
  type: string;
  question: string;
  detail: string;
}

export interface FaqResult {
  trail: {
    id: string;
    slug: string;
    name: string;
    city?: string;
    state?: string;
  };
  generatedAt: string;
  model: string;
  faqs: FaqItem[];
  warnings: FaqWarning[];
}

// ─── Directory helpers ────────────────────────────────────────────────────────

export function ensureOutDir(): void {
  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }
}

export function getOutDir(): string {
  return OUT_DIR;
}

// ─── Per-trail writer ─────────────────────────────────────────────────────────

/** Write one trail's FAQ result to out/faqs/{slug}--{id}.json. Returns the file path. */
export function writeTrailFaq(result: FaqResult): string {
  const filename = `${result.trail.slug}--${result.trail.id}.json`;
  const filePath = join(OUT_DIR, filename);
  writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");
  return filePath;
}

// ─── Index writer ─────────────────────────────────────────────────────────────

/** Write out/faqs/index.md with a quick-skim view of all generated FAQs. */
export function writeIndex(results: FaqResult[]): string {
  const filePath = join(OUT_DIR, "index.md");
  const totalFaqs = results.reduce((s, r) => s + r.faqs.length, 0);
  const totalWarnings = results.reduce((s, r) => s + r.warnings.length, 0);

  const lines: string[] = [
    "# BarkTrails — Generated FAQ Index",
    "",
    `> Generated: ${new Date().toISOString()}`,
    `>`,
    `> Trails: **${results.length}** · FAQs: **${totalFaqs}** · Warnings: **${totalWarnings}**`,
    "",
    "---",
    "",
  ];

  for (const result of results) {
    const { trail, faqs, warnings, model } = result;
    const location = [trail.city, trail.state].filter(Boolean).join(", ") || "—";
    const filename = `${trail.slug}--${trail.id}.json`;
    const wBadge =
      warnings.length > 0
        ? ` · ⚠️ ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`
        : "";

    lines.push(`## [${trail.name}](./${filename})`);
    lines.push(
      `*${location} · ${faqs.length} FAQs · model: \`${model}\`${wBadge}*`
    );
    lines.push("");

    if (faqs.length === 0) {
      lines.push("*(no FAQs generated — see warnings)*");
    } else {
      for (const faq of faqs) {
        const icon =
          faq.confidence === "high"
            ? "🟢"
            : faq.confidence === "medium"
            ? "🟡"
            : "🔴";
        lines.push(`- ${icon} **${faq.q}**`);
        // Indent the answer as a blockquote continuation
        const answer = faq.a.replace(/\n/g, " ").trim();
        lines.push(`  > ${answer}`);
        if (faq.notes) {
          lines.push(`  > *Note: ${faq.notes}*`);
        }
      }
    }

    if (warnings.length > 0) {
      lines.push("");
      lines.push("**⚠️ Warnings:**");
      for (const w of warnings) {
        lines.push(`- \`${w.type}\` — ${w.detail}`);
      }
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}
