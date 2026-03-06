import { describe, it, expect } from "vitest";
import type { HighlightRaw } from "../types";
import {
  humanize,
  getHighlightTitle,
  getHighlightPresentation,
  getHighlightSubtitle,
  formatDistanceLong,
  formatDistanceShort,
  normalizeHighlight,
  normalizeHighlights,
} from "../normalize";

// Sample data from spec
const SAMPLE: HighlightRaw[] = [
  {
    kind: "historic",
    name: null,
    tags: { historic: "memorial" },
    osmId: "node/9301045223",
    osmType: "node",
    location: { type: "Point", coordinates: [-97.6626118, 30.2918782] },
    distanceToTrailMeters: 25.2,
  },
  {
    kind: "historic",
    name: null,
    tags: { historic: "railway" },
    osmId: "way/1230862967",
    osmType: "way",
    location: { type: "Point", coordinates: [-97.6576971, 30.2766706] },
    distanceToTrailMeters: 29.1,
  },
  {
    kind: "historic",
    name: null,
    tags: { historic: "railway" },
    osmId: "way/1245751296",
    osmType: "way",
    location: { type: "Point", coordinates: [-97.660453, 30.2698509] },
    distanceToTrailMeters: 60.6,
  },
  {
    kind: "historic",
    name: null,
    tags: { ruins: "building", historic: "ruins" },
    osmId: "way/1095480762",
    osmType: "way",
    location: { type: "Point", coordinates: [-97.6546678, 30.3002879] },
    distanceToTrailMeters: 62.6,
  },
  {
    kind: "historic",
    name: "Montopolis",
    tags: { name: "Montopolis", historic: "memorial" },
    osmId: "node/12453821284",
    osmType: "node",
    location: { type: "Point", coordinates: [-97.69171, 30.25939] },
    distanceToTrailMeters: 90.6,
  },
  {
    kind: "historic",
    name: null,
    tags: { historic: "railway" },
    osmId: "way/1245751295",
    osmType: "way",
    location: { type: "Point", coordinates: [-97.6591569, 30.273049] },
    distanceToTrailMeters: 110.5,
  },
];

// ---------------------------------------------------------------------------
// humanize
// ---------------------------------------------------------------------------

