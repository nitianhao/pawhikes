function isPrimitive(v: unknown): v is string | number | boolean {
  return (
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

export function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(s ?? "")
  );
}

export function humanizeKey(key: string): string {
  const raw = String(key ?? "").trim();
  if (!raw) return "";

  const cleaned = raw.replace(/[_-]+/g, " ");

  // Insert spaces for camelCase and digit/letter boundaries.
  const spaced = cleaned
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-zA-Z])/g, "$1 $2");

  const normalized = spaced.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const lower = normalized.toLowerCase();
  return lower[0].toUpperCase() + lower.slice(1);
}

function formatNumber(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const rounded = Math.round(v * 100) / 100;
  const s = String(rounded);
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/g, "");
}

function shortText(v: string, max = 36): string {
  const s = String(v ?? "").trim();
  if (!s) return "—";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function summarizeMetricObject(value: Record<string, unknown>): string | null {
  const num = (k: string): number | null => {
    const v = value[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };

  const lat = num("lat");
  const lon = num("lon");
  if (lat != null || lon != null) {
    return `lat ${lat != null ? formatNumber(lat) : "—"}, lon ${lon != null ? formatNumber(lon) : "—"}`;
  }

  const metricKeys = ["count", "total", "riskyCount", "riskCount", "risky", "yes", "no"] as const;
  const parts: string[] = [];
  for (const k of metricKeys) {
    const v = num(k);
    if (v == null) continue;
    const label =
      k === "count" || k === "total"
        ? "total"
        : k === "riskyCount" || k === "riskCount"
        ? "risky"
        : String(humanizeKey(k)).toLowerCase();
    parts.push(`${label} ${formatNumber(v)}`);
  }
  return parts.length ? parts.join(", ") : null;
}

function inlineAtom(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return shortText(value);
  if (typeof value === "number") return Number.isFinite(value) ? formatNumber(value) : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return `${value.length} items`;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const metricSummary = summarizeMetricObject(obj);
    if (metricSummary) return metricSummary;
    const entries = Object.entries(obj);
    if (!entries.length) return "empty";
    const primitivePairs = entries
      .filter(([, v]) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")
      .slice(0, 2)
      .map(([k, v]) => `${humanizeKey(k) || k} ${inlineAtom(v)}`);
    if (primitivePairs.length) {
      const extra = entries.length - primitivePairs.length;
      return extra > 0 ? `${primitivePairs.join(", ")}, +${extra}` : primitivePairs.join(", ");
    }
    const keys = entries.slice(0, 3).map(([k]) => humanizeKey(k) || k);
    const extra = entries.length - keys.length;
    return extra > 0 ? `${keys.join(", ")} +${extra}` : keys.join(", ");
  }
  return shortText(String(value));
}

function compactObjectSummary(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  if (entries.length === 0) return "—";
  const head = entries.slice(0, 5).map(([k, v]) => `${humanizeKey(k) || k}: ${inlineAtom(v)}`);
  const extra = entries.length - head.length;
  return extra > 0 ? `${head.join(" • ")} • +${extra} more` : head.join(" • ");
}

export function formatValue(item: {
  key?: string;
  kind?: string;
  value: any;
}): { display: string; raw?: any; isJsonLike?: boolean } {
  const key = item?.key;
  const kind = item?.kind;
  const value = item?.value;

  if (value == null) return { display: "—" };

  if (kind === "percent") {
    if (typeof value !== "number" || !Number.isFinite(value)) return { display: "—" };
    const pct = value <= 1 ? value * 100 : value;
    if (!Number.isFinite(pct)) return { display: "—" };
    return { display: `${Math.round(pct)}%` };
  }

  if (kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return { display: "—" };
    if (key === "parkingCapacityEstimate") {
      return { display: `≈ ${formatNumber(value)} spaces` };
    }
    return { display: formatNumber(value) };
  }

  if (kind === "text") {
    return { display: String(value) };
  }

  if (typeof value === "boolean") {
    return { display: value ? "Yes" : "No" };
  }

  if (typeof value === "number") {
    return { display: Number.isFinite(value) ? formatNumber(value) : "—" };
  }

  if (typeof value === "string") {
    const s = value.trim();
    return { display: s.length ? s : "—" };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { display: "—" };
    const allPrimitives = value.every(isPrimitive);
    if (allPrimitives) {
      const head = value.slice(0, 5).map((v) => String(v));
      const extra = value.length - head.length;
      return { display: extra > 0 ? `${head.join(", ")}… (+${extra} more)` : head.join(", ") };
    }
    const first = value[0];
    const firstSummary =
      first && typeof first === "object" && !Array.isArray(first)
        ? compactObjectSummary(first as Record<string, unknown>)
        : inlineAtom(first);
    return {
      display: `${value.length} items • first: ${firstSummary}`,
      raw: value,
      isJsonLike: true,
    };
  }

  if (typeof value === "object") {
    return {
      display: compactObjectSummary(value as Record<string, unknown>),
      raw: value,
      isJsonLike: true,
    };
  }

  return { display: String(value) };
}

