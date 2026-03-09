/**
 * Trail detail display formatters.
 * Pure functions — no React, no component imports.
 */

/** Return only the first sentence of a paragraph (period/exclamation/question boundary). */
export function firstSentence(text: string | null | undefined): string | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  const match = t.match(/^[^.!?]*[.!?]/);
  return match ? match[0] : t;
}

/** Strip ", USA" (or ", United States") suffix from an address string. */
export function stripCountrySuffix(address: string | null | undefined): string | null {
  if (!address) return null;
  return (
    address
      .replace(/,?\s*USA\s*$/i, "")
      .replace(/,?\s*United States\s*$/i, "")
      .trim() || null
  );
}

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DAY_ABBR: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

function dayRangeLabel(days: string[]): string {
  if (days.length === 7) return "Daily";
  const sorted = [...days].sort(
    (a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b)
  );
  const indices = sorted.map((d) => DAY_ORDER.indexOf(d));
  const isContiguous = indices.every(
    (idx, i) => i === 0 || idx === indices[i - 1] + 1
  );
  if (isContiguous && sorted.length > 1) {
    const first = DAY_ABBR[sorted[0]] ?? sorted[0];
    const last = DAY_ABBR[sorted[sorted.length - 1]] ?? sorted[sorted.length - 1];
    return `${first}–${last}`;
  }
  return sorted.map((d) => DAY_ABBR[d] ?? d).join(", ");
}

/**
 * Collapse a 7-day hours list into a compact human-readable format.
 *
 * Input:  ["Monday: 5:00 AM – 10:00 PM", "Tuesday: 5:00 AM – 10:00 PM", ...]
 * Output: ["Daily 5:00 AM – 10:00 PM"]          — if all days have same hours
 *         ["Mon–Fri 8:00 AM – 6:00 PM", ...]    — grouped by schedule
 *         original array                          — if format unrecognised
 */
export function formatHoursCompact(hoursLines: string[]): string[] {
  if (hoursLines.length === 0) return [];

  const parsed: { day: string; time: string }[] = [];
  for (const line of hoursLines) {
    const m = line.match(/^(\w+):\s+(.+)$/);
    if (!m) return hoursLines; // unrecognised format — return as-is
    parsed.push({ day: m[1], time: m[2].trim() });
  }

  // Group days by their time string
  const timeGroups = new Map<string, string[]>();
  for (const { day, time } of parsed) {
    const group = timeGroups.get(time) ?? [];
    group.push(day);
    timeGroups.set(time, group);
  }

  const groups = Array.from(timeGroups.entries()); // [time, days[]][]

  if (groups.length === 1) {
    const [time, days] = groups[0];
    const label = dayRangeLabel(days);
    return [`${label} ${time}`];
  }

  // Multiple schedules — one compact line per group
  return groups.map(([time, days]) => {
    const label = dayRangeLabel(days);
    return `${label}: ${time}`;
  });
}

/**
 * Derive a human-readable crowd context note from the crowd class label.
 * Use this instead of exposing raw crowdReasons (which contains access/parking data).
 */
export function crowdSummaryNote(
  crowdClass: string | null | undefined
): string | undefined {
  const c = (crowdClass ?? "").toLowerCase();
  if (c === "high") return "Busy trail — expect company on weekends";
  if (c === "medium") return "Moderate use, mix of busy and quiet times";
  if (c === "low") return "Typically uncrowded";
  return undefined;
}
