import type { CSSProperties } from "react";
import { space, color } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { Callout } from "@/components/ui/Callout";
import type { Tone } from "@/design/tokens";
import { crowdSummaryNote } from "@/lib/trails/displayFormatters";

export type SafetyConditionsSnapshotProps = {
  hazardsClass: string | null | undefined;
  hazardsReasons: string | string[] | null | undefined;
  hazards: Record<string, unknown> | null | undefined;
  shadeClass: string | null | undefined;
  shadeProxyPercent: number | null | undefined;
  heatRisk: string | null | undefined;
  crowdClass: string | null | undefined;
  crowdReasons: string | string[] | null | undefined;
  safetyVets: Array<{ name: string | null; distanceToCentroidMeters: number }> | null;
  winterClass: string | null | undefined;
  mudRisk: string | null | undefined;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function cap(s: string | null | undefined): string {
  if (!s) return "—";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function levelTone(cls: string | null | undefined): Tone {
  const c = (cls ?? "").toLowerCase();
  if (c === "low") return "good";
  if (c === "medium") return "warn";
  if (c === "high") return "risk";
  return "neutral";
}

function shadeTone(cls: string | null | undefined, pct: number | null | undefined): Tone {
  const c = (cls ?? "").toLowerCase();
  if (c === "high") return "good";
  if (c === "medium") return "neutral";
  if (c === "low") return "warn";
  if (pct != null) {
    if (pct >= 0.6) return "good";
    if (pct >= 0.3) return "neutral";
    return "warn";
  }
  return "neutral";
}

function shadeValue(cls: string | null | undefined, pct: number | null | undefined): string {
  const c = (cls ?? "").toLowerCase();
  if (c === "high") return "High shade";
  if (c === "medium") return "Some shade";
  if (c === "low") return "Exposed";
  if (pct != null) return `${Math.round(pct * 100)}% shaded`;
  return "Unknown";
}

function vetValue(
  vets: Array<{ name: string | null; distanceToCentroidMeters: number }> | null
): string | null {
  if (!vets || vets.length === 0) return null;
  const nearest = vets.reduce((a, b) =>
    a.distanceToCentroidMeters < b.distanceToCentroidMeters ? a : b
  );
  const km = nearest.distanceToCentroidMeters / 1000;
  return km < 1 ? `< 1 km away` : `${km.toFixed(1)} km away`;
}

function vetNote(
  vets: Array<{ name: string | null; distanceToCentroidMeters: number }> | null
): string | undefined {
  if (!vets || vets.length === 0) return undefined;
  const nearest = vets.reduce((a, b) =>
    a.distanceToCentroidMeters < b.distanceToCentroidMeters ? a : b
  );
  return nearest.name ?? undefined;
}

function asNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function hazardPrimaryText(hazards: Record<string, unknown> | null | undefined): string | null {
  if (!hazards) return null;
  const parts: string[] = [];
  const road = hazards.roadCrossings as { count?: number; riskyCount?: number } | undefined;
  const bike = hazards.bikeConflictProxy as { count?: number } | undefined;
  const water = hazards.waterCrossings as { count?: number } | undefined;
  const cliff = hazards.cliffOrSteepEdge as { count?: number } | undefined;
  if (asNum(road?.riskyCount) > 0) parts.push(`${asNum(road!.riskyCount)} risky road crossing${asNum(road!.riskyCount) > 1 ? "s" : ""}`);
  if (asNum(bike?.count) > 0) parts.push(`${asNum(bike!.count)} bike conflict zone${asNum(bike!.count) > 1 ? "s" : ""}`);
  if (asNum(water?.count) > 0 && parts.length < 2) parts.push(`${asNum(water!.count)} water crossing${asNum(water!.count) > 1 ? "s" : ""}`);
  if (asNum(cliff?.count) > 0 && parts.length < 2) parts.push(`${asNum(cliff!.count)} cliff/steep edge`);
  if (parts.length === 0) return null;
  return parts.slice(0, 2).join("; ");
}

// ── Styles ────────────────────────────────────────────────────────────────────
const tilesGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: space[3],
};

const calloutsColStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space[3],
};

export function SafetyConditionsSnapshot({
  hazardsClass,
  hazardsReasons,
  hazards,
  shadeClass,
  shadeProxyPercent,
  heatRisk,
  crowdClass,
  crowdReasons,
  safetyVets,
  winterClass,
  mudRisk,
}: SafetyConditionsSnapshotProps) {
  const hazTone = levelTone(hazardsClass);
  const hazValue = hazardsClass ? cap(hazardsClass) : "—";

  const shdTone = shadeTone(shadeClass, shadeProxyPercent);
  const shdValue = shadeValue(shadeClass, shadeProxyPercent);
  const shdNote = heatRisk ? "Heat risk present" : undefined;

  const crowdTone = levelTone(crowdClass);
  const crowdValue = crowdClass ? cap(crowdClass) : "—";
  const crowdNote = crowdSummaryNote(crowdClass);

  const vtValue = vetValue(safetyVets);
  const vtNote = vetNote(safetyVets);

  // Callouts — only shown when actionable
  const showHazardCallout = hazardsClass?.toLowerCase() === "high";
  const hazardCalloutText =
    hazardPrimaryText(hazards) ??
    "Multiple significant hazards on this trail. Check the Hazards section below.";

  const showHeatCallout = !!heatRisk && (shadeClass?.toLowerCase() === "low" || shadeProxyPercent != null && shadeProxyPercent < 0.25);

  return (
    <Section
      title="Safety & Conditions"
      subtitle="Hazards, heat exposure, crowd level, and nearby emergency vet context"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: space[4] }}>
        {/* 4 stat tiles */}
        <div style={tilesGridStyle}>
          <StatTile
            label="HAZARDS"
            value={hazValue}
            tone={hazTone}
          />
          <StatTile
            label="SHADE / HEAT"
            value={shdValue}
            note={shdNote}
            tone={shdTone}
          />
          <StatTile
            label="CROWD"
            value={crowdValue}
            note={crowdNote}
            tone={crowdTone}
          />
          {vtValue && (
            <StatTile
              label="NEAREST VET"
              value={vtValue}
              note={vtNote}
              tone="neutral"
            />
          )}
        </div>

        {/* Callouts */}
        {(showHazardCallout || showHeatCallout) && (
          <div style={calloutsColStyle}>
            {showHazardCallout && (
              <Callout variant="risk" title="High hazards">
                {hazardCalloutText}
              </Callout>
            )}
            {showHeatCallout && (
              <Callout variant="caution" title="Heat exposure">
                Low shade coverage — bring extra water and avoid midday in summer.
              </Callout>
            )}
          </div>
        )}

      </div>
    </Section>
  );
}
