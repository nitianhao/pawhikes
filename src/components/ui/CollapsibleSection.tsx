import type { ReactNode } from "react";

const styles = {
  section: { marginTop: "1.25rem" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    marginBottom: "0.5rem",
  },
  heading: {
    fontSize: "1.125rem",
    fontWeight: 600,
    margin: 0,
    color: "#111827",
  },
  meta: { fontSize: "0.875rem", color: "#6b7280" },
  details: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    backgroundColor: "rgba(255,255,255,0.6)",
    overflow: "hidden",
  },
  summary: {
    cursor: "pointer",
    listStyle: "none" as const,
    padding: "0.75rem 1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    outlineOffset: 2,
  },
  toggleBadge: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.375rem",
    padding: "0.25rem 0.5rem",
    fontSize: "0.875rem",
    color: "#374151",
  },
  summaryLabel: { fontSize: "0.875rem", color: "#6b7280" },
  content: { padding: "1rem", paddingTop: "0.5rem" },
};

export function CollapsibleSection({
  id,
  title,
  defaultOpen = false,
  meta,
  children,
}: {
  id?: string;
  title: string;
  defaultOpen?: boolean;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} style={styles.section}>
      <div style={styles.header}>
        <h2 style={styles.heading} data-section-title>
          {title}
        </h2>
        {meta ? <div style={styles.meta}>{meta}</div> : null}
      </div>
      <details open={defaultOpen} style={styles.details}>
        <summary style={styles.summary} className="collapsible-summary">
          <span style={styles.summaryLabel}>Show / hide</span>
          <span style={styles.toggleBadge}>Toggle</span>
        </summary>
        <div style={styles.content}>{children}</div>
      </details>
    </section>
  );
}
