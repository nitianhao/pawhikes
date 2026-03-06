import { Shovel, Snowflake, ThermometerSnowflake } from "lucide-react";

export type WinterSectionProps = {
  winterClass?: string | null;
  winterScore?: number | null;
  winterLikelyMaintained?: boolean | null;
  winterReasons?: string[] | string | null;
  winterLastComputedAt?: number | string | null;
};

const CLASS_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: "#dcfce7", text: "#166534" },
  medium: { bg: "#fef3c7", text: "#b45309" },
  high: { bg: "#fee2e2", text: "#b91c1c" },
};

function toPercent(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return 0;
  const pct = score <= 1 ? Math.round(score * 100) : Math.round(score);
  return Math.max(0, Math.min(100, pct));
}

function classLabel(cls: string | null | undefined): string {
  const c = String(cls ?? "").trim().toLowerCase();
  if (c === "low") return "Good winter option";
  if (c === "medium") return "Mixed winter conditions";
  if (c === "high") return "Winter caution";
  return c ? `${c.charAt(0).toUpperCase()}${c.slice(1)}` : "Winter unknown";
}

function maintainedLabel(maintained: boolean | null | undefined): string {
  if (maintained === true) return "Likely maintained";
  if (maintained === false) return "Not likely maintained";
  return "Maintenance unknown";
}

function reasonsToBullets(reasons: string[] | string | null | undefined): string[] {
  if (reasons == null) return [];
  if (Array.isArray(reasons)) return reasons.map((s) => String(s).trim()).filter(Boolean);
  const s = String(reasons).trim();
  if (!s) return [];
  if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean);
  return [s];
}

