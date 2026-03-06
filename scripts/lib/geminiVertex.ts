/**
 * Vertex AI Gemini wrapper for BarkTrails FAQ generation.
 *
 * Authenticates via Application Default Credentials (ADC).
 * Reads GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GEMINI_MODEL from env.
 */

import { VertexAI } from "@google-cloud/vertexai";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaqAnswerRaw {
  q: string;
  a: string;
  confidence: "high" | "medium" | "low";
}

export interface GeminiClient {
  modelId: string;
  generateFaqs: (
    trailName: string,
    city: string | undefined,
    state: string | undefined,
    factsPack: Record<string, unknown>,
    questions: string[]
  ) => Promise<FaqAnswerRaw[]>;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /429|503|5[0-9][0-9]|RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL|quota/i.test(msg);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Client factory ───────────────────────────────────────────────────────────

export function createGeminiClient(): GeminiClient {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    throw new Error(
      "Missing GOOGLE_CLOUD_PROJECT.\n" +
        "Add it to .env.local or export it in your shell.\n" +
        "See scripts/README-faqs.md for setup instructions."
    );
  }

  const location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
  // Prefer gemini-2.0-flash-lite as the stable default; override via env
  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-lite";

  const vertex = new VertexAI({ project, location });
  const model = vertex.getGenerativeModel({
    model: modelId,
    generationConfig: {
      temperature: 0.1,       // low temperature = factual, consistent
      maxOutputTokens: 2048,
    },
  });

  async function generateFaqs(
    trailName: string,
    city: string | undefined,
    state: string | undefined,
    factsPack: Record<string, unknown>,
    questions: string[]
  ): Promise<FaqAnswerRaw[]> {
    if (questions.length === 0) return [];

    const prompt = buildPrompt(trailName, city, state, factsPack, questions);
    let lastErr: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay =
          RETRY_BASE_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(
          `    [Gemini retry ${attempt}/${MAX_RETRIES} in ${Math.round(delay)}ms]`
        );
        await sleep(delay);
      }

      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const text =
          result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return parseAnswers(text, questions);
      } catch (err) {
        lastErr = err;
        if (!isRetryableError(err) || attempt === MAX_RETRIES) throw err;
      }
    }

    throw lastErr;
  }

  return { modelId, generateFaqs };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildPrompt(
  trailName: string,
  city: string | undefined,
  state: string | undefined,
  factsPack: Record<string, unknown>,
  questions: string[]
): string {
  const location =
    [city, state].filter(Boolean).join(", ") || "unknown location";
  const packedJson = JSON.stringify(factsPack, null, 2);
  const qs = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");

  return `You are a trail information assistant writing FAQ answers for a dog-friendly trail directory.

Trail: "${trailName}" in ${location}

Facts pack (ALL available structured data for this trail — do NOT use any other data):
${packedJson}

Questions to answer:
${qs}

STRICT RULES:
1. Answer ONLY using facts from the facts pack above. Never invent or assume facts.
2. If a fact is missing or clearly unknown, answer exactly: "Unknown based on available data."
3. Keep each answer concise: 1–3 sentences maximum.
4. Include units where relevant (miles, feet, meters, %, °F).
5. Assign confidence per answer:
   - "high" = the primary field for this question is present and clear
   - "medium" = only proxy or indirect fields present
   - "low" = minimal or no relevant data available
6. Return ONLY a valid JSON array. No markdown, no code fences, no explanation.

Required output format — one object per question, in the SAME ORDER as the questions above:
[
  { "q": "<exact question text>", "a": "<answer>", "confidence": "high|medium|low" },
  ...
]`;
}

// ─── Content generation types ─────────────────────────────────────────────────

export type SectionKey =
  | "intro"
  | "atAGlance"
  | "trailheadsAccess"
  | "difficultyElevation"
  | "crowd"
  | "surfacePaws"
  | "shadeHeat"
  | "water"
  | "mudConditions"
  | "safetyServices"
  | "amenities";

export interface SectionRaw {
  a: string;
  b: string;
}

export interface ContentFaqRaw {
  q: string;
  a: string;
  confidence: "high" | "medium" | "low";
}

export interface ContentRaw {
  sections: Record<SectionKey, SectionRaw>;
  faqs: ContentFaqRaw[];
}

export interface ContentGeminiClient {
  modelId: string;
  generateContent: (
    trailName: string,
    city: string | undefined,
    state: string | undefined,
    factsPack: Record<string, unknown>,
    faqQuestions: string[]
  ) => Promise<ContentRaw>;
}

