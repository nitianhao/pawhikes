import type { ReactNode } from "react";

export type TrailSectionVariant = "dog" | "conditions" | "planning" | "safety" | "highlights" | "data";

export type TrailSectionShellProps = {
  id?: string;
  title: string;
  variant?: TrailSectionVariant;
  icon?: ReactNode;
  introText?: string;
  children: ReactNode;
};

export function TrailSectionShell({
  id,
  title,
  introText,
  children,
}: TrailSectionShellProps) {
  return (
    <section
      id={id}
      className="section-card"
      style={{
        borderRadius: "1rem",
        backgroundColor: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
        border: "1px solid #e5e0d8",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      data-section-title
    >
      <div className="trail-section-shell__header">
        <span style={{
          fontSize: "0.75rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase" as const,
          color: "#a09880",
        }}>
          {title}
        </span>
      </div>
      <div className="trail-section-shell__body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {introText && (
          <p style={{ margin: 0, fontSize: "0.9375rem", color: "#3d3730", lineHeight: 1.75 }}>
            {introText}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
