/**
 * Displays all trail system fields whose key starts with "parking" in raw format.
 * Data is passed from the trail page (filtered from the system object).
 */
type ParkingRawSectionProps = {
  data: Record<string, unknown> | null;
};

function formatRawValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function ParkingRawSection({ data }: ParkingRawSectionProps) {
  if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
    return null;
  }

  const entries = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));

  return (
    <section style={S.section}>
      <h2 style={S.title}>Parking (raw)</h2>
      <p style={S.subtitle}>All DB fields starting with &quot;parking&quot;</p>
      <div style={S.content}>
        {entries.map(([key, value], i) => (
          <div
            key={key}
            style={{
              ...S.row,
              ...(i === entries.length - 1 ? S.rowLast : {}),
            }}
          >
            <span style={S.key}>{key}</span>
            <pre style={S.value}>{formatRawValue(value)}</pre>
          </div>
        ))}
      </div>
    </section>
  );
}

const S = {
  section: {
    marginTop: "1.25rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.75rem",
    padding: "0.9rem",
  } as const,
  title: { margin: 0, fontSize: "1.2rem", fontWeight: 600, color: "#111827" } as const,
  subtitle: { margin: "0.25rem 0 0", fontSize: "0.8rem", color: "#6b7280" } as const,
  content: { marginTop: "0.75rem" } as const,
  row: {
    marginBottom: "0.5rem",
    paddingBottom: "0.5rem",
    borderBottom: "1px solid #f1f5f9",
  } as const,
  rowLast: { marginBottom: 0, paddingBottom: 0, borderBottom: "none" } as const,
  key: {
    display: "block",
    fontSize: "0.8rem",
    fontFamily: "monospace",
    color: "#6b7280",
    marginBottom: "0.2rem",
  } as const,
  value: {
    margin: 0,
    fontSize: "0.8rem",
    fontFamily: "monospace",
    color: "#111827",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "#f8fafc",
    padding: "0.4rem 0.5rem",
    borderRadius: "0.35rem",
    border: "1px solid #e5e7eb",
    overflow: "auto",
    maxHeight: "12rem",
  } as const,
} as const;
