/**
 * Validator for PolicySeed objects before writing to InstantDB.
 *
 * Rules:
 * - dogsAllowed must be a valid enum value
 * - leashPolicy must be a valid enum value
 * - policyConfidence must be 0..1
 * - If dogsAllowed !== "unknown" OR leashPolicy !== "unknown":
 *     policySourceUrl and policySourceTitle must be present and non-empty
 * - If policyConfidence >= 0.7:
 *     policySourceUrl and policySourceTitle must be present and non-placeholder
 * - Both dogsAllowed="unknown" AND leashPolicy="unknown" requires allowUnknown=true
 */

import type { PolicySeed } from "./policy-seeds.js";

const PLACEHOLDER_PATTERNS = [
  /^TODO/i,
  /^placeholder/i,
  /^needs official/i,
  /^tbd$/i,
  /^n\/a$/i,
];

function isPlaceholder(s: string): boolean {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(s.trim()));
}

export interface ValidationResult {
  ok: boolean;
  issues: string[];
}

export interface ValidateOptions {
  allowUnknown?: boolean; // if false (default), both-unknown is rejected
}

export function validatePolicySeed(
  seed: PolicySeed,
  opts: ValidateOptions = {}
): ValidationResult {
  const issues: string[] = [];
  const { allowUnknown = false } = opts;

  // ── Enum checks ──────────────────────────────────────────────────────────────
  const validDogsAllowed = ["allowed", "prohibited", "unknown"];
  if (!validDogsAllowed.includes(seed.dogsAllowed)) {
    issues.push(`dogsAllowed "${seed.dogsAllowed}" is not a valid value (${validDogsAllowed.join("|")})`);
  }

  const validLeashPolicy = ["required", "off_leash_allowed", "conditional", "unknown"];
  if (!validLeashPolicy.includes(seed.leashPolicy)) {
    issues.push(`leashPolicy "${seed.leashPolicy}" is not a valid value (${validLeashPolicy.join("|")})`);
  }

  // ── Confidence range ─────────────────────────────────────────────────────────
  if (typeof seed.policyConfidence !== "number" || seed.policyConfidence < 0 || seed.policyConfidence > 1) {
    issues.push(`policyConfidence ${seed.policyConfidence} must be a number between 0 and 1`);
  }

  // ── Source required when non-unknown values are set ───────────────────────────
  const hasNonUnknownDogs = seed.dogsAllowed !== "unknown";
  const hasNonUnknownLeash = seed.leashPolicy !== "unknown";

  if (hasNonUnknownDogs || hasNonUnknownLeash) {
    if (!seed.policySourceUrl?.trim()) {
      issues.push("policySourceUrl is required when dogsAllowed or leashPolicy is not 'unknown'");
    }
    if (!seed.policySourceTitle?.trim()) {
      issues.push("policySourceTitle is required when dogsAllowed or leashPolicy is not 'unknown'");
    }
  }

  // ── High-confidence requires non-placeholder source ──────────────────────────
  if (seed.policyConfidence >= 0.7) {
    if (!seed.policySourceUrl?.trim() || isPlaceholder(seed.policySourceUrl)) {
      issues.push("policyConfidence >= 0.7 requires a real policySourceUrl (not empty or placeholder)");
    }
    if (!seed.policySourceTitle?.trim() || isPlaceholder(seed.policySourceTitle)) {
      issues.push("policyConfidence >= 0.7 requires a real policySourceTitle (not empty or placeholder)");
    }
  }

  // ── Both-unknown gate ─────────────────────────────────────────────────────────
  if (!allowUnknown && seed.dogsAllowed === "unknown" && seed.leashPolicy === "unknown") {
    issues.push("Both dogsAllowed and leashPolicy are 'unknown' — pass --allowUnknown to write these");
  }

  return { ok: issues.length === 0, issues };
}
