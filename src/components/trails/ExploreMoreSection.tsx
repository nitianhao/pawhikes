import type { CSSProperties } from "react";
import dynamic from "next/dynamic";
import { space, type as t, color } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { Disclosure } from "@/components/ui/Disclosure";
import type { BailoutPointRaw } from "@/lib/bailouts/bailouts.utils";

// Heavy interactive sections — code-split into separate JS chunks so they don't
// block critical-path JS for above-fold content (Dog Fit, Safety, Terrain, Map).
// All three sit far below the fold; chunks load lazily after the main bundle.
const HikeHighlightsSection = dynamic(
  () => import("@/components/trail/HikeHighlightsSection.client").then((m) => ({ default: m.HikeHighlightsSection }))
);

const BailoutOptionsSection = dynamic(
  () => import("@/components/trail/BailoutOptionsSection.client").then((m) => ({ default: m.BailoutOptionsSection }))
);

const HighlightProfileChart = dynamic(
  () => import("@/components/trail/HighlightProfileChart").then((m) => ({ default: m.HighlightProfileChart }))
);

export type ExploreMoreSectionProps = {
  highlightsRaw: unknown;
  highlightCount: number;
  highlightPoints: { d: number; kind: string; name: string | null; distM?: number }[] | null;
  lengthMilesTotal: number | undefined;
  bailoutPointsRaw: BailoutPointRaw[] | null | undefined;
  bailoutClass: string | null;
  bailoutScore: number | null;
  bailoutReasons: string[] | string | null;
};

const subheadStyle: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 600,
  lineHeight: 1.35,
  color: color.textSecondary,
  margin: `0 0 ${space[3]}`,
};

const countNoteStyle: CSSProperties = {
  ...t.meta,
  color: color.textSecondary,
  margin: `0 0 ${space[3]}`,
};

const dividerStyle: CSSProperties = {
  borderTop: `1px solid ${color.borderSubtle}`,
  paddingTop: space[6],
  marginTop: space[6],
};

export function ExploreMoreSection({
  highlightsRaw,
  highlightCount,
  highlightPoints,
  lengthMilesTotal,
  bailoutPointsRaw,
  bailoutClass,
  bailoutScore,
  bailoutReasons,
}: ExploreMoreSectionProps) {

  return (
    <Section
      id="explore"
      title="Explore More"
      subtitle="Highlights, viewpoints, and bailout options"
    >
      {/* Highlights subsection */}
      <div>
        <h3 style={subheadStyle}>Highlights</h3>
        {highlightCount > 0 && (
          <p style={countNoteStyle}>
            {highlightCount} highlight{highlightCount === 1 ? "" : "s"} on or near the trail
          </p>
        )}
        {highlightPoints && highlightPoints.length >= 1 && (
          <div style={{ marginBottom: space[4] }}>
            <HighlightProfileChart
              points={highlightPoints}
              totalMiles={lengthMilesTotal}
            />
          </div>
        )}
        <HikeHighlightsSection highlightsRaw={highlightsRaw as any} />
      </div>

      {/* Bailout subsection */}
      <div style={dividerStyle}>
        <Disclosure label="Bailout & exit options">
          <BailoutOptionsSection
            bailoutPointsRaw={bailoutPointsRaw}
            bailoutClass={bailoutClass}
            bailoutScore={bailoutScore}
            bailoutReasons={bailoutReasons}
            lengthMilesTotal={lengthMilesTotal}
          />
        </Disclosure>
      </div>
    </Section>
  );
}
