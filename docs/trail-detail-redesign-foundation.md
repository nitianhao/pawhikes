# Trail Detail Page: Design Audit + Redesign Foundation

## Scope and context reviewed
- Primary page: `src/app/(site)/[state]/[city]/[trailSlug]/page.tsx`
- Core layout primitives: `InsightCard`, `TrailDashboard`, `TrailSectionShell`, `TrailSegmentsMap`
- Major trail sections reviewed: dog policy/banner, trailheads, dog fit, terrain, surface, shade, water, conditions, planning, highlights, rules/safety, FAQ
- Styling baseline reviewed in `src/app/globals.css`

## Current section order (as implemented)
1. Back link
2. Hero card (title/meta/verdict/stat chips/best entry)
3. QA debug block (non-production)
4. Interactive map
5. Dog policy banner
6. Trailheads
7. Trail dashboard:
- Dog Access & Leash Rules
- Terrain & Effort
- Surface
- Shade
- Water
- Conditions
- Planning & Entry
- Highlights
8. Rules & Safety
9. FAQ (if available)

## Design Audit

### Top 12 UX/usability problems
1. Decision-critical information is fragmented across hero, dog policy banner, dog fit card, and rules/safety, slowing first-pass judgment.
2. The map appears before a clear “is this good for my dog?” decision block, adding interaction cost too early.
3. Trailheads appear before core suitability dimensions (effort, heat/shade, hazards), despite being secondary for initial go/no-go.
4. Very long page with many medium-depth sections creates vertical sprawl and weak prioritization.
5. Multiple sections contain local filters/toggles/details; interaction model changes section-by-section and increases cognitive load.
6. Critical guidance competes with raw/diagnostic content patterns (`details`, raw JSON toggles, debug-style labels).
7. Repeated “mini summaries + full details” are implemented differently, so users must relearn each section.
8. Conditions content is split into multiple adjacent cards with overlapping semantics (after dark, lighting, winter, mud, crowd, swim).
9. Highlights and bailout sections are feature-rich but overwhelm users who first need suitability/safety confidence.
10. Inconsistent naming of similar concepts (“rules,” “policy,” “dog access,” “safety”) makes scanning harder.
11. Above-the-fold CTA path is weak; no single high-confidence “quick verdict + top risks + next step” block.
12. Mobile users face dense chip/button clusters and many side-by-side cards that become long stacked micro-panels.

### Top 12 visual/design system problems
1. No single container system: hero, map panel, policy banner, insight cards, and section subcards all use different radius/border/shadow language.
2. Heavy inline style usage across components prevents coherent tokenized consistency.
3. Header styles vary too much (uppercase micro-labels vs normal `h2` vs emoji headings).
4. Chip/badge styles are inconsistent in shape, color semantics, typography, and spacing.
5. Color semantics drift (green means multiple things; amber/red usage not standardized for risk severity).
6. Typography hierarchy is inconsistent: large decorative hero, then many similarly weighted section titles.
7. Multiple card-within-card stacks create visual nesting noise and reduce perceived polish.
8. Section density varies widely (some airy, some cramped), making rhythm feel unstable.
9. Data visualizations use different framing and legend conventions, reducing comparability.
10. Buttons/links have inconsistent affordances (pill buttons, text links, icon-only, underlined links).
11. “Premium outdoor” tone is diluted by dashboard-like fragments and debug-oriented visual patterns.
12. Spacing increments are irregular (`0.35`, `0.65`, `0.75`, `0.9`, `1.25`, etc.), producing non-systematic layout cadence.

### What is wrong with the current above-the-fold experience
- The hero is visually strong but not operationally complete: it gives flavor, not a structured dog-owner decision frame.
- Immediate post-hero jump to map deprioritizes practical decision metrics (dog policy certainty, effort, heat/shade risk, hazards).
- Decision summary is split between hero chips, policy banner chips, and later dashboard cards.
- No compact “critical at a glance” risk panel (policy certainty, effort, heat exposure, hazard level, best time window).

### Sections that deserve to stay near the top
1. Hero (compressed and utility-focused)
2. Unified “Dog Fit Snapshot” (policy + leash + effort + heat/shade + key risks)
3. Key conditions for today/planning (heat, shade, water, hazards summary)
4. Terrain & effort
5. Trailheads + best entry
6. Map (kept high, but after decision snapshot)

