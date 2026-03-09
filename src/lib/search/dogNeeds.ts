import type { SearchEntry } from "./types";

type Predicate = (e: SearchEntry) => boolean;

export const DOG_NEED_MAP: Record<string, Predicate> = {
  easy:             e => (e.gradeP90 ?? 99) < 6 && (e.len ?? 99) < 6,
  shade:            e => e.shade === "high" || e.shade === "medium",
  shaded:           e => e.shade === "high" || e.shade === "medium",
  water:            e => (e.waterScore ?? 0) >= 0.5,
  "off-leash":      e => e.leash === "off",
  offleash:         e => e.leash === "off",
  senior:           e => (e.gradeP90 ?? 99) < 4 && (e.len ?? 99) < 5,
  "small-dogs":     e => (e.paved ?? 0) >= 0.5 && (e.gradeP90 ?? 99) < 6,
  smalldogs:        e => (e.paved ?? 0) >= 0.5 && (e.gradeP90 ?? 99) < 6,
  long:             e => (e.len ?? 0) >= 8,
  "long-trails":    e => (e.len ?? 0) >= 8,
  smooth:           e => (e.paved ?? 0) >= 0.6,
  "smooth-surface": e => (e.paved ?? 0) >= 0.6,
  quiet:            e => (e.crowdScore ?? 1) < 0.4,
};
