export function safeSlug(input: string): string {
  const base = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || "unknown";
}

export function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function slugifyCity(name: string): string {
  return safeSlug(name);
}

export function deslugifyCity(slug: string): string {
  const value = String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/^-+|-+$/g, "");

  if (!value) return "Unknown city";

  return value
    .split("-")
    .map((segment) =>
      segment.length === 0 ? segment : segment[0].toUpperCase() + segment.slice(1)
    )
    .join(" ");
}

