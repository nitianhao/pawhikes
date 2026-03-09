import Link from "next/link";
import { HeaderNav } from "@/components/site/HeaderNav";
import { HeaderSearch } from "@/components/site/HeaderSearch";

function PawIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      style={{ color: "#4ade80", flexShrink: 0 }}
    >
      <ellipse cx="6.5" cy="3.5" rx="1.5" ry="2" />
      <ellipse cx="11" cy="2.5" rx="1.5" ry="2" />
      <ellipse cx="15.5" cy="3.5" rx="1.5" ry="2" />
      <ellipse cx="19" cy="7" rx="1.5" ry="2" />
      <path d="M12 8c-3.5 0-7 2.5-7 6.5 0 2.5 1.5 5 4 5.5.8.2 2 .5 3 .5s2.2-.3 3-.5c2.5-.5 4-3 4-5.5C19 10.5 15.5 8 12 8z" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="site-header-root">
      <div className="site-header-shell">
        <div className="site-header-row1">
          <div className="site-header-zone site-header-zone--logo">
            <Link href="/" className="site-header-logo">
              <PawIcon />
              <span>Paw Hikes</span>
            </Link>
          </div>

          <div className="site-header-zone site-header-zone--search">
            <HeaderSearch />
          </div>

          <div className="site-header-zone site-header-zone--nav">
            <HeaderNav />
          </div>

          <div className="site-header-zone site-header-zone--cta">
            <Link href="/add-trail" className="site-header-add site-header-add--desktop">
              + Add trail
            </Link>
          </div>
        </div>

        <div className="site-header-row2">
          <HeaderSearch mobile />
        </div>
      </div>
    </header>
  );
}
