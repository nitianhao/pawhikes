"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type NavItem = { id: string; label: string };

const ALL_NAV_ITEMS: NavItem[] = [
  { id: "dogfit",   label: "Dog Fit" },
  { id: "safety",   label: "Safety" },
  { id: "terrain",  label: "Terrain" },
  { id: "access",   label: "Access" },
  { id: "map",      label: "Map" },
  { id: "explore",  label: "Highlights" },
  { id: "rules",    label: "Rules" },
  { id: "faqs",     label: "FAQ" },
];

export function SectionNav() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<NavItem[]>([]);
  const navRef = useRef<HTMLElement>(null);
  const btnRefs = useRef<Record<string, HTMLAnchorElement | null>>({});

  // Detect which section IDs are actually present in the DOM
  useEffect(() => {
    const present = ALL_NAV_ITEMS.filter(
      item => document.getElementById(item.id) !== null
    );
    setItems(present);
  }, []);

  // Keep sticky top in sync with actual header height (header is also sticky)
  useEffect(() => {
    const header = document.querySelector(".site-header-root") as HTMLElement | null;
    const nav = navRef.current;
    if (!header || !nav) return;

    const sync = () => { nav.style.top = `${header.offsetHeight}px`; };
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, [items]);

  // IntersectionObserver: track which sections are in the reading area
  useEffect(() => {
    if (items.length === 0) return;
    const ids = items.map(i => i.id);
    const inView = new Set<string>();

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          entry.isIntersecting
            ? inView.add(entry.target.id)
            : inView.delete(entry.target.id);
        });
        // Highlight the first (topmost) section currently in the reading window
        const first = ids.find(id => inView.has(id));
        if (first) setActiveId(first);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 }
    );

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [items]);

  // Scroll the active pill into the center of the nav bar
  useEffect(() => {
    if (!activeId || !navRef.current) return;
    const btn = btnRefs.current[activeId];
    if (!btn) return;
    const nav = navRef.current;
    const center = btn.offsetLeft - nav.clientWidth / 2 + btn.offsetWidth / 2;
    nav.scrollTo({ left: center, behavior: "smooth" });
  }, [activeId]);

  // Click: smooth-scroll to section, offset by header + this nav bar
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      const el = document.getElementById(id);
      if (!el) return;
      const header = document.querySelector(".site-header-root") as HTMLElement | null;
      const nav = navRef.current;
      const offset = (header?.offsetHeight ?? 0) + (nav?.offsetHeight ?? 0) + 4;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: "smooth" });
      setActiveId(id);
    },
    []
  );

  if (items.length === 0) return null;

  return (
    <nav
      className="section-nav-mobile"
      aria-label="Jump to section"
      ref={navRef}
    >
      {items.map(item => (
        <a
          key={item.id}
          href={`#${item.id}`}
          ref={el => { btnRefs.current[item.id] = el; }}
          className={
            activeId === item.id
              ? "section-nav-item section-nav-item--active"
              : "section-nav-item"
          }
          aria-current={activeId === item.id ? "location" : undefined}
          onClick={e => handleClick(e, item.id)}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
