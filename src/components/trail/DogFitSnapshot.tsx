import type { CSSProperties } from "react";
import { space } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { Callout } from "@/components/ui/Callout";
import { Disclosure } from "@/components/ui/Disclosure";
import { DogTypesSection } from "@/components/trail/DogTypesSection";
import type { TrailSystemForPage } from "@/lib/data/trailSystem";

export type DogFitSnapshotProps = {
  leashDetails: string | null;
  system: TrailSystemForPage | null;
};

export function DogFitSnapshot({
  leashDetails,
  system,
}: DogFitSnapshotProps) {
  const detailsText = typeof leashDetails === "string" ? leashDetails.trim() : "";
  const showDetailsCallout = detailsText.length > 0 && detailsText.length <= 200;

  return (
    <Section
      title="Dog Fit"
      subtitle="Dogs allowed status, leash expectations, and suitability by dog type"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: space[4] }}>
        {/* Leash rule detail */}
        {showDetailsCallout && (
          <Callout variant="info">
            {detailsText}
          </Callout>
        )}
        {!showDetailsCallout && (
          <p style={{ margin: 0, color: "#6b7280", fontSize: "0.875rem", lineHeight: 1.55 }}>
            Review this section to confirm leash rules and dog-fit signals before choosing this trail.
          </p>
        )}

        {/* Dog type suitability — behind disclosure */}
        <Disclosure label="Suitability by dog type" defaultOpen={false}>
          <div style={{ paddingTop: space[3] }}>
            <DogTypesSection system={system} />
          </div>
        </Disclosure>
      </div>
    </Section>
  );
}
