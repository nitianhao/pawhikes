"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { slugifyCity } from "@/lib/slug";

export type SiteHeaderProps = {
  states: string[];
  citiesByState: Record<string, string[]>;
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG              = "#14532d";
const ACCENT          = "#4ade80";
const TEXT            = "#ffffff";
const TEXT_DIM        = "rgba(255,255,255,0.5)";
const GLASS_BG        = "rgba(255,255,255,0.08)";
const GLASS_BD        = "rgba(255,255,255,0.14)";
const GLASS_HOVER_BG  = "rgba(255,255,255,0.13)";
const GLASS_FOCUS_BG  = "rgba(255,255,255,0.12)";
const GLASS_FOCUS_BD  = "rgba(74,222,128,0.55)";
const GLASS_FOCUS_SHD = "0 0 0 3px rgba(74,222,128,0.12)";
const PANEL_BG        = "#0f3320";
const PANEL_BD        = "rgba(74,222,128,0.18)";
const BTN_BG          = "#22c55e";
const BTN_HOVER       = "#16a34a";
const RADIUS          = "7px";

// ── Icons ─────────────────────────────────────────────────────────────────────
function PawIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={ACCENT} aria-hidden="true" style={{ flexShrink: 0 }}>
      <ellipse cx="6.5" cy="3.5" rx="1.5" ry="2" />
      <ellipse cx="11" cy="2.5" rx="1.5" ry="2" />
      <ellipse cx="15.5" cy="3.5" rx="1.5" ry="2" />
      <ellipse cx="19" cy="7" rx="1.5" ry="2" />
      <path d="M12 8c-3.5 0-7 2.5-7 6.5 0 2.5 1.5 5 4 5.5.8.2 2 .5 3 .5s2.2-.3 3-.5c2.5-.5 4-3 4-5.5C19 10.5 15.5 8 12 8z" />
    </svg>
  );
}

function SearchIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChevronDown({ style }: { style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// ── Custom dropdown ───────────────────────────────────────────────────────────
function DropdownButton({
  value,
  placeholder,
  options,
  onChange,
  disabled = false,
  width,
}: {
  value: string;
  placeholder: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  width?: number | string;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const isActive = !!value;

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0, width }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        disabled={disabled}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          height: "36px",
          padding: "0 11px",
          borderRadius: RADIUS,
          border: `1px solid ${open ? GLASS_FOCUS_BD : GLASS_BD}`,
          background: open
            ? GLASS_FOCUS_BG
            : hovered
            ? GLASS_HOVER_BG
            : isActive
            ? "rgba(74,222,128,0.12)"
            : GLASS_BG,
          color: isActive ? ACCENT : TEXT,
          fontSize: "0.8125rem",
          fontWeight: isActive ? 600 : 400,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.4 : 1,
          transition: "background 0.12s, border-color 0.12s, color 0.12s",
          whiteSpace: "nowrap",
          width: width ? "100%" : undefined,
          justifyContent: width ? "space-between" : undefined,
        }}
      >
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
          {value || placeholder}
        </span>
        <ChevronDown
          style={{
            width: "12px",
            height: "12px",
            flexShrink: 0,
            color: isActive ? ACCENT : TEXT_DIM,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && options.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 5px)",
            left: 0,
            minWidth: "100%",
            maxHeight: "240px",
            overflowY: "auto",
            background: PANEL_BG,
            border: `1px solid ${PANEL_BD}`,
            borderRadius: "8px",
            boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            zIndex: 200,
          }}
        >
          {options.map((opt) => (
            <DropdownItem
              key={opt}
              label={opt}
              selected={opt === value}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 13px",
        background: hovered ? "rgba(74,222,128,0.1)" : "transparent",
        border: "none",
        cursor: "pointer",
        color: selected ? ACCENT : TEXT,
        fontWeight: selected ? 600 : 400,
        fontSize: "0.8125rem",
        transition: "background 0.1s",
      }}
    >
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SiteHeader({ states, citiesByState }: SiteHeaderProps) {
  const router = useRouter();
  const [searchQ, setSearchQ] = useState("");
  const [selectedState, setSelectedState] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [btnHovered, setBtnHovered] = useState(false);

  const cities = selectedState ? (citiesByState[selectedState] ?? []) : [];

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const q = searchQ.trim();
      if (q) router.push(`/search?q=${encodeURIComponent(q)}`);
    },
    [router, searchQ]
  );

  const handleStateChange = useCallback((v: string) => {
    setSelectedState(v);
    setSelectedCity("");
  }, []);

  const handleCityChange = useCallback(
    (cityLabel: string) => {
      if (!cityLabel || !selectedState) return;
      setSelectedCity(cityLabel);
      router.push(
        `/${encodeURIComponent(selectedState)}/${encodeURIComponent(slugifyCity(cityLabel))}`
      );
    },
    [router, selectedState]
  );

  const searchInputStyle: React.CSSProperties = {
    height: "36px",
    width: "100%",
    borderRadius: RADIUS,
    border: `1px solid ${searchFocused ? GLASS_FOCUS_BD : GLASS_BD}`,
    background: searchFocused ? GLASS_FOCUS_BG : GLASS_BG,
    boxShadow: searchFocused ? GLASS_FOCUS_SHD : "none",
    color: TEXT,
    fontSize: "0.875rem",
    outline: "none",
    paddingLeft: "36px",
    paddingRight: "36px",
    transition: "border 0.15s, background 0.15s, box-shadow 0.15s",
  };

  // ── Shared elements ──────────────────────────────────────────────────────────
  const logo = (
    <Link
      href="/"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        textDecoration: "none",
        color: TEXT,
        fontWeight: 700,
        fontSize: "1.0625rem",
        letterSpacing: "-0.02em",
        flexShrink: 0,
      }}
    >
      <PawIcon />
      <span>Paw Hikes</span>
    </Link>
  );

  const searchBar = (fullWidth = false) => (
    <form
      onSubmit={handleSearchSubmit}
      style={{ position: "relative", flex: fullWidth ? "none" : 1, minWidth: 0, width: fullWidth ? "100%" : undefined }}
    >
      <SearchIcon
        style={{
          position: "absolute",
          left: "11px",
          top: "50%",
          transform: "translateY(-50%)",
          width: "14px",
          height: "14px",
          color: TEXT_DIM,
          pointerEvents: "none",
        }}
      />
      <input
        type="search"
        value={searchQ}
        onChange={(e) => setSearchQ(e.target.value)}
        onFocus={() => setSearchFocused(true)}
        onBlur={() => setSearchFocused(false)}
        placeholder="Search trails, parks, neighborhoods…"
        aria-label="Search trails"
        style={searchInputStyle}
      />
      <button
        type="submit"
        aria-label="Submit search"
        style={{
          position: "absolute",
          right: "5px",
          top: "50%",
          transform: "translateY(-50%)",
          width: "26px",
          height: "26px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "5px",
          background: "rgba(255,255,255,0.09)",
          border: "none",
          cursor: "pointer",
          color: TEXT,
        }}
      >
        <SearchIcon style={{ width: "12px", height: "12px" }} />
      </button>
    </form>
  );

  const addTrailBtn = (
    <Link
      href="/add-trail"
      onMouseEnter={() => setBtnHovered(true)}
      onMouseLeave={() => setBtnHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: "36px",
        borderRadius: RADIUS,
        background: btnHovered ? BTN_HOVER : BTN_BG,
        color: TEXT,
        fontWeight: 600,
        fontSize: "0.8125rem",
        letterSpacing: "0.01em",
        padding: "0 14px",
        textDecoration: "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "background 0.15s",
        boxShadow: "0 1px 5px rgba(0,0,0,0.2)",
      }}
    >
      + Add trail
    </Link>
  );

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: BG,
        borderBottom: "1px solid rgba(74,222,128,0.18)",
        boxShadow: "0 2px 24px rgba(0,0,0,0.28)",
      }}
    >
      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "0 1rem" }}>

        {/* ── Desktop ── */}
        <div
          className="site-header__desktop"
          style={{ height: "60px", alignItems: "center", gap: "10px" }}
        >
          {logo}

          <div style={{ flex: 1, minWidth: 0 }}>{searchBar()}</div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            <DropdownButton
              value={selectedState}
              placeholder="State"
              options={states ?? []}
              onChange={handleStateChange}
            />
            <DropdownButton
              value={selectedCity}
              placeholder="City"
              options={cities}
              onChange={handleCityChange}
              disabled={!selectedState || cities.length === 0}
            />
            {addTrailBtn}
          </div>
        </div>

        {/* ── Mobile ── */}
        <div
          className="site-header__mobile"
          style={{ flexDirection: "column", gap: "10px", padding: "12px 0" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {logo}
            {addTrailBtn}
          </div>

          {searchBar(true)}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <DropdownButton
              value={selectedState}
              placeholder="State"
              options={states ?? []}
              onChange={handleStateChange}
              width="100%"
            />
            <DropdownButton
              value={selectedCity}
              placeholder="City"
              options={cities}
              onChange={handleCityChange}
              disabled={!selectedState || cities.length === 0}
              width="100%"
            />
          </div>
        </div>

      </div>
    </header>
  );
}
