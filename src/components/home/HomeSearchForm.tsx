"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadSearchIndex } from "@/lib/search/loader";
import { search } from "@/lib/search/search";
import type { SearchResult } from "@/lib/search/types";
import { SearchDropdown } from "@/components/site/SearchDropdown";

export function HomeSearchForm() {
  const router = useRouter();
  const rawQ = useSearchParams().get("q") ?? "";
  const initialQ = rawQ.trim();
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      close();
      return;
    }
    const index = await loadSearchIndex();
    const hits = search(q, index, 5);
    setResults(hits);
    setOpen(hits.length > 0);
    setActiveIndex(-1);
  }, [close]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 80);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    close();
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        const r = results[activeIndex];
        close();
        router.push(`/${encodeURIComponent(r.state)}/${encodeURIComponent(r.citySlug)}/${encodeURIComponent(r.slug)}`);
        return;
      }
      if (query.trim()) {
        close();
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    }
  }

  useEffect(() => {
    setQuery(initialQ);
  }, [initialQ]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close]);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
        <input
          type="search"
          name="q"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Search by trail, city, or dog need (shade, easy walk...)"
          aria-label="Search trails"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          autoComplete="off"
          style={{
            flex: "1 1 0",
            height: "48px",
            border: "1.5px solid #86efac",
            borderRadius: "12px",
            padding: "0 1rem",
            background: "#fff",
            fontSize: "0.9375rem",
            outline: "none",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        />
        <button
          type="submit"
          style={{
            height: "48px",
            borderRadius: "12px",
            border: "1.5px solid #16a34a",
            background: "#16a34a",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.9rem",
            padding: "0 1.1rem",
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Search
        </button>
        {query.trim() && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              close();
            }}
            style={{
              alignSelf: "center",
              color: "#6b7280",
              fontSize: "0.8125rem",
              textDecoration: "none",
              whiteSpace: "nowrap",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Clear
          </button>
        )}
      </form>
      {open && (
        <SearchDropdown
          results={results}
          query={query}
          activeIndex={activeIndex}
          onResultClick={close}
        />
      )}
    </div>
  );
}
