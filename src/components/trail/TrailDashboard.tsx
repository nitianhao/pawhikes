import type { ReactNode } from "react";

const baseStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: "2rem",
  marginTop: "1rem",
};

export function TrailDashboard({ children }: { children: ReactNode }) {
  return (
    <section className="trail-dashboard" style={baseStyle} aria-label="Trail insights">
      {children}
    </section>
  );
}
