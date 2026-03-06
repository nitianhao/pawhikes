import { describe, expect, it } from "vitest";
import type { BailoutPointRaw } from "@/lib/bailouts/bailouts.utils";
import {
  deriveSpotForAnchor,
  formatDistanceLong,
  formatDistanceShort,
  isActionableExit,
  isDeadEndOnly,
  normalizeBailoutPoints,
  sortSpotsBySelectedAnchorDistance,
} from "@/lib/bailouts/bailouts.utils";

const SAMPLE: BailoutPointRaw[] = [
  {
    kind: "entrance",
    name: null,
    anchor: "start",
    location: { type: "Point", coordinates: [-97.1234567, 30.1234567] },
    distanceToAnchorMeters: 80,
  },
  {
    kind: "dead_end",
    name: null,
    anchor: "start",
    location: { type: "Point", coordinates: [-97.12345671, 30.12345671] },
    distanceToAnchorMeters: 75,
  },
  {
    kind: "intersection",
    name: "Connector A",
    anchor: "centroid",
    location: { type: "Point", coordinates: [-97.12001, 30.12001] },
    distanceToAnchorMeters: 310,
  },
  {
    kind: "intersection",
    name: "Connector A",
    anchor: "centroid",
    location: { type: "Point", coordinates: [-97.12001, 30.12001] },
    distanceToAnchorMeters: 280,
  },
  {
    kind: "dead_end",
    name: null,
    anchor: "end",
    location: { type: "Point", coordinates: [-97.10001, 30.10001] },
    distanceToAnchorMeters: 140,
  },
];

describe("bailouts.utils", () => {
  it("clusters duplicate coordinates and merges kinds by priority", () => {
    const spots = normalizeBailoutPoints(SAMPLE);
    const deduped = spots.find((spot) => spot.kinds.includes("entrance") && spot.kinds.includes("dead_end"));
    expect(spots.length).toBe(3);
    expect(deduped).toBeTruthy();
    expect(deduped?.kinds).toEqual(["entrance", "dead_end"]);
  });

  it("merges anchor distances using minimum observed value", () => {
    const spots = normalizeBailoutPoints(SAMPLE);
    const connector = spots.find((spot) => spot.title === "Connector A");
    expect(connector).toBeTruthy();
    expect(connector?.anchors.centroid).toBe(280);
  });

  it("detects actionable exits and dead-end-only spots", () => {
    const spots = normalizeBailoutPoints(SAMPLE);
    const deadEndOnly = spots.find((spot) => spot.kinds.length === 1 && spot.kinds[0] === "dead_end");
    const actionable = spots.find((spot) => spot.kinds.includes("intersection"));
    expect(deadEndOnly).toBeTruthy();
    expect(actionable).toBeTruthy();
    expect(isDeadEndOnly(deadEndOnly!)).toBe(true);
    expect(isActionableExit(deadEndOnly!)).toBe(false);
    expect(isActionableExit(actionable!)).toBe(true);
  });

  it("sorts spots by selected anchor distance", () => {
    const spots = normalizeBailoutPoints(SAMPLE);
    const forMid = spots.map((spot) => deriveSpotForAnchor(spot, "centroid"));
    const sorted = sortSpotsBySelectedAnchorDistance(forMid);
    expect(sorted[0].title).toBe("Connector A");
    expect(sorted[0].distanceForSelectedAnchorM).toBe(280);
  });

  it("formats distance boundaries at 999/1000", () => {
    expect(formatDistanceShort(999)).toBe("999 m");
    expect(formatDistanceShort(1000)).toBe("1.0 km");
    expect(formatDistanceLong(999, "start")).toBe("999 m from start");
    expect(formatDistanceLong(1000, "start")).toBe("1.0 km from start");
  });
});