// ─── Content client factory ───────────────────────────────────────────────────

export function createContentGeminiClient(): ContentGeminiClient {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    throw new Error(
      "Missing GOOGLE_CLOUD_PROJECT.\n" +
        "Add it to .env.local or export it in your shell.\n" +
        "See scripts/README-content.md for setup instructions."
    );
  }

  const location = process.env.GOOGLE_CLOUD_LOCATION ?? "us-central1";
  const modelId = process.env.GEMINI_MODEL ?? "gemini-2.0-flash-lite";

  // Use a separate content model env var so FAQ and content can use different models.
  // Default to gemini-2.5-flash for better instruction-following on long-form prose.
  const contentModelId =
    process.env.GEMINI_CONTENT_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

  const vertex = new VertexAI({ project, location });
  const model = vertex.getGenerativeModel({
    model: contentModelId,
    generationConfig: {
      temperature: 0.4,   // higher than FAQ (0.1) — needed for richer prose
      maxOutputTokens: 16384,
    },
  });

  async function generateContent(
    trailName: string,
    city: string | undefined,
    state: string | undefined,
    factsPack: Record<string, unknown>,
    faqQuestions: string[]
  ): Promise<ContentRaw> {
    if (faqQuestions.length === 0) {
      throw new Error("faqQuestions must not be empty");
    }

    const prompt = buildContentPrompt(trailName, city, state, factsPack, faqQuestions);
    let lastErr: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay =
          RETRY_BASE_MS * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(
          `    [Gemini content retry ${attempt}/${MAX_RETRIES} in ${Math.round(delay)}ms]`
        );
        await sleep(delay);
      }

      try {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const text =
          result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return parseContentResponse(text);
      } catch (err) {
        lastErr = err;
        if (!isRetryableError(err) || attempt === MAX_RETRIES) throw err;
      }
    }

    throw lastErr;
  }

  return { modelId: contentModelId, generateContent };
}

// ─── Content prompt builder ───────────────────────────────────────────────────

