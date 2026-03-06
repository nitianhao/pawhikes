/**
 * Post-generation hallucination + quality guard for trail content output.
 *
 * Checks:
 *  1. Numbers in section/FAQ text not present in the facts pack (possible invention)
 *  2. Prohibited words (superlatives, absolute claims) not backed by a source URL
 *  3. Amenity phrases mentioned but not in amenitiesCounts
 *  4. "dog-friendly" repeated more than 2× across all "a" variants
 *  5. The SEO keyphrase "dog-friendly trail in <city>" not appearing exactly once in "a" variants
 *  6. Word-count violations per section
 *
 * No text is modified — warnings are review signals only.
 */

import type { SectionKey } from "./geminiVertex.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContentWarning {
  location: string;   // e.g. "intro.a", "faqs[2]"
  type:
    | "number_not_in_facts"
    | "prohibited_word"
    | "unknown_amenity"
    | "dog_friendly_overuse"
    | "seo_keyphrase_missing"
    | "seo_keyphrase_duplicate"
    | "word_count_violation";
  detail: string;
}

export interface SectionForValidation {
  a: string;
  b: string;
}

export interface FaqForValidation {
  q: string;
  a: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const PROHIBITED_WORDS = [
  "best", "top", "perfect", "ideal", "premier", "ultimate",
  "guaranteed", "official", "certainly", "definitely",
  "always", "never", "prohibited",
  "100%", "required by law",
];

const AMENITY_PHRASE_MAP: Record<string, string[]> = {
  toilets:        ["restroom", "bathroom", "toilet", "porta-potty", "portable toilet"],
  drinking_water: ["drinking water", "water fountain", "water station", "water refill", "hydration station"],
  waste_basket:   ["trash can", "waste bin", "trash bin", "garbage can", "rubbish bin"],
  dog_waste:      ["dog bag", "dog waste bag", "poop bag", "dog poop station"],
  picnic_table:   ["picnic table", "picnic area"],
  bench:          ["bench", "seating area"],
  shelter:        ["shelter", "covered area", "pavilion"],
  information:    ["information board", "info kiosk", "trail map"],
};

/** Minimum numeric value checked (avoids false-positives on "1", "2"). */
const MIN_FLAG_NUMBER = 3;

/** Word count limits per section [min, max]. */
const WORD_COUNT_LIMITS: Record<SectionKey, [number, number]> = {
  intro:               [60,  160],
  atAGlance:           [80,  220],
  trailheadsAccess:    [80,  220],
  difficultyElevation: [60,  200],
  crowd:               [65,  180],
  surfacePaws:         [75,  200],
  shadeHeat:           [65,  180],
  water:               [65,  180],
  mudConditions:       [65,  170],
  safetyServices:      [80,  220],
  amenities:           [65,  180],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function extractNumbers(text: string): string[] {
  // First normalize comma-formatted numbers (e.g. "16,496" → "16496")
  // so we can check them as a unit against the facts pack.
  const normalized = text.replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (match) =>
    match.replace(/,/g, "")
  );
  return [...normalized.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((m) => m[1]);
}

function normalizeFactsNumbers(factsJson: string): Set<string> {
  const normalized = factsJson.replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (match) =>
    match.replace(/,/g, "")
  );
  return new Set<string>(
    [...normalized.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((m) => m[1])
  );
}

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateContent(
  sections: Record<SectionKey, SectionForValidation>,
  faqs: FaqForValidation[],
  factsPack: Record<string, unknown>,
  city: string | undefined
): ContentWarning[] {
  const warnings: ContentWarning[] = [];

  // Serialize facts to string for membership checks
  const factsJson = JSON.stringify(factsPack);
  const factsNumbers = normalizeFactsNumbers(factsJson);

  // Collect known amenity kinds
  const knownAmenityKinds = new Set<string>();
  const amenityCounts = factsPack.amenitiesCounts as Record<string, number> | undefined;
  if (amenityCounts && typeof amenityCounts === "object") {
    for (const k of Object.keys(amenityCounts)) {
      knownAmenityKinds.add(k.toLowerCase());
    }
  }

  const hasSourceUrl =
    typeof factsPack.policySourceUrl === "string" &&
    factsPack.policySourceUrl.length > 0;

  const sectionKeys = Object.keys(sections) as SectionKey[];

  // ── Per-section checks ───────────────────────────────────────────────────

  for (const key of sectionKeys) {
    const section = sections[key];
    for (const variant of ["a", "b"] as const) {
      const text: string = section[variant];
      const location = `${key}.${variant}`;
      const lower = text.toLowerCase();

      // 1. Numbers not in facts
      for (const num of extractNumbers(text)) {
        if (parseFloat(num) < MIN_FLAG_NUMBER) continue;
        if (!factsNumbers.has(num)) {
          warnings.push({
            location,
            type: "number_not_in_facts",
            detail: `Number "${num}" not found in facts pack — possible hallucination.`,
          });
        }
      }

      // 2. Prohibited words
      if (!hasSourceUrl) {
        for (const word of PROHIBITED_WORDS) {
          if (lower.includes(word)) {
            warnings.push({
              location,
              type: "prohibited_word",
              detail: `Prohibited word/phrase "${word}" used without a backing source URL.`,
            });
            break; // one warning per text block
          }
        }
      }

      // 3. Amenity mentions without data
      if (amenityCounts) {
        for (const [kind, phrases] of Object.entries(AMENITY_PHRASE_MAP)) {
          if (!phrases.some((p) => lower.includes(p))) continue;
          const covered =
            knownAmenityKinds.has(kind) ||
            [...knownAmenityKinds].some(
              (k) =>
                k.includes(kind.split("_")[0]) ||
                kind.includes(k.split("_")[0])
            );
          if (!covered) {
            warnings.push({
              location,
              type: "unknown_amenity",
              detail: `Mentions "${kind.replace("_", " ")}" but that kind is absent from amenitiesCounts.`,
            });
          }
        }
      }

      // 4 & 5. "dog-friendly" / SEO keyphrase — done globally below (variant "a" only)

      // 6. Word count
      const limits = WORD_COUNT_LIMITS[key];
      if (limits) {
        const wc = wordCount(text);
        const [min, max] = limits;
        if (wc < min || wc > max) {
          warnings.push({
            location,
            type: "word_count_violation",
            detail: `Word count ${wc} is outside target range [${min}–${max}].`,
          });
        }
      }
    }
  }

  // ── Global "a"-variant checks ─────────────────────────────────────────────

  const allAText = sectionKeys
    .map((k) => sections[k].a)
    .join(" ");
  const allALower = allAText.toLowerCase();

  // 4. dog-friendly count
  const dfMatches = [...allALower.matchAll(/dog[-\s]friendly/g)];
  if (dfMatches.length > 2) {
    warnings.push({
      location: "global[a-variants]",
      type: "dog_friendly_overuse",
      detail: `"dog-friendly" appears ${dfMatches.length}× across all "a" variants (max 2).`,
    });
  }

  // 5. SEO keyphrase exactly once
  if (city) {
    const phrase = `dog-friendly trail in ${city.toLowerCase()}`;
    const phraseMatches = [...allALower.matchAll(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))];
    if (phraseMatches.length === 0) {
      warnings.push({
        location: "global[a-variants]",
        type: "seo_keyphrase_missing",
        detail: `SEO keyphrase "dog-friendly trail in ${city}" is absent from all "a" variants.`,
      });
    } else if (phraseMatches.length > 1) {
      warnings.push({
        location: "global[a-variants]",
        type: "seo_keyphrase_duplicate",
        detail: `SEO keyphrase "dog-friendly trail in ${city}" appears ${phraseMatches.length}× — should appear exactly once.`,
      });
    }
  }

  // ── FAQ checks ───────────────────────────────────────────────────────────

  faqs.forEach((faq, idx) => {
    const location = `faqs[${idx}]`;
    const lower = faq.a.toLowerCase();

    // Numbers
    for (const num of extractNumbers(faq.a)) {
      if (parseFloat(num) < MIN_FLAG_NUMBER) continue;
      if (!factsNumbers.has(num)) {
        warnings.push({
          location,
          type: "number_not_in_facts",
          detail: `Number "${num}" not found in facts pack — possible hallucination.`,
        });
      }
    }

    // Prohibited words
    if (!hasSourceUrl) {
      for (const word of PROHIBITED_WORDS) {
        if (lower.includes(word)) {
          warnings.push({
            location,
            type: "prohibited_word",
            detail: `Prohibited word/phrase "${word}" used without a backing source URL.`,
          });
          break;
        }
      }
    }

    // Amenity mentions
    if (amenityCounts) {
      for (const [kind, phrases] of Object.entries(AMENITY_PHRASE_MAP)) {
        if (!phrases.some((p) => lower.includes(p))) continue;
        const covered =
          knownAmenityKinds.has(kind) ||
          [...knownAmenityKinds].some(
            (k) =>
              k.includes(kind.split("_")[0]) ||
              kind.includes(k.split("_")[0])
          );
        if (!covered) {
          warnings.push({
            location,
            type: "unknown_amenity",
            detail: `FAQ mentions "${kind.replace("_", " ")}" but that kind is absent from amenitiesCounts.`,
          });
        }
      }
    }
  });

  return warnings;
}
