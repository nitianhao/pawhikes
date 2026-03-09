# BarkTrails Trail Detail — Design System

Primitives created in `src/design/tokens.ts` and `src/components/ui/`.
All components import tokens; nothing hardcodes raw pixel values or color strings.

---

## 1. Design Tokens — `src/design/tokens.ts`

Single source of truth for spacing, radius, shadows, typography, and color.

### Spacing (`space`)
4 px baseline grid: `1→4px`, `2→8px`, `3→12px`, `4→16px`, `6→24px`, `8→32px`, `12→48px`.

Section outer padding: `space[6]` (24px).
Body inner padding: `space[6]` (24px).
Stat tile padding: `space[3]/space[4]` (12/16px).

### Border radius (`radius`)
`sm→6px`, `md→10px`, `lg→16px`, `pill→9999px`.

Sections and cards use `lg`. Chips use `pill`. Tiles and callouts use `md`.

### Shadows (`shadow`)
`none`, `subtle` (single-layer, 6%), `card` (two-layer, 4+6%).

### Typography (`type`)
Five named scales:
- `pageTitle` — 1.75rem / 700 / -0.02em (trail name)
- `sectionTitle` — 1.125rem / 600 / -0.01em (section headings)
- `subLabel` — 0.6875rem / 700 / +0.09em uppercase (tile labels, chart titles)
- `body` — 0.9375rem / 400 / 1.6 (prose)
- `meta` — 0.8125rem / 400 / 1.45 (supporting notes, legend text)
- `chip` — 0.75rem / 500 (chip labels)

### Color (`color`)
Semantic groups: `surface`, `surfaceSubtle`, `pageBg`, `border`, `borderSubtle`, `textPrimary`, `textSecondary`, `textMuted`.

Tone groups — `good`, `warn`, `risk`, `neutral` — each with `bg/border/text/icon` values:
- `good` — green (dogs allowed, low risk)
- `warn` — amber (caution, partial data)
- `risk` — red (hazards, dogs banned)
- `neutral` — slate (metadata, unknown)

Helper: `toneColors(tone)` returns the matching `{bg, border, text, icon}` object.

---

## 2. Section — `src/components/ui/Section.tsx`

**Purpose:** Unified section container. Replaces all ad-hoc `InsightCard`/`SectionCard`/`CollapsibleSection` containers that each use different radius, shadow, and header styles.

**Props:**
| Prop | Type | Notes |
|---|---|---|
| `id` | string | Anchor id for scroll/navigation |
| `title` | string | Section heading (rendered as `<h2>`) |
| `subtitle` | ReactNode | Optional supporting line below heading |
| `actions` | ReactNode | Optional row of controls/chips aligned right |
| `children` | ReactNode | Section body content |

**When to use:** Every primary section on the trail detail page. For nested sub-panels, use an inner `<div>` with `surfaceSubtle` bg and `radius.md`.

**Migration notes:**
- Replace `InsightCard` (non-wide) with `Section` + move `chips`/`rows` into the body.
- Replace `SectionCard` with `Section` (the expandable wrapper becomes a `Disclosure` inside the body).
- Replace `CollapsibleSection` with `Section` (same pattern).
- The `InsightCard` wide-layout variant remains for now — it will be refactored in the structural pass.

---

## 3. StatTile — `src/components/ui/StatTile.tsx`

**Purpose:** Compact metric display. Replaces the miscellaneous metric cards scattered across `TrailEffortCard`, `TrailDashboard`, `DogPolicyBanner`, and inline chip rows.

**Props:**
| Prop | Type | Notes |
|---|---|---|
| `label` | string | Uppercase label (e.g. `"EFFORT"`, `"DISTANCE"`) |
| `value` | string | Primary value (e.g. `"Moderate"`, `"4.2 mi"`) |
| `note` | string | Supporting line (e.g. `"+312 ft gain"`) |
| `tone` | Tone | `good \| warn \| risk \| neutral` — sets bg/border/text |

**When to use:** Any single-metric display. Lay out 2–4 tiles in a flex row or CSS grid.

**Migration notes:**
- Replace the inline stat blocks in the hero strip.
- Replace metric rows in the dog policy/fit block.
- Replace individual metric cards in `TrailEffortCard`.

---

## 4. Chip — `src/components/ui/Chip.tsx`

**Purpose:** Unified badge/pill. Replaces the three separate chip styles in `InsightCard`, `SectionCard`, and scattered inline `<span>` elements with inconsistent radius, font, and color semantics.

**Props:**
| Prop | Type | Notes |
|---|---|---|
| `variant` | `"status" \| "metadata" \| "filter"` | Visual and semantic class |
| `tone` | Tone | Only applies to `status` variant |
| `active` | boolean | Only applies to `filter` variant |
| `onClick` | () => void | Only applies to `filter` variant (renders a `<button>`) |
| `children` | ReactNode | Chip label |

**Variants:**
- `status` — colored bg/border/text by tone. For policy verdicts, hazard levels, data confidence.
- `metadata` — neutral slate. For factual tags: distance, surface type, loop/out-and-back.
- `filter` — interactive. For section-level filters (e.g. "Show by dog type"). Renders a `<button>`.

**Chip height** is fixed at `28px` via `chipHeight` token for consistent tap targets.

