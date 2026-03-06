/**
 * Canonical trail slugs include a stable suffix to prevent collisions.
 *
 * Why the suffix?
 * - Trail names are not unique and can change over time.
 * - A stable identifier (extSystemRef or id) makes the URL deterministic and collision-safe.
 */

import { safeSlug } from "@/lib/slug";

export function truncateOnToken(slug: string, maxLen: number): string {
  const value = String(slug ?? "");
  if (maxLen <= 0) return "";
  if (value.length <= maxLen) return value;

  const head = value.slice(0, maxLen);
  const lastDash = head.lastIndexOf("-");
  const trimmed =
    lastDash > 0 ? head.slice(0, lastDash) : head;

  return trimmed.replace(/-+$/g, "");
}

function lastN(value: string, n: number): string {
  const v = String(value ?? "");
  if (n <= 0) return "";
  return v.length <= n ? v : v.slice(v.length - n);
}

export function normalizeState(state: string | null | undefined): string {
  const raw = String(state ?? "").trim();
  if (/^[a-zA-Z]{2}$/.test(raw)) return raw.toUpperCase();
  const slug = safeSlug(raw);
  return slug || "unknown";
}

export function canonicalTrailSlug(input: {
  name?: string | null;
  id?: string | null;
  extSystemRef?: string | null;
}): string {
  // A) Base slug (readable)
  let base = safeSlug(String(input?.name ?? "")) || "trail";
  if (base.length > 42) base = truncateOnToken(base, 42) || base.slice(0, 42);
  base = base || "trail";

  // B) Stable suffix (compact but stable)
  const idRaw = String(input?.id ?? "").trim();
  const ext = String(input?.extSystemRef ?? "").trim();
  const extStripped = ext.startsWith("sys:") ? ext.slice(4) : ext;
  const stableRaw = extStripped || idRaw || "unknown";

  let stableSlug = safeSlug(stableRaw) || "unknown";

  if (stableSlug.length > 30) {
    const prefix = truncateOnToken(stableSlug, 22) || stableSlug.slice(0, 22) || "unknown";
    const tail6Raw = idRaw ? lastN(idRaw, 6) : lastN(stableSlug, 6);
    const tail6 = safeSlug(tail6Raw) || tail6Raw || "unknown";
    stableSlug = `${prefix}-${tail6}`.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  }

  const tailRaw = idRaw ? lastN(idRaw, 8) : lastN(stableSlug, 8);
  const tail = safeSlug(tailRaw) || "unknown";

  let suffixFinal = stableSlug || "unknown";
  if (!suffixFinal.endsWith(tail) && !suffixFinal.endsWith(`-${tail}`)) {
    suffixFinal = `${suffixFinal}-${tail}`;
  }
  suffixFinal = suffixFinal.replace(/-+/g, "-").replace(/^-+|-+$/g, "") || "unknown";

  // C) Final canonical
  return `${base}--${suffixFinal}`;
}

export function isCanonicalTrailSlug(
  slug: string,
  record: { name?: any; id?: any; extSystemRef?: any }
): boolean {
  const normalized = String(slug ?? "").trim().toLowerCase();
  return normalized === canonicalTrailSlug({
    name: record?.name ?? null,
    id: record?.id ?? null,
    extSystemRef: record?.extSystemRef ?? null,
  });
}

