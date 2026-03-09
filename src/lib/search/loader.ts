import type { SearchEntry } from "./types";

let cached: SearchEntry[] | null = null;

export async function loadSearchIndex(): Promise<SearchEntry[]> {
  if (cached) return cached;
  try {
    const res = await fetch("/search-index.json", { cache: "no-cache" });
    if (!res.ok) {
      console.error(`[search] Failed to load index: ${res.status} ${res.statusText}`);
      return [];
    }
    cached = (await res.json()) as SearchEntry[];
    return cached;
  } catch (err) {
    console.error("[search] Failed to load index:", err);
    return [];
  }
}
