export function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as Record<string, unknown>).length === 0;
  return false;
}

export function takeSample<T>(arr: T[], n: number): T[] {
  if (!Array.isArray(arr)) return [];
  if (!Number.isFinite(n) || n <= 0) return [];
  return arr.slice(0, n);
}

