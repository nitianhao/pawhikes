"use client";

import { useEffect } from "react";

/**
 * Client-only enhancer: when the URL hash matches a section id that contains
 * a <details> (e.g. #rules, #trail-conditions), open that details so the
 * linked content is visible. Does not affect SSR or content visibility.
 */
export function CollapsibleSectionHashOpener() {
  useEffect(() => {
    const openDetailsForHash = () => {
      const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      if (!hash) return;
      const section = document.getElementById(hash);
      if (!section) return;
      const details = section.querySelector("details");
      if (details) details.setAttribute("open", "");
    };

    openDetailsForHash();
    window.addEventListener("hashchange", openDetailsForHash);
    return () => window.removeEventListener("hashchange", openDetailsForHash);
  }, []);

  return null;
}
