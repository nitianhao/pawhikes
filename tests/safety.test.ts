import test from "node:test";
import assert from "node:assert/strict";
import { computeSafety } from "../src/lib/enrich/modules/safety";

function inRange01(value: number): boolean {
  return value >= 0 && value <= 1;
}

test("computeSafety sorts nearby vets and applies proxy logic", async () => {
  const fixture = {
    slug: "mueller-trail",
    centroid: [-97.72, 30.28],
    parkingCapacityEstimate: 60,
    crowdSignals: {
      urbanScore: 1,
      entranceCount: 23,
      parkingCapacity: 70,
      busStopCount: 7,
    },
  };

  const out = await computeSafety(fixture, {
    overpass: async () => ({
      elements: [
        {
          type: "node",
          id: 300,
          lat: 30.35,
          lon: -97.82,
          tags: { amenity: "veterinary", name: "Far Vet" },
        },
        {
          type: "node",
          id: 100,
          lat: 30.281,
          lon: -97.721,
          tags: { amenity: "veterinary", name: "Near Vet", opening_hours: "24/7" },
        },
        {
          type: "way",
          id: 200,
          center: { lat: 30.29, lon: -97.73 },
          tags: { healthcare: "animal_hospital", name: "Mid Animal Hospital" },
        },
      ],
    }),
  });

  assert.ok(out.nearbyVets.length >= 2);
  assert.equal(out.nearbyVets[0].osmId, "node/100");
  assert.equal(out.nearbyVets[1].osmId, "way/200");

  assert.equal(inRange01(out.emergencyAccessScore), true);

  assert.ok(out.emergencyAccessReasons.length <= 3);
  assert.ok(out.cellCoverageReasons.length <= 3);

  assert.equal(out.cellCoverageProxy, "likely");
});
