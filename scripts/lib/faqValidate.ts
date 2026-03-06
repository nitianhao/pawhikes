/**
 * Post-generation hallucination guard for FAQ answers.
 *
 * Scans each answer for:
 *  - Numbers not present in the facts pack (potential invention)
 *  - Strong absolute claim words without a supporting source URL
 *  - Amenity mentions not present in amenitiesCounts
 *
 * All flags go into the "warnings" array on the trail JSON output.
 * No answer is modified — these are review signals only.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationWarning {
  type: "number_not_in_facts" | "strong_claim" | "unknown_amenity";
  question: string;
  detail: string;
}

export interface FaqItemForValidation {
  q: string;
  a: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

/** Words that imply absolute certainty — flag unless policySourceUrl is present. */
const STRONG_CLAIM_WORDS = [
  "always",
  "guaranteed",
  "official",
  "certainly",
  "definitely",
  "never",
  "prohibited",
  "100%",
  "required by law",
];

/**
 * Maps DB amenity kind → natural language phrases that might appear in answers.
 * If the LLM mentions a phrase but the kind is absent from amenitiesCounts, flag it.
 */
const AMENITY_PHRASE_MAP: Record<string, string[]> = {
  toilets: ["restroom", "bathroom", "toilet", "porta-potty", "portable toilet"],
  drinking_water: [
    "drinking water",
    "water fountain",
    "water station",
    "water refill",
    "hydration station",
  ],
  waste_basket: ["trash can", "waste bin", "trash bin", "garbage can", "rubbish bin"],
  dog_waste: ["dog bag", "dog waste bag", "poop bag", "dog poop station"],
  picnic_table: ["picnic table", "picnic area"],
  bench: ["bench", "seating area"],
  shelter: ["shelter", "covered area", "pavilion"],
  information: ["information board", "info kiosk", "trail map"],
};

// Minimum numeric value to bother checking (avoids false-positives on "1", "2", etc.)
const MIN_FLAG_NUMBER = 3;

// ─── Main validator ───────────────────────────────────────────────────────────

export function validateFaqs(
  faqs: FaqItemForValidation[],
  factsPack: Record<string, unknown>
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];

  // Serialize facts to a string for membership checks
  const factsJson = JSON.stringify(factsPack);

  // Extract all numeric strings present in the facts pack
  const factsNumbers = new Set<string>(
    [...factsJson.matchAll(/\b(\d+(?:\.\d+)?)\b/g)].map((m) => m[1])
  );

  // Collect known amenity kinds from amenitiesCounts
  const knownAmenityKinds = new Set<string>();
  const amenityCounts = factsPack.amenitiesCounts as
    | Record<string, number>
    | undefined;
  if (amenityCounts && typeof amenityCounts === "object") {
    for (const k of Object.keys(amenityCounts)) {
      knownAmenityKinds.add(k.toLowerCase());
    }
  }

  const hasSourceUrl =
    typeof factsPack.policySourceUrl === "string" &&
    factsPack.policySourceUrl.length > 0;

  for (const faq of faqs) {
    const answerLower = faq.a.toLowerCase();

    // ── 1. Numbers not in facts pack ─────────────────────────────────────────
    const answerNumbers = [
      ...faq.a.matchAll(/\b(\d+(?:\.\d+)?)\b/g),
    ].map((m) => m[1]);

    for (const num of answerNumbers) {
      const numValue = parseFloat(num);
      if (numValue < MIN_FLAG_NUMBER) continue; // skip trivially small numbers
      if (!factsNumbers.has(num)) {
        warnings.push({
          type: "number_not_in_facts",
          question: faq.q,
          detail: `Number "${num}" appears in answer but was not found in the facts pack — possible hallucination.`,
        });
      }
    }

    // ── 2. Strong absolute claims ─────────────────────────────────────────────
    if (!hasSourceUrl) {
      for (const word of STRONG_CLAIM_WORDS) {
        if (answerLower.includes(word)) {
          warnings.push({
            type: "strong_claim",
            question: faq.q,
            detail: `Absolute claim word "${word}" used but no policySourceUrl is present to back it up.`,
          });
          break; // one warning per answer per pass
        }
      }
    }

    // ── 3. Amenity mentions not backed by data ────────────────────────────────
    // Only run this check when amenitiesCounts actually exists in the pack;
    // if it's absent entirely we can't make a meaningful negative claim.
    if (amenityCounts) {
      for (const [kind, phrases] of Object.entries(AMENITY_PHRASE_MAP)) {
        const mentioned = phrases.some((p) => answerLower.includes(p));
        if (!mentioned) continue;

        // Allow if the kind or a close variant is in knownAmenityKinds
        const covered =
          knownAmenityKinds.has(kind) ||
          [...knownAmenityKinds].some(
            (k) => k.includes(kind.split("_")[0]) || kind.includes(k.split("_")[0])
          );

        if (!covered) {
          warnings.push({
            type: "unknown_amenity",
            question: faq.q,
            detail: `Answer mentions "${kind.replace("_", " ")}" but that amenity kind is absent from amenitiesCounts.`,
          });
        }
      }
    }
  }

  return warnings;
}
