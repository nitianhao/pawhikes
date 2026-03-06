import test from "node:test";
import assert from "node:assert/strict";
import { computeMatch, type DogProfile } from "../src/lib/match/dogProfileMatch";

const fixture = {
  slug: "mueller-trail",
  heatRisk: "high",
  shadeClass: "low",
  shadeProxyPercent: 0.32,
  waterNearPercent: 0.55,
  crowdClass: "medium",
  roughnessRisk: "low",
  amenitiesCounts: {
    bench: 6,
    drinking_water: 2,
  },
  personalization: {
    seniorSafeScore: 0.6,
    smallDogScore: 0.7,
    heatSensitiveLevel: "high",
    highEnergyScore: 0.75,
  },
  safety: {
    emergencyAccessClass: "high",
    vetCountWithin5km: 7,
  },
};

function inRange01(value: number): boolean {
  return value >= 0 && value <= 1;
}

test("computeMatch returns bounded score and capped reasons/warnings", () => {
  const profiles: DogProfile[] = ["balanced", "senior", "small", "heat_sensitive", "high_energy"];
  for (const p of profiles) {
    const out = computeMatch(fixture, p);
    assert.equal(inRange01(out.score), true);
    assert.ok(out.reasons.length <= 3);
    assert.ok(out.warnings.length <= 2);
  }
});

test("heat_sensitive drops when heatSensitiveLevel is high", () => {
  const hot = computeMatch(fixture, "heat_sensitive");
  const cooler = computeMatch(
    {
      ...fixture,
      heatRisk: "low",
      shadeClass: "high",
      personalization: {
        ...fixture.personalization,
        heatSensitiveLevel: "low",
      },
    },
    "heat_sensitive"
  );
  assert.ok(hot.score < cooler.score);
});

test("senior profile penalizes high heat risk", () => {
  const hot = computeMatch(fixture, "senior");
  const cool = computeMatch({ ...fixture, heatRisk: "low" }, "senior");
  assert.ok(hot.score < cool.score);
});