### Sections to demote, collapse, tab, combine, or move lower
- Combine:
1. `DogPolicyBanner` + `Dog Access & Leash Rules` into one unified “Dog Policy & Fit” block.
2. `Conditions` + `Rules & Safety` into one coherent “Safety & Conditions” domain with clear subgroups.
3. `ParkingSection` + `RouteAmenitiesSection` + high-level `AmenitiesGrid` into one “Access & Facilities” section.

- Demote lower:
1. Full Highlights explorer (search/filter/detail-heavy)
2. Full bailout deep explorer
3. FAQ

- Collapse by default (non-critical details only):
1. Raw-data views / verbose technical breakdowns
2. Extended per-item metadata in highlights/bailouts

- Keep always visible (never hidden in accordions):
1. Dog allowed + leash rule + confidence/source
2. Effort/difficulty
3. Heat/shade risk summary
4. Hazard class and primary concerns
5. Best entry + parking sufficiency

### Repeated component patterns that should be standardized
1. Section shell (header, summary row, body, optional detail area)
2. Stat tile/card (title, value, supporting note, severity tone)
3. Chip/badge system (status, neutral metadata, filter chips)
4. Callout system (warning/info/verified)
5. Data list row (label/value/meta/actions)
6. Expandable details pattern (`summary` label, chevron, compact content wrapper)
7. Chart frame (title, subtitle, legend position, source/coverage note)
8. Source/trust stamp (verified source, last updated, confidence)

### Mobile usability problems
1. Too many small chips and controls create tap-density problems.
2. Repeated side-by-side mini cards collapse into very long stacks with weak grouping.
3. Long sections with mixed controls force excessive scrolling before core decision confidence.
4. Action links/buttons vary too much, so priority actions are not obvious.
5. Header/hero consumes significant vertical space before actionable decision info.

### Desktop readability problems
1. Single-column long flow underuses width for comparison tasks.
2. Multiple cards with similar visual weight flatten hierarchy.
3. Dense “subcards inside cards” reduce scan speed.
4. Inconsistent heading styles break rhythm and section parsing.
5. Complex interactive sections (highlights/bailouts) compete with core decision narrative.

## Redesign Foundation

### Job of the page (1 sentence)
Enable a dog owner to decide quickly and confidently whether this trail is a safe, suitable, and practical fit for their dog right now.

### Primary user decisions to answer in first 5-10 seconds
1. Are dogs allowed, and what are leash constraints?
2. Is this trail physically suitable for my dog (effort, terrain, heat exposure)?
3. Are there meaningful safety concerns (hazards, crowd, emergency access)?
4. Is logistics practical (best entry, parking, basic amenities/water)?

### Proposed top-to-bottom page architecture
1. Compact utility hero
- Trail name, location, distance/route type
- Trust marker (policy/source confidence)
- One-sentence verdict + 3-5 critical signals

2. Decision Snapshot (single unified block)
- Dogs/leash status
- Effort level
- Shade/heat risk
- Hazard class
- “Best for / Avoid if” micro-guidance

3. Safety & Conditions (priority section)
- Hazard summary
- Heat/shade/water quick read
- Crowd/after-dark quick read
- Emergency vet proximity

4. Terrain & Comfort
- Elevation/effort + width + surface
- Compact charts with standardized framing

5. Access & Entry
- Primary trailhead + parking sufficiency + entry notes
- Route amenities summary

6. Map & Spatial context
- Route + trailheads by default
- Overlays as secondary controls (amenities/highlights/bailouts/vets)

7. Explore more (secondary)
- Highlights explorer
- Bailout detail explorer

8. FAQ and supporting details
- Lower priority, concise

### Unified visual language

#### Page shell
- Max width: 1120-1200px.
- Single background tone with subtle elevation only where needed.
- Clear vertical rhythm with predictable section spacing.

#### Section containers
- One primary section container style only.
- Optional “subsection panel” style for internal grouping.
- Avoid stacked standalone cards when a grouped section works better.

#### Headings/subheadings
- Three-level type scale only:
1. Page title
2. Section title
3. Subsection label
- Remove decorative heading variance (emoji-first, mixed casing, mixed weight).

#### Stat cards
- Use one stat tile template with strict slots:
- `label`
- `value`
- `supporting note`
- `tone`

#### Chips/badges
- Three chip classes only:
- `status` (good/warn/risk)
- `metadata` (neutral)
- `filter` (interactive)
- Consistent size, radius, and typography.

#### Trust/verification elements
- Standard trust row pattern:
- policy source
- confidence label
- last updated
- data coverage note