describe("humanize", () => {
  it("replaces underscores and title-cases", () => {
    expect(humanize("cave_entrance")).toBe("Cave Entrance");
  });

  it("handles single word", () => {
    expect(humanize("railway")).toBe("Railway");
  });

  it("returns empty for empty input", () => {
    expect(humanize("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// getHighlightTitle
// ---------------------------------------------------------------------------

describe("getHighlightTitle", () => {
  it("uses raw.name when present", () => {
    expect(getHighlightTitle(SAMPLE[4])).toBe("Montopolis");
  });

  it("falls back to tags.historic for memorial", () => {
    expect(getHighlightTitle(SAMPLE[0])).toBe("Memorial");
  });

  it("falls back to tags.historic for railway", () => {
    expect(getHighlightTitle(SAMPLE[1])).toBe("Railway");
  });

  it("falls back to tags.historic for ruins (historic=ruins wins over ruins tag)", () => {
    expect(getHighlightTitle(SAMPLE[3])).toBe("Ruins");
  });

  it("falls back to humanize(kind) when no tags match", () => {
    const raw: HighlightRaw = {
      kind: "viewpoint",
      name: null,
      tags: {},
      osmId: "node/1",
      osmType: "node",
      location: { type: "Point", coordinates: [0, 0] },
      distanceToTrailMeters: 0,
    };
    expect(getHighlightTitle(raw)).toBe("Viewpoint");
  });

  it("returns 'Highlight' when kind is empty and no tags", () => {
    const raw: HighlightRaw = {
      kind: "",
      name: null,
      tags: {},
      osmId: "node/1",
      osmType: "node",
      location: { type: "Point", coordinates: [0, 0] },
      distanceToTrailMeters: 0,
    };
    // kind is empty string, so normalizeHighlight returns null
    // but getHighlightTitle should return "Highlight"
    expect(getHighlightTitle(raw)).toBe("Highlight");
  });

  it("uses tags.ruins when historic is absent", () => {
    const raw: HighlightRaw = {
      kind: "historic",
      name: null,
      tags: { ruins: "building" },
      osmId: "node/1",
      osmType: "node",
      location: { type: "Point", coordinates: [0, 0] },
      distanceToTrailMeters: 0,
    };
    expect(getHighlightTitle(raw)).toBe("Building Ruins");
  });
});

// ---------------------------------------------------------------------------
// getHighlightPresentation
// ---------------------------------------------------------------------------

describe("getHighlightPresentation", () => {
  it('returns train icon for railway', () => {
    const { category, iconKey } = getHighlightPresentation(SAMPLE[1]);
    expect(category).toBe("Historic");
    expect(iconKey).toBe("train");
  });

  it('returns memorial icon for memorial', () => {
    const { iconKey } = getHighlightPresentation(SAMPLE[0]);
    expect(iconKey).toBe("memorial");
  });

  it('returns ruins icon for ruins', () => {
    const { iconKey } = getHighlightPresentation(SAMPLE[3]);
    expect(iconKey).toBe("ruins");
  });

  it('returns pin icon for non-historic kind', () => {
    const raw: HighlightRaw = {
      kind: "viewpoint",
      name: null,
      tags: {},
      osmId: "node/1",
      osmType: "node",
      location: { type: "Point", coordinates: [0, 0] },
      distanceToTrailMeters: 0,
    };
    const { category, iconKey } = getHighlightPresentation(raw);
    expect(category).toBe("Viewpoint");
    expect(iconKey).toBe("pin");
  });
});

// ---------------------------------------------------------------------------
// getHighlightSubtitle
// ---------------------------------------------------------------------------

describe("getHighlightSubtitle", () => {
  it("includes category and descriptor for memorial", () => {
    expect(getHighlightSubtitle(SAMPLE[0])).toBe("Historic · memorial");
  });

  it("includes category and descriptor for railway", () => {
    expect(getHighlightSubtitle(SAMPLE[1])).toBe("Historic · railway");
  });
});

// ---------------------------------------------------------------------------
// OSM URL generation
// ---------------------------------------------------------------------------

describe("OSM URL generation", () => {
  it("generates node URL from osmId", () => {
    const h = normalizeHighlight(SAMPLE[0])!;
    expect(h.osmUrl).toBe("https://www.openstreetmap.org/node/9301045223");
  });

  it("generates way URL from osmId", () => {
    const h = normalizeHighlight(SAMPLE[1])!;
    expect(h.osmUrl).toBe("https://www.openstreetmap.org/way/1230862967");
  });

  it("parses numeric id from osmId", () => {
    const h = normalizeHighlight(SAMPLE[0])!;
    expect(h.osmNumericId).toBe("9301045223");
  });
});

// ---------------------------------------------------------------------------
// Distance formatting
// ---------------------------------------------------------------------------

describe("formatDistanceLong", () => {
  it("formats 999 m as meters", () => {
    expect(formatDistanceLong(999)).toBe("999 m from trail");
  });

  it("formats 1000 m as km", () => {
    expect(formatDistanceLong(1000)).toBe("1.0 km from trail");
  });

  it("formats 1050 m as 1.1 km", () => {
    expect(formatDistanceLong(1050)).toBe("1.1 km from trail");
  });

  it("rounds small distances", () => {
    expect(formatDistanceLong(25.2)).toBe("25 m from trail");
  });
});

describe("formatDistanceShort", () => {
  it("formats 999 m as meters", () => {
    expect(formatDistanceShort(999)).toBe("999 m");
  });

  it("formats 1000 m as km", () => {
    expect(formatDistanceShort(1000)).toBe("1.0 km");
  });

  it("formats 1050 m as 1.1 km", () => {
    expect(formatDistanceShort(1050)).toBe("1.1 km");
  });
});

// ---------------------------------------------------------------------------
// normalizeHighlight
// ---------------------------------------------------------------------------

describe("normalizeHighlight", () => {
  it("normalizes a valid entry", () => {
    const h = normalizeHighlight(SAMPLE[0]);
    expect(h).not.toBeNull();
    expect(h!.id).toBe("node:9301045223");
    expect(h!.title).toBe("Memorial");
    expect(h!.categoryLabel).toBe("Historic");
    expect(h!.lat).toBe(30.2918782);
    expect(h!.lng).toBe(-97.6626118);
    expect(h!.distanceM).toBe(25.2);
  });

  it("returns null for invalid entry", () => {
    expect(normalizeHighlight({} as HighlightRaw)).toBeNull();
    expect(normalizeHighlight(null as any)).toBeNull();
    expect(normalizeHighlight(undefined as any)).toBeNull();
  });

  it("returns null when osmType is invalid", () => {
    const bad: HighlightRaw = {
      ...SAMPLE[0],
      osmType: "invalid" as any,
    };
    expect(normalizeHighlight(bad)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// normalizeHighlights (batch) + sorting
// ---------------------------------------------------------------------------

describe("normalizeHighlights", () => {
  it("normalizes and sorts by distance ascending", () => {
    const result = normalizeHighlights(SAMPLE);
    expect(result.length).toBe(6);
    expect(result[0].distanceM).toBe(25.2);
    expect(result[1].distanceM).toBe(29.1);
    expect(result[2].distanceM).toBe(60.6);
    expect(result[3].distanceM).toBe(62.6);
    expect(result[4].distanceM).toBe(90.6);
    expect(result[5].distanceM).toBe(110.5);
  });

  it("returns empty array for null input", () => {
    expect(normalizeHighlights(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(normalizeHighlights(undefined)).toEqual([]);
  });

  it("skips invalid entries", () => {
    const mixed = [SAMPLE[0], {} as HighlightRaw, SAMPLE[1]];
    const result = normalizeHighlights(mixed);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Stable ID computation
// ---------------------------------------------------------------------------

describe("stable id", () => {
  it("uses osmType:numericId format", () => {
    const h = normalizeHighlight(SAMPLE[0])!;
    expect(h.id).toBe("node:9301045223");
  });

  it("uses osmType:numericId for way", () => {
    const h = normalizeHighlight(SAMPLE[1])!;
    expect(h.id).toBe("way:1230862967");
  });
});
