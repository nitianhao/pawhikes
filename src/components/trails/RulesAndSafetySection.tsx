import type { CSSProperties } from "react";
import { space, color } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { SafetySection } from "@/components/trail/SafetySection";
import { HazardsSection } from "@/components/trail/HazardsSection";

export type RulesAndSafetySectionProps = {
  system: Record<string, unknown> | null;
  city?: string | null;
  state?: string | null;
  introText?: string | null;
};

const dividerStyle: CSSProperties = {
  borderTop: `1px solid ${color.borderSubtle}`,
  paddingTop: space[6],
  marginTop: space[6],
};

export function RulesAndSafetySection({ system, city, state, introText }: RulesAndSafetySectionProps) {
  return (
    <Section
      id="rules"
      title="Rules & Safety"
      subtitle="Dog policy context, emergency resources, and trail hazard overview"
    >
      {introText ? (
        <p style={{ margin: `0 0 ${space[4]}`, color: color.textSecondary, fontSize: "0.875rem", lineHeight: 1.55 }}>
          {introText}
        </p>
      ) : null}
      <SafetySection
        nearbyVets={(system as any)?.safety?.nearbyVets ?? (system as any)?.nearbyVets}
        trailName={system?.name as string | undefined}
        city={city}
        state={state}
      />
      <div style={dividerStyle}>
        <HazardsSection
          hazards={system?.hazards as Record<string, unknown> | null}
          hazardsClass={system?.hazardsClass as string | null}
          hazardsScore={system?.hazardsScore as number | null}
          hazardsReasons={system?.hazardsReasons as string | string[] | null}
          hazardsLastComputedAt={system?.hazardsLastComputedAt as number | string | null}
        />
      </div>
    </Section>
  );
}
