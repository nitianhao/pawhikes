import test from "node:test";
import assert from "node:assert/strict";
import { formatValue } from "../src/lib/trailSystems/formatters";

test("object values render compact inline summary", () => {
  const out = formatValue({
    value: {
      shadeClass: "medium",
      shadeProxyPercent: 0.62,
      swimLikely: true,
      notes: "This is a long note that should be truncated for compact display",
      extra: 1,
    },
  });
  assert.match(out.display, /Shade class: medium/);
  assert.match(out.display, /Shade proxy percent: 0\.62/);
  assert.match(out.display, /\+1 more/);
});

test("array of objects renders compact first-item summary", () => {
  const out = formatValue({
    value: [
      { kind: "water", distanceToTrailMeters: 12.34, active: true },
      { kind: "hazard", distanceToTrailMeters: 3.21, active: false },
    ],
  });
  assert.match(out.display, /^2 items • first:/);
  assert.match(out.display, /Kind: water/);
  assert.equal(out.isJsonLike, true);
});

test("nested count objects render semantic summaries", () => {
  const out = formatValue({
    value: {
      roadCrossings: { count: 4, riskyCount: 1 },
      waterCrossings: { count: 0 },
      bikeConflictProxy: { count: 1 },
    },
  });
  assert.match(out.display, /Road crossings: total 4, risky 1/);
  assert.match(out.display, /Water crossings: total 0/);
  assert.match(out.display, /Bike conflict proxy: total 1/);
});

test("non-metric nested objects avoid generic fields wording", () => {
  const out = formatValue({
    value: {
      tags: { highway: "crossing", crossing: "uncontrolled", lit: false },
    },
  });
  assert.doesNotMatch(out.display, /fields/);
  assert.match(out.display, /Tags:/);
});
