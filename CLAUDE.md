# BarkTrails — Claude Instructions

## Planning Rules
- Always use the AskUserQuestion tool before starting implementation
- Ask at least 5 clarifying questions before writing any code
- Present options with clear descriptions for each choice
- Build a spec document from my answers before executing

## Always Do
- Read a file before editing it — never suggest changes without seeing current code
- Verify UI changes work using preview_screenshot or preview_snapshot
- Dry-run data pipeline scripts (omit `--write`) before committing writes

## Never Do
- Never use banned field names: `*Id`, `*Key`, `sourceKey`, `sourceObjectId`, `sourceNetworkId`, `sourceObjectKey`, `sourceNetworkKey` — use descriptive alternatives like `extDataset`, `extSystemRef`, `extSegmentRef`, `systemRef`, `systemSlug`
- Never include `id: {}` in InstantDB query selectors — it triggers a validation error; `id` is returned automatically
- Never add comments unless the logic is non-obvious

## Project Structure
```
src/
  app/               # Next.js app router pages
  components/trail/  # Trail detail UI components (charts, sections, cards)
  lib/
    data/            # Data fetching (trailSystem.ts — PAGE_FIELDS lives here)
    enrich/          # Enrichment pipeline modules
    instant/         # InstantDB schema (schema.ts) and client setup
scripts/             # Data pipeline scripts (ingest, rollup, enrich, store-*)
out/faqs/            # Generated FAQ JSON files (not committed)
.cache/elevation/    # Elevation cache files (not committed)
```

## Stack
- Next.js 15 + React 19 + TypeScript
- InstantDB (`@instantdb/react` client, `@instantdb/admin` for scripts)
- Styling: inline `React.CSSProperties` only — no Tailwind, no external UI libraries
- Green palette via CSS vars in `globals.css` (`--bark-green-*`, `--bark-earth`, etc.)

## Environment Variables (`.env.local`)
```
INSTANT_APP_ID=
INSTANT_ADMIN_TOKEN=
INSTANT_SCHEMA_FILE_PATH=
GOOGLE_CLOUD_PROJECT=          # for FAQ generation via Gemini Vertex
GOOGLE_APPLICATION_CREDENTIALS= # path to service account key (or use gcloud ADC)
```

## Common Commands
```bash
npm run dev                          # Start Next.js dev server
npm run instant:pushverify           # Push InstantDB schema and verify entities

# Data pipeline
npm run austin:ingest                # Ingest Austin open data segments
npm run rollup:systems -- --city "Austin" --dataset "austin_socrata_jdwm-wfps"  # dry-run
npm run rollup:systems -- ... --write  # commit rollup

# Profile scripts (always dry-run first, then add --write)
npx tsx scripts/dev/store-elevation-profile.ts [--slug <slug>]
npx tsx scripts/dev/store-shade-profile.ts --city Austin [--slug <slug>] [--write]
npx tsx scripts/dev/store-surface-profile.ts --city Austin [--slug <slug>] [--write]
npx tsx scripts/dev/store-amenity-profile.ts --city Austin [--slug <slug>] [--write]
npx tsx scripts/dev/store-water-profile.ts --city Austin [--slug <slug>] [--write]
npx tsx scripts/dev/store-highlights-profile.ts --city Austin [--slug <slug>] [--write]

# FAQ generation
npm run gen:faqs                     # Generate FAQs → out/faqs/*.json (no DB write)
npm run store:faqs -- --write        # Write generated FAQs to InstantDB
```
