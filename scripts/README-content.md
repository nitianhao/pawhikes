# BarkTrails — Trail Content Generation Pipeline

Offline SEO copy + FAQ generation for all trail detail pages.
Reads from InstantDB, writes to `out/content/`. **No DB writes. No UI changes. No schema changes.**

---

## What it generates

For each trail system (`lengthMilesTotal > 1 mile`), one JSON file:

```
out/content/{slug}--{id}.json
```

Containing:
- **11 sections** × **2 copy variants** (a = concise/practical, b = slightly narrative):
  `intro` · `atAGlance` · `trailheadsAccess` · `difficultyElevation` · `crowd`
  `surfacePaws` · `shadeHeat` · `water` · `mudConditions` · `safetyServices` · `amenities`
- **6–10 FAQs** with confidence level
- Per-section and per-FAQ **evidence fields** (which DB fields backed each section)
- **Warnings** (hallucination flags, word-count violations, SEO rule violations)

Plus a skim-able index:

```
out/content/index.md
```

---

## Required environment variables

Add to `.env.local` (or export in your shell):

```bash
# InstantDB (already present from other scripts)
INSTANT_APP_ID=<your InstantDB app id>
INSTANT_ADMIN_TOKEN=<your InstantDB admin token>

# Google Cloud / Vertex AI
GOOGLE_CLOUD_PROJECT=<your GCP project id with Vertex AI enabled>
```

### Optional

```bash
GOOGLE_CLOUD_LOCATION=us-central1   # default: us-central1
GEMINI_MODEL=gemini-2.0-flash-lite  # default: gemini-2.0-flash-lite
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json  # if not using gcloud ADC
```

---

## Authentication

Uses Application Default Credentials (ADC). Two supported methods:

**Option A — gcloud user login (development):**
```bash
gcloud auth application-default login
```

**Option B — Service account key file:**
```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

---

## Usage

```bash
# Generate content for all trails (lengthMilesTotal > 1 mi)
npm run gen:content

# Limit to first 5 trails (for testing)
npm run gen:content -- --limit 5

# Single trail by slug
npm run gen:content -- --slug mueller-trail

# Adjust concurrency (default 3; max 10)
npm run gen:content -- --limit 10 --concurrency 2
```

---

## Output format

```jsonc
{
  "trail": { "id": "...", "slug": "...", "name": "...", "city": "...", "state": "..." },
  "generatedAt": "2026-03-05T00:00:00.000Z",
  "model": "gemini-2.0-flash-lite",
  "sections": {
    "intro": {
      "a": "Concise intro copy (40–60 words)...",
      "b": "Narrative variant intro copy...",
      "evidence": ["dogsAllowed", "leashPolicy", "lengthMilesTotal"],
      "warnings": []
    },
    // ... 10 more sections
  },
  "faqs": [
    {
      "q": "Are dogs allowed on Mueller Trail?",
      "a": "Yes, dogs are allowed...",
      "evidence": ["dogsAllowed", "leashPolicy"],
      "confidence": "high",
      "warnings": []
    }
  ],
  "globalWarnings": []
}
```

---

## Warning types

| Type | Description |
|---|---|
| `number_not_in_facts` | A number in generated text was not present in the facts pack — possible hallucination |
| `prohibited_word` | Superlative or absolute claim word without a backing source URL |
| `unknown_amenity` | Amenity mentioned in text but not present in `amenitiesCounts` |
| `dog_friendly_overuse` | "dog-friendly" used more than 2× across all "a" variants |
| `seo_keyphrase_missing` | "dog-friendly trail in {city}" absent from all "a" variants |
| `seo_keyphrase_duplicate` | "dog-friendly trail in {city}" appears more than once |
| `word_count_violation` | Section text is shorter or longer than the target range |

---

## Pipeline architecture

```
generateTrailContent.ts          main entry point
  └─ lib/factsBuilder.ts         builds compact facts pack from trailSystem
  └─ lib/faqRules.ts             deterministic FAQ question selection (shared with FAQ pipeline)
  └─ lib/geminiVertex.ts         Vertex AI client — createContentGeminiClient()
  └─ lib/validateGenerated.ts    post-generation hallucination + quality guard
  └─ lib/writeOutputs.ts         writes out/content/*.json + index.md
```

One Gemini call per trail (all 11 sections + FAQs in a single request).
Concurrency-limited with exponential backoff on 429/5xx errors.

---

## Reviewing outputs

1. Open `out/content/index.md` for a skim view with warning counts.
2. Open individual `out/content/{slug}--{id}.json` for full section copy + FAQs.
3. Warnings flag items for human review — they don't block output.

---

## Related scripts

```bash
npm run gen:faqs          # FAQ-only pipeline (separate output in out/faqs/)
npm run store:faqs        # Push FAQ output to InstantDB (opt-in)
```
