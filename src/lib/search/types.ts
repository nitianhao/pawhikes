export type SearchEntry = {
  slug: string;
  name: string;
  city: string;
  state: string;
  citySlug: string;
  len: number | null;
  leash: string | null;
  shade: string | null;
  gradeP90: number | null;
  waterScore: number | null;
  paved: number | null;
  crowdScore: number | null;
  tokens: string[];
};

export type SearchResult = SearchEntry & { score: number };
