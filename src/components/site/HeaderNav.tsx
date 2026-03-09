import Link from "next/link";
import { Menu } from "lucide-react";

const NAV_ITEMS = [
  { label: "Browse", href: "/" },
  { label: "Cities", href: "/#coverage" },
  { label: "Dog needs", href: "/#dog-needs" },
  { label: "About", href: "/#why-paw-hikes" },
] as const;

export function HeaderNav() {
  return (
    <>
      <nav className="site-header-nav site-header-nav--desktop" aria-label="Primary">
        {NAV_ITEMS.map((item) => (
          <Link key={item.label} href={item.href} className="site-header-nav__link">
            {item.label}
          </Link>
        ))}
      </nav>

      <details className="site-header-menu site-header-nav--mobile">
        <summary className="site-header-menu__button" aria-label="Open menu">
          <Menu size={18} aria-hidden="true" />
        </summary>
        <div className="site-header-menu__panel">
          <nav aria-label="Mobile primary">
            {NAV_ITEMS.map((item) => (
              <Link key={item.label} href={item.href} className="site-header-menu__link">
                {item.label}
              </Link>
            ))}
            <Link href="/add-trail" className="site-header-menu__cta">
              + Add trail
            </Link>
          </nav>
        </div>
      </details>
    </>
  );
}
