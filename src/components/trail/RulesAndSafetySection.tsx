"use client";

import { TrailSectionShell } from "@/components/trail/TrailSectionShell";
import { SafetySection } from "@/components/trail/SafetySection";
import { HazardsSection } from "@/components/trail/HazardsSection";
import { BailoutOptionsSection } from "@/components/trail/BailoutOptionsSection";

export type RulesAndSafetySectionProps = {
  system: Record<string, unknown> | null;
  city?: string | null;
  state?: string | null;
};

export function RulesAndSafetySection({ system, city, state }: RulesAndSafetySectionProps) {
  return (
    <TrailSectionShell id="rules" title="Rules & Safety" variant="safety">
      <div className="col-span-12">
        <SafetySection
          nearbyVets={(system as any)?.safety?.nearbyVets ?? (system as any)?.nearbyVets}
          trailName={system?.name as string | undefined}
          city={city}
          state={state}
        />
      </div>

      <div className="col-span-12">
        <HazardsSection
          hazards={system?.hazards as Record<string, unknown> | null}
          hazardsClass={system?.hazardsClass as string | null}
          hazardsScore={system?.hazardsScore as number | null}
          hazardsReasons={system?.hazardsReasons as string | string[] | null}
          hazardsLastComputedAt={system?.hazardsLastComputedAt as number | string | null}
        />
      </div>

      <div className="col-span-12">
        <BailoutOptionsSection
          bailoutPointsRaw={(system?.bailoutPoints as any) ?? null}
          bailoutClass={system?.bailoutClass as string | null}
          bailoutScore={system?.bailoutScore as number | null}
          bailoutReasons={system?.bailoutReasons as string[] | string | null}
          lengthMilesTotal={system?.lengthMilesTotal as number | null}
        />
      </div>
    </TrailSectionShell>
  );
}
