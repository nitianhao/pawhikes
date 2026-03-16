"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { loadSearchIndex } from "@/lib/search/loader";
import { search } from "@/lib/search/search";
import type { SearchResult } from "@/lib/search/types";
import { SearchDropdown } from "./SearchDropdown";

export function HeaderSearch({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const isHomepage = pathname === "/";
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    const index = await loadSearchIndex();
    const hits = search(q, index, 5);
    setResults(hits);
    setOpen(hits.length > 0);
    setActiveIndex(-1);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(q), 80);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        const r = results[activeIndex];
        close();
        router.push(`/${encodeURIComponent(r.state)}/${encodeURIComponent(r.citySlug)}/${encodeURIComponent(r.slug)}`);
      } else if (query.trim()) {
        close();
        router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      }
    } else if (e.key === "Escape") {
      close();
    }
  }

  function close() {
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      close();
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  // Close on click-outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const wrapStyle: React.CSSProperties = { position: "relative" };

  if (isHomepage) {
    return (
      <div
        aria-hidden="true"
        className={mobile
          ? "site-header-search site-header-search--mobile site-header-search--suppressed"
          : "site-header-search site-header-search--suppressed"}
      />
    );
  }

  return (
    <div
      ref={wrapRef}
      style={wrapStyle}
      className={mobile ? "site-header-search site-header-search--mobile" : "site-header-search"}
    >
      <form onSubmit={handleSubmit} style={{ display: "contents" }}>
        <Search size={16} className="site-header-search__icon" aria-hidden="true" />
        <input
          type="search"
          name="q"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label="Search trails"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          placeholder="Search trails, cities, or dog needs (shade, water, easy walks)"
          className="site-header-search__input"
          autoComplete="off"
        />
        <button type="submit" className="site-header-search__submit" aria-label="Submit search">
          <Search size={14} aria-hidden="true" />
        </button>
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
