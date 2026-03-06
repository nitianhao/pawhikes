import type { ReactNode } from "react";

const styles = {
  section: { marginTop: "0.875rem" },
  header: {
    display: "flex",
    alignItems: "flex-start",
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
  summaryCard: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    backgroundColor: "#fff",
    padding: "0.75rem 1rem",
  },
  details: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    backgroundColor: "#fff",
    overflow: "hidden",
    marginTop: "0.5rem",
  },
  summaryTrigger: {
    cursor: "pointer",
    listStyle: "none" as const,
    padding: "0.75rem 1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    outlineOffset: 2,
  },
  summaryLabel: { fontSize: "0.875rem", color: "#6b7280" },
  expandBadge: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.375rem",
    padding: "0.25rem 0.5rem",
    fontSize: "0.875rem",
    color: "#374151",
  },
  detailsContent: { padding: "1rem", paddingTop: "0.5rem" },
};

export type SectionCardProps = {
  id?: string;
  title: string;
  summary: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function SectionCard({
  id,
  title,
  summary,
  meta,
  defaultOpen = false,
  children,
}: SectionCardProps) {
  return (
    <section id={id} style={styles.section}>
      <div style={styles.header}>
        <h2 style={styles.heading} data-section-title>
          {title}
        </h2>
        {meta ? <div style={styles.meta}>{meta}</div> : null}
      </div>

      <div style={styles.summaryCard}>{summary}</div>

      <details open={defaultOpen} style={styles.details}>
        <summary style={styles.summaryTrigger} className="collapsible-summary">
          <span style={styles.summaryLabel}>Details</span>
          <span style={styles.expandBadge}>Expand</span>
        </summary>
        <div style={styles.detailsContent}>{children}</div>
      </details>
    </section>
  );
}

const chipStyle = {
  display: "inline-block",
  padding: "0.2rem 0.5rem",
  borderRadius: "0.375rem",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "#374151",
  backgroundColor: "#f3f4f6",
  border: "1px solid #e5e7eb",
  marginRight: "0.35rem",
  marginBottom: "0.35rem",
};

export function Chip({ children }: { children: ReactNode }) {
  return <span style={chipStyle}>{children}</span>;
}
