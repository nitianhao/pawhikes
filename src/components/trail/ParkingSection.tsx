import { DollarSign, MapPin, ParkingSquare } from "lucide-react";

export type ParkingSectionProps = {
  parkingCapacityEstimate?: number | null;
  parkingCount?: number | null;
  parkingFeeKnown?: boolean | null;
};

function availabilityLabel(estimate: number | null | undefined): string {
  if (estimate == null || !Number.isFinite(estimate)) return "Parking availability unknown";
  if (estimate >= 50) return "Large parking area";
  if (estimate >= 20) return "Moderate parking";
  if (estimate >= 5) return "Limited parking";
  return "Very limited parking";
}

function accessIntensity(count: number | null | undefined): string {
  if (count == null || !Number.isFinite(count)) return "Parking locations unknown";
  if (count >= 10) return "Multiple parking access points";
  if (count >= 3) return "Several parking spots";
  return "Few designated parking areas";
}

function feeStatus(feeKnown: boolean | null | undefined): string {
  if (feeKnown === false) return "No known parking fee";
  if (feeKnown === true) return "Parking fee may apply";
  return "Fee information unavailable";
}

function guidance(
  estimate: number | null | undefined,
  count: number | null | undefined
): string | null {
  const cap = estimate != null && Number.isFinite(estimate) ? estimate : null;
  const cnt = count != null && Number.isFinite(count) ? count : null;
  const parts: string[] = [];
  if (cap != null && cap < 20) {
    parts.push("Arrive early on weekends — spaces may fill quickly.");
  }
  if (cap != null && cap >= 40) {
    parts.push("Parking generally sufficient for peak times.");
  }
  if (cnt != null && cnt > 10) {
    parts.push("Multiple access points reduce congestion near trailheads.");
  }
  if (parts.length === 0) return null;
  return parts.slice(0, 2).join(" ");
}

export function ParkingSection({
  parkingCapacityEstimate,
  parkingCount,
  parkingFeeKnown,
}: ParkingSectionProps) {
  const hasAny =
    parkingCapacityEstimate != null ||
    parkingCount != null ||
    parkingFeeKnown != null;

  if (!hasAny) return null;

  const availability = availabilityLabel(parkingCapacityEstimate);
  const access = accessIntensity(parkingCount);
  const fee = feeStatus(parkingFeeKnown);
  const capacityNum =
    parkingCapacityEstimate != null && Number.isFinite(parkingCapacityEstimate)
      ? Math.round(parkingCapacityEstimate)
      : null;
  const countNum =
    parkingCount != null && Number.isFinite(parkingCount)
      ? Math.round(parkingCount)
      : null;
  const guidanceText = guidance(parkingCapacityEstimate, parkingCount);

  return (
    <section style={S.section}>
      <h2 style={S.title}>
        <ParkingSquare size={18} style={{ marginRight: "0.35rem", verticalAlign: "middle" }} />
        🅿 Parking
      </h2>

      <div style={S.topRow}>
        <span style={S.badge}>{availability}</span>
        <div style={S.capacityBlock}>
          <span style={S.capacityValue}>
            {capacityNum != null ? `~${capacityNum} spaces` : "—"}
          </span>
          <span style={S.capacitySubtext}>Estimated capacity</span>
        </div>
      </div>

      <div style={S.chipsRow}>
        <div style={S.chip}>
          <MapPin size={14} style={{ flexShrink: 0, color: "#6b7280" }} />
          <span style={S.chipText}>
            {countNum != null ? `${countNum} parking location${countNum === 1 ? "" : "s"}` : access}
          </span>
        </div>
        <div style={S.chip}>
          <DollarSign size={14} style={{ flexShrink: 0, color: "#6b7280" }} />
          <span style={S.chipText}>{fee}</span>
        </div>
      </div>

      {guidanceText ? <p style={S.guidance}>{guidanceText}</p> : null}
    </section>
  );
}

const S = {
  section: {
    marginTop: 0,
    border: "1px solid #e5e7eb",
    borderRadius: "0.7rem",
    padding: "0.75rem",
  } as const,
  title: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "#111827",
    display: "inline-flex",
    alignItems: "center",
  } as const,
  topRow: {
    marginTop: "0.35rem",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
  } as const,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.2rem 0.5rem",
    borderRadius: "0.5rem",
    fontSize: "0.8rem",
    fontWeight: 600,
    background: "#e0f2fe",
    color: "#0369a1",
  } as const,
  capacityBlock: { textAlign: "right" as const, minWidth: 0 } as const,
  capacityValue: {
    display: "block",
    fontSize: "1rem",
    fontWeight: 700,
    color: "#111827",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  capacitySubtext: {
    display: "block",
    marginTop: "0.1rem",
    fontSize: "0.68rem",
    color: "#6b7280",
  } as const,
  chipsRow: {
    marginTop: "0.35rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.4rem",
  } as const,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "white",
    padding: "0.22rem 0.45rem",
    fontSize: "0.75rem",
    color: "#374151",
  } as const,
  chipText: { fontSize: "0.75rem", color: "#374151" } as const,
  guidance: {
    marginTop: "0.3rem",
    fontSize: "0.76rem",
    lineHeight: 1.45,
    color: "#374151",
  } as const,
} as const;
