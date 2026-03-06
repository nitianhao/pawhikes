import test from "node:test";
import assert from "node:assert/strict";
import { computePersonalization } from "../src/lib/enrich/modules/personalization";

const muellerLikeFixture = {
  slug: "mueller-trail",
  lengthMilesTotal: 6.2,
  heatRisk: "high",
  asphaltPercent: 22,
  shadeClass: "low",
  shadeProxyPercent: 0.28,
  crowdClass: "medium",
  amenitiesIndexScore: 0.72,
  amenitiesCounts: {
    bench: 6,
    shelter: 1,
    drinking_water: 2,
  },
  swimAccessPointsByType: {
    riverbank: 0,
  },
  surfaceSummary: {
    distribution: {
      asphalt: 0.7,
      gravel: 0.3,
    },
  },
  widthSummary: {
    min: 4.5,
  },
  roughnessRisk: "low",
  waterNearPercent: 0.55,
};

function inRange01(value: number): boolean {
  return value >= 0 && value <= 1;
}

test("computePersonalization clamps scores and enforces reason caps", () => {
  const out = computePersonalization(muellerLikeFixture);

  assert.equal(inRange01(out.seniorSafeScore), true);
  assert.equal(inRange01(out.smallDogScore), true);
  assert.equal(inRange01(out.highEnergyScore), true);

  assert.equal(out.heatSensitiveLevel, "high");

  assert.ok(out.seniorSafeReasons.length <= 3);
  assert.ok(out.smallDogReasons.length <= 3);
  assert.ok(out.heatSensitiveReasons.length <= 3);
  assert.ok(out.highEnergyReasons.length <= 3);
});