function buildContentPrompt(
  trailName: string,
  city: string | undefined,
  state: string | undefined,
  factsPack: Record<string, unknown>,
  faqQuestions: string[]
): string {
  const location =
    [city, state].filter(Boolean).join(", ") || "unknown location";
  const cityName = city ?? location;
  const packedJson = JSON.stringify(factsPack, null, 2);
  const qs = faqQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n");

  return `You are writing structured SEO content for a dog-friendly trail directory.

Trail: "${trailName}" in ${location}

Facts pack (ALL available structured data — do NOT use any other data):
${packedJson}

FAQ questions to answer (use facts pack only):
${qs}

---
WRITING STYLE (important — short responses will be rejected):
- Write flowing, natural prose — not bullet lists, not data dumps.
- Speak directly to dog owners planning a hike: practical, helpful, engaging.
- Weave numbers into sentences naturally ("the 11-mile loop…" not "lengthMilesTotal: 11").
- Each "a" variant: concise/practical. Each "b" variant: slightly more narrative/evocative.
- If a field value is a class label like "high" or "low", translate it into plain English
  (e.g. "high shade" → "well-shaded", "low mud risk" → "the trail dries out quickly after rain").
- IMPORTANT: Each section must reach its minimum word count. Write fully developed paragraphs,
  not one-sentence summaries. Add practical context, explain what the data means for dog owners,
  and give actionable advice. Longer, richer paragraphs are required.
- NEVER cite raw score values. Use only class labels (high/medium/low) and percentage fields.
  Wrong: "mud risk score of 0.12" — Right: "low mud risk"
  Wrong: "shade proxy percent 59" — Right: "about 59% of the route is shaded"
- When data for a section is sparse (e.g. only a class label), expand with practical context:
  explain WHY the condition is what it is, what it means across seasons, and what dog owners
  should do about it. A single class label should still produce a full paragraph.

SECTION REQUIREMENTS — write variant "a" (practical) and "b" (narrative) for each:

intro (80–120 words each):
  Paint a vivid, useful picture of the trail for dog owners. Mention the setting (urban,
  lakeside, wooded, etc.), trail length, dog policy, and what makes it worth visiting.
  The phrase "dog-friendly trail in ${cityName}" must appear EXACTLY ONCE across all "a"
  variants combined (any section, but once total). Do not repeat it.

atAGlance (100–180 words each):
  Cover: distance, route type (loop/out-and-back/network), surface character, dog policy,
  crowd level, shade, and amenity quality. Write it as a useful summary paragraph — not a
  list of stats. Explain what each fact means for a typical visit with a dog.
  For elevation: use ONLY elevationRangeFt (the vertical relief). DO NOT mention any
  gain/loss figures — those fields are not provided and must not be invented.

trailheadsAccess (100–180 words each):
  Describe how to get there, how many access points exist, what parking is like (capacity,
  fee likelihood), and any access hours or rules. Give practical advice for first-time visitors.

difficultyElevation (80–150 words each):
  Use elevationRangeFt (vertical relief) and gradeP50/gradeP90 (median/90th-percentile slope)
  to characterize the terrain. Do NOT invent or cite elevationGainFt/elevationLossFt values —
  those fields are not in the facts pack. Describe what the difficulty means for dogs
  (e.g. "mostly flat with some short climbs" vs "steep sections that tire smaller breeds faster").

crowd (80–140 words each):
  How busy the trail gets and when. Cover: what drives crowd levels (urban location, trail
  popularity, nearby parking), how peak-hour crowding affects dogs specifically (leash tangles,
  reactive dog stress, having to yield constantly), and at least two specific timing
  recommendations (morning before 8am, weekdays, off-season months, etc.). If crowd data is
  limited, draw on the trail's urban vs. suburban setting and typical city park patterns.

surfacePaws (90–160 words each):
  Describe the full surface mix and what each type means for dog paws. Cover: hardness and
  traction, heat absorption on concrete/asphalt in summer (when pavement can burn paws above
  95°F air temperature), how natural or unpaved sections give softer footing, and whether the
  width is comfortable for walking side by side. Give specific paw-care advice: when to bring
  booties, how to check paws after hard surfaces, signs of pad irritation to watch for.

shadeHeat (80–140 words each):
  Translate the shade percentage into experiential terms — what percentage of the walk will
  feel exposed vs. covered. Explain how tree canopy and structure affect temperature at
  ground level (where dogs experience it). Give seasonal guidance: when morning vs. evening
  visits matter most, what temperature range makes this trail safe for dogs, and any specific
  exposed sections that are worth noting. If shade is low, advise on heat precautions.

water (80–140 words each):
  Cover: natural water sources nearby (types, whether dogs can access them), drinking-water
  infrastructure (number and distribution of fountains along the route), and practical
  hydration planning. Discuss what to bring (collapsible bowl, extra water), whether water
  access is seasonal or year-round, and any caution about water quality or currents if
  swimming access exists. If water infrastructure is sparse, be direct about that.

mudConditions (80–130 words each):
  Explain the mud risk clearly — what drives it (surface type, drainage, trail grade, nearby
  waterways). Even for low-risk trails, discuss: what conditions can still make sections
  muddy (heavy rain, shaded north-facing slopes), how quickly the trail recovers after rain
  given its dominant surface, and the best-condition months for hiking. Seasonal context
  (Austin's wet season, etc.) is helpful. If mud risk is high, give specific trail sections
  or timing to avoid.

safetyServices (100–180 words each):
  Cover all relevant safety factors with direct, practical language: hazard count and types
  (road crossings, water crossings — are they controlled or uncontrolled?), nearest vet name
  and distance, cell coverage class, night suitability, winter conditions, and bailout/exit
  options. Explain what each risk means practically (e.g. "88 road crossings means frequent
  stops — keep your dog close at each one"). If safety data is sparse, note what's unknown.

amenities (80–140 words each):
  Describe all facilities present and what they mean for a dog visit. Cover: restrooms,
  benches and rest spots, shelters, waste bins, dog waste bag stations, drinking water
  fountains (critical for dogs), picnic tables, and information boards. Discuss distribution
  — are amenities clustered at trailheads or spread along the route? If amenities are sparse
  or absent, be direct: advise what to bring (waste bags, water, snacks) and where the
  nearest off-trail facilities are if known. Don't pad with vague praise — be specific.

---
GLOBAL RULES (critical — violations will be flagged):
1. Numbers: every number cited must appear in the facts pack. No invented stats.
2. Missing data: if a key field is absent, acknowledge it briefly — never guess or fabricate.
3. No superlatives: no "best", "top", "perfect", "ideal", "premier".
4. No absolute claims: no "always", "guaranteed", "official", "required by law", "certainly".
5. "dog-friendly" must appear NO MORE THAN 2 times total across all "a" variants combined.
6. The exact phrase "dog-friendly trail in ${cityName}" must appear EXACTLY ONCE across all "a" variants.
7. Do NOT cite elevationGainFt or elevationLossFt — those fields are excluded. Use elevationRangeFt only.
8. FAQs: same factual rules — 2–4 sentence answers; confidence "high"/"medium"/"low".

---
Return ONLY valid JSON. No markdown fences, no explanation, no preamble.
Exact output schema:
{
  "sections": {
    "intro":               { "a": "...", "b": "..." },
    "atAGlance":           { "a": "...", "b": "..." },
    "trailheadsAccess":    { "a": "...", "b": "..." },
    "difficultyElevation": { "a": "...", "b": "..." },
    "crowd":               { "a": "...", "b": "..." },
    "surfacePaws":         { "a": "...", "b": "..." },
    "shadeHeat":           { "a": "...", "b": "..." },
    "water":               { "a": "...", "b": "..." },
    "mudConditions":       { "a": "...", "b": "..." },
    "safetyServices":      { "a": "...", "b": "..." },
    "amenities":           { "a": "...", "b": "..." }
  },
  "faqs": [
    { "q": "<exact question text>", "a": "<answer>", "confidence": "high|medium|low" }
  ]
}`;
}

