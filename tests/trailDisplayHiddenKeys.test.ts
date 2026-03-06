/**
 * Ensures DISPLAY_HIDDEN_KEYS never appear in trail page display or unmapped list.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTrailSystemDisplay,
  DISPLAY_HIDDEN_KEYS,
  collectMappedKeys,
} from "../src/lib/trailSystems/display";
import { buildTrailSystemPageModel } from "../src/lib/trailSystems/pageModel";

const HIDDEN_LIST = Array.from(DISPLAY_HIDDEN_KEYS);

function allDisplayKeys(model: ReturnType<typeof buildTrailSystemPageModel>): Set<string> {
  const out = new Set<string>();
  for (const item of model.glance) out.add(item.key);
  for (const section of model.sections) {
    for (const item of section.items) out.add(item.key);
  }
  return out;
}

test("hidden keys do not appear in glance or sections", () => {
  const sys: Record<string, unknown> = {
    name: "Test Trail",
    slug: "test-trail-abc12345",
    state: "TX",
    city: "Austin",
    lengthMilesTotal: 5,
  };
  for (const k of HIDDEN_LIST) {
    (sys as any)[k] = k.includes("At") ? "2025-01-01T00:00:00Z" : k === "raw" ? {} : "value";
  }

  const display = buildTrailSystemDisplay(sys);
  const displayKeys = new Set<string>();
  for (const item of display.glance) displayKeys.add(item.key);
  for (const section of display.sections) {
    for (const item of section.items) displayKeys.add(item.key);
  }

  for (const hidden of HIDDEN_LIST) {
    assert.ok(!displayKeys.has(hidden), `hidden key "${hidden}" must not appear in display`);
  }
});

test("hidden keys do not appear in page model glance, sections, or unmapped", () => {
  const sys: Record<string, unknown> = {
    name: "Test Trail",
    slug: "test-trail-abc12345",
    state: "TX",
    city: "Austin",
    lengthMilesTotal: 5,
  };
  for (const k of HIDDEN_LIST) {
    (sys as any)[k] = k.includes("At") ? "2025-01-01T00:00:00Z" : k === "raw" ? {} : "value";
  }

  const model = buildTrailSystemPageModel(sys);
  const shownKeys = allDisplayKeys(model);
  const unmappedSet = new Set(model.completeness.unmapped);

  for (const hidden of HIDDEN_LIST) {
    assert.ok(!shownKeys.has(hidden), `hidden key "${hidden}" must not appear in glance/sections`);
    assert.ok(!unmappedSet.has(hidden), `hidden key "${hidden}" must not appear in unmapped list`);
  }
});
