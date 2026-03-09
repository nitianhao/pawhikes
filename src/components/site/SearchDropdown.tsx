"use client";

import Link from "next/link";
import type { SearchResult } from "@/lib/search/types";

type Props = {
  results: SearchResult[];
  query: string;
  activeIndex: number;
  onResultClick: () => void;
};

export function SearchDropdown({ results, query, activeIndex, onResultClick }: Props) {
  if (results.length === 0) return null;

  const container: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 4px)",
    left: 0,
    right: 0,
    background: "#fff",
    border: "1px solid #bbf7d0",
    borderRadius: "12px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
    zIndex: 200,
    overflow: "hidden",
  };

  const header: React.CSSProperties = {
    padding: "0.45rem 0.85rem",
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "#6b7280",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    borderBottom: "1px solid #f0fdf4",
  };

  const footer: React.CSSProperties = {
    borderTop: "1px solid #f0fdf4",
    padding: "0.5rem 0.85rem",
    textAlign: "right",
  };

  const footerLink: React.CSSProperties = {
    fontSize: "0.8rem",
    color: "#16a34a",
    textDecoration: "none",
    fontWeight: 600,
  };

  return (
    <div style={container} role="listbox" aria-label="Search results">
      <div style={header}>Trails</div>
      {results.map((result, i) => (
        <ResultRow
          key={result.slug}
          result={result}
          active={i === activeIndex}
          onClick={onResultClick}
        />
      ))}
      <div style={footer}>
        <Link
          href={`/search?q=${encodeURIComponent(query)}`}
          style={footerLink}
          onClick={onResultClick}
        >
          See all results &rarr;
        </Link>
      </div>
    </div>
  );
}

function ResultRow({
  result,
  active,
  onClick,
}: {
  result: SearchResult;
  active: boolean;
  onClick: () => void;
}) {
  const href = `/${encodeURIComponent(result.state)}/${encodeURIComponent(result.citySlug)}/${encodeURIComponent(result.slug)}`;

  const row: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    padding: "0.6rem 0.85rem",
    textDecoration: "none",
    background: active ? "#f0fdf4" : "transparent",
    cursor: "pointer",
  };

  const nameStyle: React.CSSProperties = {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "#111827",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const metaStyle: React.CSSProperties = {
    fontSize: "0.78rem",
    color: "#6b7280",
    flexShrink: 0,
  };

  const lenLabel = result.len != null ? `${result.len.toFixed(1)} mi` : null;
  const meta = [result.city, result.state, lenLabel].filter(Boolean).join(" · ");

  const chipStyle: React.CSSProperties = {
    flexShrink: 0,
    fontSize: "0.68rem",
    fontWeight: 600,
    padding: "0.15rem 0.4rem",
    borderRadius: "999px",
    background: "#dcfce7",
    color: "#166534",
    border: "1px solid #bbf7d0",
  };

  return (
    <Link href={href} style={row} role="option" aria-selected={active} onClick={onClick}>
      <span style={nameStyle}>{result.name}</span>
      <span style={metaStyle}>{meta}</span>
      {result.leash === "off" && <span style={chipStyle}>Off-leash</span>}
    </Link>
  );
}
