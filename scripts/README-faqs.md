# BarkTrails — FAQ Generation Pipeline

Generates 6–10 FAQ pairs per trail using **Google Vertex AI (Gemini)**,
strictly grounded in the trail's structured fields from InstantDB.

**No DB writes.** All output is local JSON for manual review before any
DB or page integration.

---

## Prerequisites

| Requirement | Details |
|---|---|
| Node.js ≥ 18 | `node --version` |
| `tsx` | Already in `devDependencies` |
| `@google-cloud/vertexai` | Already in `devDependencies` |
| Google Cloud project | With Vertex AI API enabled |
| InstantDB credentials | Already in `.env.local` |

---

## Required Environment Variables

Add these to `.env.local` (or export in your shell):

```bash
# Required
GOOGLE_CLOUD_PROJECT=your-gcp-project-id

# Optional (shown with defaults)
GOOGLE_CLOUD_LOCATION=us-central1
GEMINI_MODEL=gemini-2.0-flash-lite

# ADC: point to your service-account key (or use gcloud user credentials — see below)
GOOGLE_APPLICATION_CREDENTIALS=./credentials/vertex-gemini-key.json
```

`INSTANT_APP_ID` and `INSTANT_ADMIN_TOKEN` are already present in `.env.local`.

---

## Authentication (One-Time Setup)

### Option A — Service Account Key (recommended for scripts)

1. In the [GCP Console](https://console.cloud.google.com/iam-admin/serviceaccounts),
   create a service account with the **Vertex AI User** role.
2. Download the JSON key → save to `credentials/vertex-gemini-key.json`
   (already git-ignored via `.gitignore`).
3. Set in `.env.local`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./credentials/vertex-gemini-key.json
   ```

### Option B — Your personal gcloud credentials (quick local dev)

```bash
gcloud auth application-default login
```

This stores credentials in `~/.config/gcloud/application_default_credentials.json`.
The `@google-cloud/vertexai` SDK picks them up automatically; no env var needed.

> **Note:** User credentials are scoped to your personal account and will not
> work in CI/CD or production. Use a service account for anything automated.

### Verify access

```bash
gcloud auth application-default print-access-token
# or
gcloud ai models list --project=your-project --region=us-central1
```

---

## Running the Pipeline

```bash
# Test on 5 trails (fast, low cost)
npm run gen:faqs -- --limit 5

# Test on a single trail
npm run gen:faqs -- --slug mueller-trail

# All trails (55 for Austin; ~1–2 min at default concurrency)
npm run gen:faqs

# Lower concurrency to avoid quota limits
npm run gen:faqs -- --concurrency 2

# Combine flags
npm run gen:faqs -- --limit 10 --concurrency 2
```

---

## Output

All files land in `out/faqs/` (git-ignored).

```
out/faqs/
├── index.md                          ← quick-skim of all trails
├── mueller-trail--<id>.json
├── barton-creek-greenbelt--<id>.json
└── ...
```

### Per-trail JSON schema

```jsonc
{
  "trail": {
    "id": "...",
    "slug": "mueller-trail",
    "name": "Mueller Trail",
    "city": "Austin",
    "state": "TX"
  },
  "generatedAt": "2026-03-05T12:00:00.000Z",
  "model": "gemini-2.0-flash-lite",
  "faqs": [
    {
      "q": "Are dogs allowed on Mueller Trail?",
      "a": "Yes, dogs are allowed on Mueller Trail.",
      "evidence": ["dogsAllowed", "leashPolicy", "policySourceUrl"],
      "confidence": "high"   // high | medium | low
    }
  ],
  "warnings": [
    // Present only when the post-checker finds potential issues
    {
      "type": "number_not_in_facts",  // or "strong_claim" | "unknown_amenity" | "generation_error"
      "question": "Are dogs allowed on Mueller Trail?",
      "detail": "Number \"50\" appears in answer but not found in the facts pack."
    }
  ]
}
```

### Confidence levels

| Level | Meaning |
|---|---|
| `high` | Primary field for this question is present and unambiguous |
| `medium` | Only proxy or indirect fields available |
| `low` | Minimal or no relevant data — treat answer with caution |

### Warning types

| Type | Meaning |
|---|---|
| `number_not_in_facts` | A number in the answer wasn't found in the facts pack — possible hallucination |
| `strong_claim` | Absolute word ("always", "guaranteed") used without a supporting source URL |
| `unknown_amenity` | Amenity mentioned (e.g. "restroom") but absent from `amenitiesCounts` |
| `generation_error` | The Gemini call failed entirely; `faqs` array will be empty |

---

## Architecture

```
scripts/
├── generateTrailFaqs.ts     ← main entry (CLI + orchestration)
└── lib/
    ├── geminiVertex.ts      ← Vertex AI wrapper (ADC auth, retry, JSON parsing)
    ├── faqRules.ts          ← deterministic question selection + facts-pack builder
    ├── faqValidate.ts       ← post-generation hallucination guard
    └── io.ts                ← file writers (JSON + index.md)
```

### Question selection logic

**5 core questions** (always included, answered "Unknown" if data missing):
1. Are dogs allowed?
2. Do dogs need a leash?
3. Is there drinking water for dogs?
4. Is the trail mostly shaded or exposed?
5. What is the trail surface like for paws?

**Up to 5 conditional questions** (added only when the relevant field exists):
- Mud risk after rain (`mudRisk`)
- Crowding / best times (`crowdClass`, `crowdProxyScore`)
- Parking (`parkingCount`, `parkingCapacityEstimate`, `parkingFeeKnown`)
- Amenities overview (`amenitiesCounts`, `amenitiesIndexScore`)
- Safety notes (`hazardsClass`, `heatRisk`, `roughnessRisk`, `swimLikely`)

### Cost estimate

Each trail = **1 Gemini API call** with ≈1–2 KB input + ≈500 token output.
At 55 Austin trails ≈ 55 calls ≈ **< $0.05** with `gemini-2.0-flash-lite`.

---

## Troubleshooting

**`Missing GOOGLE_CLOUD_PROJECT`**
→ Add `GOOGLE_CLOUD_PROJECT=your-project` to `.env.local`.

**`PERMISSION_DENIED` or `403`**
→ The service account or user credential lacks the **Vertex AI User** role.
→ Run `gcloud auth application-default login` to refresh user credentials.

**`RESOURCE_EXHAUSTED` / `429`**
→ Quota limit hit. The script retries automatically (up to 3× with backoff).
→ Reduce concurrency: `npm run gen:faqs -- --concurrency 1`.

**`Cannot parse Gemini response as JSON`**
→ Rare; the model returned text instead of JSON (safety filter trigger).
→ Check the warning in the trail's JSON file. Run again with `--slug <slug>` to retry.