// ─── Content response parser ──────────────────────────────────────────────────

const SECTION_KEYS: SectionKey[] = [
  "intro", "atAGlance", "trailheadsAccess", "difficultyElevation",
  "crowd", "surfacePaws", "shadeHeat", "water",
  "mudConditions", "safetyServices", "amenities",
];

function parseContentResponse(text: string): ContentRaw {
  // Strip markdown code fences
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(
        `Cannot parse Gemini content response as JSON.\nRaw (first 600 chars):\n${cleaned.slice(0, 600)}`
      );
    }
    parsed = JSON.parse(match[0]);
  }

  const raw = (parsed ?? {}) as Record<string, unknown>;
  const rawSections = (raw.sections ?? {}) as Record<string, unknown>;
  const rawFaqs = Array.isArray(raw.faqs) ? raw.faqs : [];

  const FALLBACK_SECTION: SectionRaw = {
    a: "Unknown based on available data.",
    b: "Unknown based on available data.",
  };

  const sections = {} as Record<SectionKey, SectionRaw>;
  for (const key of SECTION_KEYS) {
    const s = (rawSections[key] ?? {}) as Record<string, unknown>;
    sections[key] = {
      a: typeof s.a === "string" && s.a.trim() ? s.a.trim() : FALLBACK_SECTION.a,
      b: typeof s.b === "string" && s.b.trim() ? s.b.trim() : FALLBACK_SECTION.b,
    };
  }

  const faqs: ContentFaqRaw[] = rawFaqs.map((item: unknown): ContentFaqRaw => {
    const f = (item ?? {}) as Record<string, unknown>;
    return {
      q: typeof f.q === "string" ? f.q : "Unknown question",
      a: typeof f.a === "string" && f.a.trim() ? f.a.trim() : "Unknown based on available data.",
      confidence: (["high", "medium", "low"] as const).includes(
        f.confidence as "high" | "medium" | "low"
      )
        ? (f.confidence as "high" | "medium" | "low")
        : "low",
    };
  });

  return { sections, faqs };
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseAnswers(text: string, questions: string[]): FaqAnswerRaw[] {
  // Strip markdown code fences if the model wrapped the JSON
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to locate a JSON array inside the text
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error(
        `Cannot parse Gemini response as JSON.\nRaw (first 400 chars):\n${cleaned.slice(0, 400)}`
      );
    }
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array from Gemini, got: ${typeof parsed}`);
  }

  return parsed.map((item: unknown, idx): FaqAnswerRaw => {
    const raw = (item ?? {}) as Record<string, unknown>;
    return {
      q:
        typeof raw.q === "string"
          ? raw.q
          : (questions[idx] ?? `Question ${idx + 1}`),
      a:
        typeof raw.a === "string"
          ? raw.a
          : "Unknown based on available data.",
      confidence: (["high", "medium", "low"] as const).includes(
        raw.confidence as "high" | "medium" | "low"
      )
        ? (raw.confidence as "high" | "medium" | "low")
        : "low",
    };
  });
}