function formatDate(ms: number | string | null | undefined): string {
  if (ms == null) return "—";
  const n = typeof ms === "string" ? Number(ms) : ms;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return String(ms);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function hasPavedOrUrban(reasons: string[]): boolean {
  const text = reasons.join(" ").toLowerCase();
  return text.includes("paved") || text.includes("urban");
}

function guidanceText(
  winterClass: string | null | undefined,
  maintained: boolean | null | undefined
): string {
  const cls = String(winterClass ?? "").trim().toLowerCase();
  let line = "";
  if (cls === "low") {
    line = "Generally workable in winter. Still watch for icy bridges and shaded patches.";
  } else if (cls === "medium") {
    line = "Conditions may vary—expect some slick spots after freezes or rain.";
  } else if (cls === "high") {
    line = "Higher winter risk—choose midday, stick to main paths, and avoid after freeze-thaw.";
  }
  if (maintained === false && line) {
    line += " Maintenance is unlikely—expect debris/ice to linger.";
  } else if (maintained === false) {
    line = "Maintenance is unlikely—expect debris/ice to linger.";
  }
  return line;
}

export function WinterSection({
  winterClass,
  winterScore,
  winterLikelyMaintained,
  winterReasons,
  winterLastComputedAt,
}: WinterSectionProps) {
  const hasAny =
    winterClass != null ||
    winterScore != null ||
    winterLikelyMaintained != null ||
    winterReasons != null ||
    winterLastComputedAt != null;

  if (!hasAny) return null;

  const pct = toPercent(winterScore);
  const label = classLabel(winterClass);
  const classKey = String(winterClass ?? "").trim().toLowerCase();
  const classStyle = CLASS_COLORS[classKey] ?? { bg: "#f1f5f9", text: "#475569" };
  const maintainedStr = maintainedLabel(winterLikelyMaintained);
  const bullets = reasonsToBullets(winterReasons);
  const showPavedChip = hasPavedOrUrban(bullets);
  const guidance = guidanceText(winterClass, winterLikelyMaintained);
  const visibleReasons = bullets.slice(0, 3);
  const moreCount = bullets.length - 3;

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <h2 style={S.title}>
          <Snowflake size={18} style={{ marginRight: "0.35rem", verticalAlign: "middle" }} />
          Winter
        </h2>
        <p style={S.subtitle}>Cold-weather usability</p>
      </div>

      <div style={S.headlineRow}>
        <span
          style={{
            ...S.badge,
            background: classStyle.bg,
            color: classStyle.text,
          }}
        >
          {label}
        </span>
        <span style={S.scorePill}>{pct}/100</span>
      </div>

      <div style={S.gaugeRow}>
        <ThermometerSnowflake size={14} style={{ flexShrink: 0, color: "#6b7280" }} />
        <span style={S.gaugeMuted}>Winter suitability</span>
        <span style={S.gaugePct}>{pct}%</span>
      </div>
      <div
        style={S.barOuter}
        title={`Winter score: ${pct}%`}
      >
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            minWidth: pct > 0 ? "2px" : 0,
            borderRadius: "9999px",
            background: classStyle.text,
            transition: "width 0.2s",
          }}
        />
      </div>

      <div style={S.chipsRow}>
        <div style={S.chip}>
          <Snowflake size={14} style={{ flexShrink: 0, color: "#6b7280" }} />
          <span>Suitability: {pct}/100</span>
        </div>
        <div style={S.chip}>
          <Shovel size={14} style={{ flexShrink: 0, color: "#6b7280" }} />
          <span>Maintenance: {maintainedStr}</span>
        </div>
        {showPavedChip ? (
          <div style={S.chip}>
            <span>More hard surfaces</span>
          </div>
        ) : null}
      </div>

      {guidance ? (
        <p style={S.guidance} title={guidance}>
          {guidance}
        </p>
      ) : null}

      {visibleReasons.length > 0 ? (
        <div style={S.reasonsBlock}>
          <ul style={S.bullets}>
            {visibleReasons.map((r, i) => (
              <li key={i} style={S.bullet}>
                {r}
              </li>
            ))}
          </ul>
          {moreCount > 0 ? (
            <details style={S.moreDetails}>
              <summary style={S.detailsSummary}>Show all reasons (+{moreCount} more)</summary>
              <ul style={S.bullets}>
                {bullets.map((r, i) => (
                  <li key={i} style={S.bullet}>
                    {r}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <details style={S.dataDetails}>
        <summary style={S.detailsSummary}>Data details</summary>
        <div style={S.detailsInner}>
          <div style={S.detailRow}>
            <span style={S.detailKey}>winterClass</span>
            <span style={S.detailVal}>{winterClass ?? "—"}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>winterScore (raw)</span>
            <span style={S.detailVal}>
              {winterScore != null && Number.isFinite(winterScore) ? String(winterScore) : "—"}
            </span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>winterScore (pct)</span>
            <span style={S.detailVal}>{pct}%</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>winterLikelyMaintained</span>
            <span style={S.detailVal}>
              {winterLikelyMaintained === true ? "true" : winterLikelyMaintained === false ? "false" : "—"}
            </span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>winterLastComputedAt</span>
            <span style={S.detailVal}>
              {winterLastComputedAt != null ? String(winterLastComputedAt) : "—"} ({formatDate(winterLastComputedAt)})
            </span>
          </div>
          <div style={{ marginTop: "0.35rem" }}>
            <span style={S.detailKey}>winterReasons</span>
            {Array.isArray(winterReasons) ? (
              <pre style={S.rawPre}>{JSON.stringify(winterReasons, null, 2)}</pre>
            ) : winterReasons != null ? (
              <span style={S.detailVal}>{String(winterReasons)}</span>
            ) : (
              <span style={S.detailVal}>—</span>
            )}
          </div>
        </div>
      </details>
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
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
  } as const,
  title: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 600,
    color: "#111827",
    display: "inline-flex",
    alignItems: "center",
  } as const,
  subtitle: { margin: 0, fontSize: "0.85rem", color: "#6b7280" } as const,
  headlineRow: {
    marginTop: "0.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.6rem",
    flexWrap: "wrap" as const,
  } as const,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.35rem 0.65rem",
    borderRadius: "999px",
    fontSize: "0.9rem",
    fontWeight: 700,
  } as const,
  scorePill: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#111827",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  gaugeRow: {
    marginTop: "0.5rem",
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  } as const,
  gaugeMuted: { fontSize: "0.75rem", color: "#6b7280" } as const,
  gaugePct: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#111827",
    fontVariantNumeric: "tabular-nums" as const,
    marginLeft: "auto",
  } as const,
  barOuter: {
    marginTop: "0.2rem",
    height: "8px",
    width: "100%",
    borderRadius: "9999px",
    overflow: "hidden",
    background: "#e5e7eb",
  } as const,
  chipsRow: {
    marginTop: "0.5rem",
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.4rem",
  } as const,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.5rem",
    background: "white",
    padding: "0.3rem 0.55rem",
    fontSize: "0.82rem",
    color: "#374151",
  } as const,
  guidance: {
    marginTop: "0.5rem",
    fontSize: "0.85rem",
    lineHeight: 1.45,
    color: "#374151",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  } as const,
  reasonsBlock: { marginTop: "0.5rem" } as const,
  bullets: {
    margin: 0,
    paddingLeft: "1.25rem",
  } as const,
  bullet: { margin: "0.2rem 0", fontSize: "0.82rem", color: "#374151" } as const,
  moreDetails: { marginTop: "0.25rem" } as const,
  dataDetails: { marginTop: "0.6rem" } as const,
  detailsSummary: {
    cursor: "pointer",
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "#374151",
  } as const,
  detailsInner: { marginTop: "0.5rem", paddingLeft: "0.25rem" } as const,
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
    padding: "0.2rem 0",
    fontSize: "0.8rem",
    borderBottom: "1px solid #f1f5f9",
  } as const,
  detailKey: { color: "#6b7280", fontFamily: "monospace", fontSize: "0.78rem" } as const,
  detailVal: { fontSize: "0.78rem", color: "#111827", wordBreak: "break-word" as const } as const,
  rawPre: {
    margin: "0.25rem 0 0",
    fontSize: "0.72rem",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    background: "#f8fafc",
    padding: "0.35rem",
    borderRadius: "0.35rem",
    border: "1px solid #e5e7eb",
    maxHeight: "8rem",
    overflow: "auto",
  } as const,
} as const;
