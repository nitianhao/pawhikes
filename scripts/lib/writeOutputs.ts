/**
 * File I/O utilities for the trail content generation pipeline.
 *
 * Writes per-trail JSON files to out/content/ and a skim-able index.md.
 * No DB writes anywhere in this module.
 */

import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import type { SectionKey } from "./geminiVertex.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "../..");
const OUT_DIR = join(ROOT, "out", "content");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentWarningOutput {
  location: string;
  type: string;
  detail: string;
}

export interface SectionOutput {
  a: string;
  b: string;
  evidence: string[];
  warnings: ContentWarningOutput[];
}

export interface FaqOutput {
  q: string;
  a: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  warnings: ContentWarningOutput[];
}

export interface ContentResult {
  trail: {
    id: string;
    slug: string;
    name: string;
    city?: string;
    state?: string;
  };
  generatedAt: string;
  model: string;
  sections: Record<SectionKey, SectionOutput>;
  faqs: FaqOutput[];
  globalWarnings: string[];
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

/** Write one trail's content result to out/content/{slug}--{id}.json. Returns the path. */
export function writeTrailContent(result: ContentResult): string {
  const filename = `${result.trail.slug}--${result.trail.id}.json`;
  const filePath = join(OUT_DIR, filename);
  writeFileSync(filePath, JSON.stringify(result, null, 2), "utf-8");
  return filePath;
}

// ─── Index writer ─────────────────────────────────────────────────────────────

/** Write out/content/index.md with a skim-view of all generated content. */
export function writeContentIndex(results: ContentResult[]): string {
  const filePath = join(OUT_DIR, "index.md");

  const totalWarnings = results.reduce(
    (s, r) =>
      s +
      r.globalWarnings.length +
      Object.values(r.sections).reduce(
        (ss, sec) => ss + sec.warnings.length,
        0
      ) +
      r.faqs.reduce((ss, f) => ss + f.warnings.length, 0),
    0
  );

  const lines: string[] = [
    "# BarkTrails — Generated Content Index",
    "",
    `> Generated: ${new Date().toISOString()}`,
    `>`,
    `> Trails: **${results.length}** · Warnings: **${totalWarnings}**`,
    "",
    "---",
    "",
  ];

  for (const result of results) {
    const { trail, sections, faqs, model } = result;
    const location =
      [trail.city, trail.state].filter(Boolean).join(", ") || "—";
    const filename = `${trail.slug}--${trail.id}.json`;

    const warnCount =
      result.globalWarnings.length +
      Object.values(sections).reduce((s, sec) => s + sec.warnings.length, 0) +
      faqs.reduce((s, f) => s + f.warnings.length, 0);

    const wBadge =
      warnCount > 0
        ? ` · ⚠️ ${warnCount} warning${warnCount !== 1 ? "s" : ""}`
        : "";

    lines.push(`## [${trail.name}](./${filename})`);
    lines.push(
      `*${location} · ${faqs.length} FAQs · model: \`${model}\`${wBadge}*`
    );
    lines.push("");

    // Show first 140 chars of intro.a
    const introA = sections.intro?.a ?? "";
    if (introA && introA !== "Unknown based on available data.") {
      const preview = introA.length > 140 ? introA.slice(0, 137) + "…" : introA;
      lines.push(`> ${preview}`);
      lines.push("");
    }

    // List section warning counts if any
    const sectionWarnings: string[] = [];
    for (const [key, sec] of Object.entries(sections)) {
      if (sec.warnings.length > 0) {
        sectionWarnings.push(`\`${key}\` (${sec.warnings.length})`);
      }
    }
    if (sectionWarnings.length > 0) {
      lines.push(`**Section warnings:** ${sectionWarnings.join(", ")}`);
    }

    if (result.globalWarnings.length > 0) {
      lines.push("**Global warnings:**");
      for (const w of result.globalWarnings) {
        lines.push(`- ${w}`);
      }
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}
