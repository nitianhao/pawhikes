type RawShadeSectionProps = {
  shadeClass?: string | null;
  shadeLastComputedAt?: number | string | null;
  shadeProxyPercent?: number | null;
  shadeProxyScore?: number | null;
  shadeSources?: unknown;
};

function formatPct(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const val = x <= 1 ? x * 100 : x;
  return `${Number(val).toFixed(1)}%`;
}

function formatScore(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "—";
  return x <= 1 ? Number(x).toFixed(4) : String(x);
}

function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v.trim() || "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  return String(v);
}

export function RawShadeSection({
  shadeClass,
  shadeLastComputedAt,
  shadeProxyPercent,
  shadeProxyScore,
  shadeSources,
}: RawShadeSectionProps) {
  const lastComputedRaw = shadeLastComputedAt != null ? String(shadeLastComputedAt) : "—";
  const lastComputedDate =
    shadeLastComputedAt != null
      ? new Date(Number(shadeLastComputedAt)).toLocaleString()
      : "—";

  return (
    <section style={S.section}>
      <h2 style={S.title}>Shade (raw)</h2>
      <table style={S.table}>
        <tbody>
          <tr style={S.row}>
            <td style={S.cellLabel}>Shade class</td>
            <td style={S.cellValue}>{formatValue(shadeClass)}</td>
          </tr>
          <tr style={S.row}>
            <td style={S.cellLabel}>Shade proxy score</td>
            <td style={S.cellValue}>{formatScore(shadeProxyScore)}</td>
            <td style={S.cellLabel}>Shade proxy percent</td>
            <td style={S.cellValue}>{formatPct(shadeProxyPercent)}</td>
          </tr>
          <tr style={S.row}>
            <td style={S.cellLabel}>Last computed at</td>
            <td style={S.cellValue}>
              {lastComputedRaw}
              {lastComputedRaw !== "—" ? ` (${lastComputedDate})` : ""}
            </td>
          </tr>
        </tbody>
      </table>
      <div style={S.sourcesRow}>
        <span style={S.cellLabel}>Shade sources</span>
        <pre style={S.pre}>
          {shadeSources != null
            ? JSON.stringify(shadeSources, null, 2)
            : "—"}
        </pre>
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
  title: { margin: 0, marginBottom: "0.5rem", fontSize: "1.1rem", fontWeight: 600, color: "#111827" } as const,
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "0.85rem",
  } as const,
  row: {
    borderBottom: "1px solid #f1f5f9",
  } as const,
  cellLabel: {
    padding: "0.25rem 0.5rem 0.25rem 0",
    verticalAlign: "top",
    color: "#6b7280",
    width: "40%",
  } as const,
  cellValue: {
    padding: "0.25rem 0",
    color: "#111827",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  sourcesRow: {
    marginTop: "0.5rem",
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
  } as const,
  pre: {
    margin: 0,
    padding: "0.5rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.4rem",
    background: "#f9fafb",
    fontSize: "0.75rem",
    maxHeight: "200px",
    overflow: "auto",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
  } as const,
} as const;
