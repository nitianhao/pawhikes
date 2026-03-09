import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Droplets,
  Footprints,
  Gauge,
  HeartPulse,
  PawPrint,
  Route,
  TreePine,
  Users,
} from "lucide-react";

type DogNeedShortcut = {
  label: string;
  query: string;
  Icon: LucideIcon;
};

const SHORTCUTS: DogNeedShortcut[] = [
  { label: "Easy walks", query: "easy", Icon: Footprints },
  { label: "Lots of shade", query: "shade", Icon: TreePine },
  { label: "Water access", query: "water", Icon: Droplets },
  { label: "Low traffic trails", query: "quiet", Icon: Users },
  { label: "Good for senior dogs", query: "senior", Icon: HeartPulse },
  { label: "Good for small dogs", query: "small-dogs", Icon: PawPrint },
  { label: "Long energy-burning trails", query: "long-trails", Icon: Route },
  { label: "Smooth surfaces (paws)", query: "smooth-surface", Icon: Gauge },
];

function shortcutHref(query: string): string {
  return `/search?q=${encodeURIComponent(query)}`;
}

export function DogNeedShortcuts() {
  return (
    <section
      id="dog-needs"
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: "14px",
        background: "#fff",
        padding: "1.25rem",
      }}
    >
      <div style={{ marginBottom: "0.875rem" }}>
        <h2 style={{ fontSize: "1.2rem", marginBottom: "0.2rem", color: "#111827" }}>
          Find Dog Hikes by Need
        </h2>
        <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
          Choose a dog-hike need to filter trails by comfort and conditions.
        </p>
      </div>

      <ul className="dog-needs-grid" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {SHORTCUTS.map(({ label, query, Icon }) => (
          <li key={query}>
            <Link href={shortcutHref(query)} className="dog-needs-chip">
              <span className="dog-needs-icon-wrap" aria-hidden="true">
                <Icon size={16} />
              </span>
              <span className="dog-needs-chip__bottom">
                <span className="dog-needs-label">{label}</span>
                <span className="dog-needs-chip__arrow" aria-hidden="true">→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