#### Charts
- Shared chart frame with:
- small title
- one-line interpretation
- legend in consistent position
- fixed height bands for comparability

#### Data tables
- Use compact key-value rows with zebra/light separators.
- Avoid freeform mini cards for tabular data.

#### Callouts/warnings
- Three callout severities only:
- info
- caution
- risk
- Same icon position, border accent, and copy length target.

#### Expandable details
- One disclosure component only, with standardized trigger text and chevron behavior.
- Never collapse critical decision facts.

### Spacing system and density rules
- Use a 4px baseline scale: 4, 8, 12, 16, 24, 32, 48.
- Section outer spacing: 32px desktop, 24px mobile.
- Section inner spacing: 16-24px.
- Stat tile padding: 12-16px.
- Chip height: consistent 28-32px.
- Limit stacked micro-elements: max 2 rows of chips before promoting to structured rows.
- Default to compact density; increase spacing only for major narrative boundaries.

### Design principles (rules)
1. Lead with decision-critical dog suitability, not exploration tools.
2. One concept per section; avoid overlapping semantics between adjacent sections.
3. Keep critical facts visible; details can expand.
4. Standardize component anatomy before styling details.
5. Use color for meaning, not decoration.
6. Preserve a single visual cadence (consistent spacing, radius, border, typography).
7. Prefer grouped sections over many disconnected cards.
8. Optimize for scanability first, depth second.
9. Keep interaction patterns predictable across the page.
10. Every section must answer “why this matters for my dog.”

### Anti-patterns to avoid
1. Giant decorative hero blocks with low information density.
2. Card-per-everything fragmentation.
3. Hiding critical policy/safety facts behind accordions.
4. Inconsistent chip semantics between sections.
5. Local one-off controls with unique styling/behavior.
6. Mixing dashboard/admin visual language into consumer trail storytelling.
7. Repeating the same metric in multiple visual treatments.
8. Overusing color accents without severity meaning.
9. Raw/debug-like UI language in primary user flows.
10. Long unstructured prose before actionable facts.

## Proposed section order (implementation target)
1. Utility hero (name/location/quick verdict/trust)
2. Dog Policy & Fit Snapshot
3. Safety & Conditions summary
4. Terrain & Comfort
5. Access & Entry
6. Map
7. Highlights (secondary)
8. Bailout details (secondary)
9. FAQ/supporting info

## Component inventory (current -> target)
- `Hero` (custom in page) -> `TrailHero` (tokenized, compact, decision-first)
- `DogPolicyBanner` + dog-fit `InsightCard` -> `DogFitSnapshot`
- `InsightCard` (generic) -> retained as base shell with stricter variants
- `TrailSectionShell` -> merge into shared section shell
- `TrailheadsSection` + planning cards -> `AccessEntrySection`
- `Conditions` internals -> `SafetyConditionsSection`
- `TrailSegmentsMap` -> `TrailMapSection` with standardized controls row
- `HikeHighlightsSection` -> `HighlightsSection` (secondary explorer)
- `BailoutOptionsSection` -> `BailoutsSection` (secondary explorer)
- `FaqSection` -> retain, compact style

## Sections/components to merge or remove

### Merge
1. Dog policy banner + dog fit suitability card.
2. AmenitiesGrid + Parking + RouteAmenities into one Access & Facilities section.
3. Conditions + Rules & Safety into one coherent Safety & Conditions section.

### Remove or de-emphasize from primary flow
1. Debug/QA presentation in user-facing layout.
2. Redundant micro-headers and repeated summary copy blocks.
3. Parallel shell components (`TrailSectionShell` and `InsightCard`) where one system suffices.

### Keep but demote
1. Deep highlight explorer controls.
2. Deep bailout explorer controls.
3. FAQ block.

## Short implementation roadmap (no UI coding yet)
1. IA freeze
- Finalize section order, grouping, and what stays above the fold.

2. Component contract pass
- Define shared props/contracts for section shell, stat tiles, chips, callouts, chart frame, disclosure.

3. Tokenization pass
- Move repeated inline styles into design tokens/util classes and variant maps.

4. Structural refactor
- Recompose page into new architecture using existing data and existing section logic.

5. Visual consistency pass
- Normalize typography, spacing, and color semantics across all sections.

6. Interaction consistency pass
- Standardize filters, detail toggles, link/button hierarchy, and mobile tap targets.

7. QA and usability validation
- Verify first-screen decision speed on mobile and desktop.
- Confirm no critical data was hidden or demoted incorrectly.
