import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

export type TrailSectionVariant = "dog" | "conditions" | "planning" | "safety" | "highlights" | "data";

const variantBandBg: Record<TrailSectionVariant, string> = {
  dog:        "#dcfce7",
  conditions: "#fef3c7",
  planning:   "#dcfce7",
  safety:     "#fee2e2",
  highlights: "#ede9fe",
  data:       "#f1f5f9",
};

const variantAccentColor: Record<TrailSectionVariant, string> = {
  dog:        "#15803d",
  conditions: "#b45309",
  planning:   "#15803d",
  safety:     "#b91c1c",
  highlights: "#6d28d9",
  data:       "#475569",
};

export type TrailSectionShellProps = {
  id?: string;
  title: string;
  variant?: TrailSectionVariant;
  icon?: ReactNode;
  children: ReactNode;
};

/**
 * Shared section shell: full-width header band + one content grid (12-col, same gutters).
 * No nested max-width or extra padding inside the body.
 */
export function TrailSectionShell({
  id,
  title,
  variant = "data",
  icon,
  children,
}: TrailSectionShellProps) {
  const bandBg = variantBandBg[variant];
  const accentColor = variantAccentColor[variant];
  const defaultIcon = variant === "safety" ? <ShieldCheck size={16} aria-hidden /> : null;
  const bandIcon = icon ?? defaultIcon;

  return (
    <section
      id={id}
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      data-section-title
    >
      {/* Full-width header band — spans 100%, same horizontal padding as content */}
      <div
        className="flex w-full items-center gap-2.5 px-4 py-3 lg:px-6 lg:py-3"
        style={{ backgroundColor: bandBg }}
        aria-hidden={false}
      >
        {bandIcon ? (
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white"
            style={{
              backgroundColor: variant === "safety" ? "#dc2626" : accentColor,
            }}
          >
            {bandIcon}
          </div>
        ) : null}
        <h2
          className="m-0 text-[0.8125rem] font-bold uppercase tracking-wider"
          style={{ color: accentColor }}
        >
          {title}
        </h2>
      </div>

      {/* Single content grid — one layout system for all children */}
      <div className="grid grid-cols-12 gap-4 p-4 lg:gap-6 lg:p-6">
        {children}
      </div>
    </section>
  );
}
