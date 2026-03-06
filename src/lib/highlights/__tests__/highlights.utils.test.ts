import { describe, expect, it } from "vitest";
import type { HighlightRaw } from "@/lib/highlights/types";
import {
  formatDistanceLong,
  formatDistanceShort,
  getDistanceBand,
  matchesHighlightSearch,
  normalizeHighlights,
  sortHighlights,
} from "@/lib/highlights/highlights.utils";

const SAMPLE: HighlightRaw[] = [{"kind":"historic","name":null,"tags":{"historic":"memorial"},"osmId":"node/9301045223","osmType":"node","location":{"type":"Point","coordinates":[-97.6626118,30.2918782]},"distanceToTrailMeters":25.2},{"kind":"historic","name":null,"tags":{"historic":"railway"},"osmId":"way/1230862967","osmType":"way","location":{"type":"Point","coordinates":[-97.6576971,30.2766706]},"distanceToTrailMeters":29.1},{"kind":"historic","name":null,"tags":{"historic":"railway"},"osmId":"way/1245751296","osmType":"way","location":{"type":"Point","coordinates":[-97.660453,30.2698509]},"distanceToTrailMeters":60.6},{"kind":"historic","name":null,"tags":{"ruins":"building","historic":"ruins"},"osmId":"way/1095480762","osmType":"way","location":{"type":"Point","coordinates":[-97.6546678,30.3002879]},"distanceToTrailMeters":62.6},{"kind":"historic","name":"Montopolis","tags":{"name":"Montopolis","historic":"memorial"},"osmId":"node/12453821284","osmType":"node","location":{"type":"Point","coordinates":[-97.69171,30.25939]},"distanceToTrailMeters":90.6},{"kind":"historic","name":null,"tags":{"historic":"railway"},"osmId":"way/1245751295","osmType":"way","location":{"type":"Point","coordinates":[-97.6591569,30.273049]},"distanceToTrailMeters":110.5}];

describe("highlights.utils normalization", () => {
  it("derives title when name is null", () => {
    const list = normalizeHighlights(SAMPLE);
    expect(list[0].title).toBe("Memorial");
    expect(list[1].title).toBe("Railway");
    expect(list[3].title).toBe("Ruins");
  });

  it("derives typeLabel", () => {
    const list = normalizeHighlights(SAMPLE);
    expect(list[0].typeLabel).toBe("Memorial");
    expect(list[1].typeLabel).toBe("Railway");
    expect(list[3].typeLabel).toBe("Ruins");
  });

  it("generates OSM URLs", () => {
    const list = normalizeHighlights(SAMPLE);
    expect(list[0].osmUrl).toBe("https://www.openstreetmap.org/node/9301045223");
    expect(list[1].osmUrl).toBe("https://www.openstreetmap.org/way/1230862967");
  });

  it("formats distance boundaries and bands", () => {
    expect(formatDistanceLong(999)).toBe("999 m from trail");
    expect(formatDistanceLong(1000)).toBe("1.0 km from trail");
    expect(formatDistanceShort(1050)).toBe("1.1 km");
    expect(getDistanceBand(5)).toBe("on-trail");
    expect(getDistanceBand(25)).toBe("very-close");
    expect(getDistanceBand(75)).toBe("close");
    expect(getDistanceBand(250)).toBe("nearby");
    expect(getDistanceBand(251)).toBe("off-route");
  });

  it("matches search across tags", () => {
    const list = normalizeHighlights(SAMPLE);
    expect(matchesHighlightSearch(list[3], "building")).toBe(true);
    expect(matchesHighlightSearch(list[3], "ruins")).toBe(true);
    expect(matchesHighlightSearch(list[3], "zzz")).toBe(false);
  });

  it("sorts by distance ascending by default and by name", () => {
    const list = normalizeHighlights(SAMPLE);
    expect(list[0].distanceM).toBe(25.2);
    const byName = sortHighlights(list, "name");
    expect(byName[0].title).toBe("Memorial");
    expect(byName.some((h) => h.title === "Montopolis")).toBe(true);
  });
});
