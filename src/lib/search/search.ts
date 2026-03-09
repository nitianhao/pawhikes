import type { SearchEntry, SearchResult } from "./types";
import { tokenize } from "./tokenize";
import { DOG_NEED_MAP } from "./dogNeeds";

export function search(
  query: string,
  entries: SearchEntry[],
  limit = 8
): SearchResult[] {
  const raw = query.trim();
  if (!raw) return [];

  const queryTokens = tokenize(raw);
  if (queryTokens.length === 0) return [];

  const textTokens: string[] = [];
  const needPredicates: Array<(e: SearchEntry) => boolean> = [];

  for (const t of queryTokens) {
    const pred = DOG_NEED_MAP[t];
    if (pred) {
      needPredicates.push(pred);
    } else {
      textTokens.push(t);
    }
  }

  const results: SearchResult[] = [];

  for (const entry of entries) {
    // Dog-need filter: all predicates must pass
    if (needPredicates.length > 0 && !needPredicates.every(p => p(entry))) {
      continue;
    }

    let score = 0;

    const nameTokenSet = new Set(tokenize(entry.name));
    for (const qt of textTokens) {
      for (const et of entry.tokens) {
        if (et.startsWith(qt)) {
          score += nameTokenSet.has(et) ? 3 : 1;
          break;
        }
      }
    }

    // If there are only dog-need keywords (no text tokens), include all passing entries
    if (textTokens.length === 0) {
      score = 1;
    }

    if (score > 0) {
      results.push({ ...entry, score });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