**Migration notes:**
- Replace `InsightCard` `ChipItem[]` chips with `<Chip variant="status" tone={...}>`.
- Replace `SectionCard`'s `<Chip>` export with this component.
- Replace hero stat strip pills with `<Chip variant="metadata">`.
- Replace filter toggles in `HikeHighlightsSection` and `BailoutOptionsSection` with `<Chip variant="filter">`.

---

## 5. Callout — `src/components/ui/Callout.tsx`

**Purpose:** Structured alert/notice block with a 3px left accent border. Replaces inconsistent inline warning text, red/amber boxes, and bold paragraphs used in `RulesAndSafetySection`, `HazardsSection`, and `WinterSection`.

**Props:**
| Prop | Type | Notes |
|---|---|---|
| `variant` | `"info" \| "caution" \| "risk"` | Severity |
| `title` | string | Optional bold header line |
| `children` | ReactNode | Body text or nodes |

**Variants:**
- `info` — neutral slate. Data gaps, general guidance.
- `caution` — amber. Seasonal hazards, partial leash rules, heat advisories.
- `risk` — red. No-dogs bans, confirmed toxic plants, emergency warnings. Renders with `role="alert"`.

**Migration notes:**
- Replace bold warning paragraphs in `HazardsSection`.
- Replace red inline notices in `RulesAndSafetySection`.
- Replace "No swimming" / "No dogs" banners in `SwimSection` and `DogTypesSection`.

---

## 6. ChartFrame — `src/components/ui/ChartFrame.tsx`

**Purpose:** Standard wrapper for all SVG charts. Provides a consistent small-caps title, one-line interpretation subtitle, chart slot, and legend row. Replaces the inconsistent per-chart title/legend patterns in `ElevationProfileChart`, `ShadeSection`, `SurfaceSection`, `WaterSection`, and `AmenityProfileChart`.

**Props:**
| Prop | Type | Notes |
|---|---|---|
| `title` | string | Small-caps chart label (e.g. `"ELEVATION PROFILE"`) |
| `subtitle` | string | One-line interpretation (e.g. `"Mostly flat with one climb in the middle"`) |
| `legend` | `LegendItem[]` | `{label: string, color: string}[]` — colored swatches + text |
| `children` | ReactNode | The SVG chart element |

**When to use:** Wrap every chart component. The chart itself remains unchanged — only the surrounding context is standardized.

**Migration notes:**
- Wrap `<ElevationProfileChart>` inside `<ChartFrame title="ELEVATION" subtitle={...}>`.
- Wrap shade/surface/water/amenity/highlight profile charts similarly.
- Remove per-component title/legend divs that currently differ in font, spacing, and color.

---

## 7. Disclosure — `src/components/ui/Disclosure.tsx`

**Purpose:** Consistent expandable details pattern. Client component. Replaces the native `<details>/<summary>` in `SectionCard`, `CollapsibleSection`, and `InsightCard` which use different trigger text, badge styles, and chevron behavior.

**Props:**
| Prop | Type | Notes |
|---|---|---|
| `label` | string | Trigger button label (e.g. `"Show details"`, `"Technical breakdown"`) |
| `defaultOpen` | boolean | Initial open state (default: `false`) |
| `children` | ReactNode | Expandable content |

**Behavior:**
- Chevron rotates 180° when open (CSS transition).
- Uses `aria-expanded` for accessibility.
- Reuses `.collapsible-summary` class for keyboard focus ring (already in `globals.css`).
- Never collapses critical facts — only use for supplemental detail.

**Migration notes:**
- Replace `<details>` in `SectionCard` with `<Disclosure label="Details">`.
- Replace `<details>` in `CollapsibleSection` with `<Disclosure label="Show / hide">`.
- Replace `InsightCard`'s show/hide toggle with `<Disclosure>` for expandable detail panels.
- Replace verbose technical breakdowns in `ElevationWidthSection`, `SurfaceSection`, etc.

---

## Component composition example

```tsx
// Trail section with stat tiles, a chart, a callout, and expandable details
<Section
  id="terrain"
  title="Terrain & Comfort"
  subtitle="Surface, elevation, and width along the route"
>
  <div style={{ display: "flex", gap: space[3], flexWrap: "wrap" }}>
    <StatTile label="EFFORT" value="Moderate" note="+312 ft gain" tone="warn" />
    <StatTile label="DISTANCE" value="4.2 mi" tone="neutral" />
    <StatTile label="SURFACE" value="Paved" tone="good" />
  </div>

  <ChartFrame title="ELEVATION PROFILE" subtitle="One moderate climb at mile 2">
    <ElevationProfileChart points={system.elevationProfile} />
  </ChartFrame>

  <Callout variant="caution" title="Exposed sections">
    No shade for 0.8 mi between mile 1.5 and 2.3. Avoid midday in summer.
  </Callout>

  <Disclosure label="Full surface breakdown">
    <SurfaceSection system={system} />
  </Disclosure>
</Section>
```

---

## Migration priority order

1. **Tokens** — already done; import from `@/design/tokens` in all new/refactored components.
2. **Chip** — highest-impact; chips appear on every section. Audit InsightCard, hero strip, and policy banner first.
3. **StatTile** — replace hero stat chips and dog-fit metric rows.
4. **Callout** — replace hazard/warning text blocks in Safety & Conditions.
5. **ChartFrame** — wrap all five profile charts.
6. **Disclosure** — replace all `<details>/<summary>` usages.
7. **Section** — swap section shell last, once inner content is already tokenized.
