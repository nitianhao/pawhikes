import { Bike, Dog, Mountain, Route, Waves } from "lucide-react";

type HazardsSectionProps = {
  hazards?: Record<string, unknown> | null;
  hazardsClass?: string | null;
  hazardsScore?: number | null;
  hazardsReasons?: string | string[] | null;
  hazardsLastComputedAt?: number | string | null;
};

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

function formatScore(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return Number(score).toFixed(2);
}

function scoreToPercent(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(score)) return "—";
  return `${Math.round(score * 100)}`;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function getHazardCounts(hazards: Record<string, unknown> | null | undefined) {
  const o = hazards && typeof hazards === "object" ? hazards : {};
  const road = o.roadCrossings && typeof o.roadCrossings === "object" ? (o.roadCrossings as { count?: number; riskyCount?: number }) : {};
  return {
    roadTotal: asNumber(road.count) ?? 0,
    roadRisky: asNumber(road.riskyCount) ?? 0,
    water: asNumber((o.waterCrossings as { count?: number })?.count) ?? 0,
    cliff: asNumber((o.cliffOrSteepEdge as { count?: number })?.count) ?? 0,
    bike: asNumber((o.bikeConflictProxy as { count?: number })?.count) ?? 0,
    offLeash: asNumber((o.offLeashConflictProxy as { count?: number })?.count) ?? 0,
  };
}

function reasonsToBullets(reasons: string | string[] | null | undefined): string[] {
  if (reasons == null) return [];
  if (Array.isArray(reasons)) return reasons.filter((s) => String(s).trim());
  const s = String(reasons).trim();
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function classLabel(cls: string | null | undefined): string {
  const c = String(cls ?? "").trim().toLowerCase();
  if (c === "low") return "Low";
  if (c === "medium") return "Medium";
  if (c === "high") return "High";
  return cls ? String(cls) : "—";
}

function primaryConcerns(counts: ReturnType<typeof getHazardCounts>): string[] {
  const parts: string[] = [];
  if (counts.roadRisky > 0) parts.push(`Road crossings (${counts.roadRisky} risky)`);
  if (counts.bike > 0) parts.push(`Bike conflict (${counts.bike})`);
  if (counts.water > 0 && parts.length < 2) parts.push(`Water crossings (${counts.water})`);
  if (counts.cliff > 0 && parts.length < 2) parts.push(`Cliff/steep edge (${counts.cliff})`);
  if (counts.offLeash > 0 && parts.length < 2) parts.push(`Off-leash proxy (${counts.offLeash})`);
  return parts.slice(0, 2);
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
    flexWrap: "wrap" as const,
  } as const,
  title: { margin: 0, fontSize: "1.2rem", fontWeight: 600, color: "#111827" } as const,
  updated: { margin: 0, fontSize: "0.8rem", color: "#6b7280" } as const,
  headline: {
    marginTop: "0.5rem",
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
    flexWrap: "wrap" as const,
  } as const,
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "0.25rem 0.6rem",
    borderRadius: "999px",
    fontSize: "0.9rem",
    fontWeight: 700,
  } as const,
  scoreLine: { fontSize: "0.9rem", color: "#374151", fontWeight: 600 } as const,
  bullets: {
    marginTop: "0.4rem",
    paddingLeft: "1.25rem",
  } as const,
  bullet: { margin: "0.2rem 0", fontSize: "0.85rem", color: "#374151" } as const,
  primaryLine: {
    marginTop: "0.5rem",
    fontSize: "0.85rem",
    color: "#475569",
  } as const,
  tilesGrid: {
    marginTop: "0.75rem",
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "0.5rem",
  } as const,
  tile: {
    border: "1px solid #e5e7eb",
    borderRadius: "0.55rem",
    padding: "0.5rem 0.6rem",
    background: "#fafafa",
  } as const,
  tileIcon: { display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.2rem" } as const,
  tileLabel: { fontSize: "0.75rem", color: "#6b7280" } as const,
  tileCount: { fontSize: "1.1rem", fontWeight: 700, color: "#111827" } as const,
  tileRisky: { fontSize: "0.8rem", color: "#b45309", fontWeight: 600 } as const,
  details: { marginTop: "0.75rem" } as const,
  detailsSummary: {
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "#374151",
  } as const,
  detailsInner: { marginTop: "0.5rem", paddingLeft: "0.5rem" } as const,
  detailRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.5rem",
    padding: "0.2rem 0",
    fontSize: "0.8rem",
    borderBottom: "1px solid #f1f5f9",
  } as const,
  detailKey: { color: "#6b7280" } as const,
  detailVal: { fontFamily: "monospace", fontSize: "0.78rem", color: "#111827" } as const,
  rawPre: {
    marginTop: "0.5rem",
    padding: "0.5rem",
    border: "1px solid #e5e7eb",
    borderRadius: "0.45rem",
    background: "#f8fafc",
    fontSize: "0.72rem",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: "200px",
    overflow: "auto",
  } as const,
};

const CLASS_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: "#dcfce7", text: "#166534" },
  medium: { bg: "#fef3c7", text: "#b45309" },
  high: { bg: "#fee2e2", text: "#b91c1c" },
};

export function HazardsSection({
  hazards,
  hazardsClass,
  hazardsScore,
  hazardsReasons,
  hazardsLastComputedAt,
}: HazardsSectionProps) {
  const counts = getHazardCounts(hazards);
  const bullets = reasonsToBullets(hazardsReasons);
  const primary = primaryConcerns(counts);
  const classKey = String(hazardsClass ?? "").trim().toLowerCase();
  const classStyle = CLASS_COLORS[classKey] ?? { bg: "#f1f5f9", text: "#475569" };
  const rawReasonsStr = Array.isArray(hazardsReasons)
    ? hazardsReasons.join(", ")
    : (hazardsReasons != null ? String(hazardsReasons) : "");

  const hasAnyData =
    hazards != null ||
    hazardsClass != null ||
    hazardsScore != null ||
    hazardsReasons != null ||
    hazardsLastComputedAt != null;

  if (!hasAnyData) return null;

  return (
    <section style={S.section}>
      <div style={S.headerRow}>
        <h2 style={S.title}>Hazards</h2>
        <p style={S.updated}>Updated: {formatDate(hazardsLastComputedAt)}</p>
      </div>

      <div style={S.headline}>
        <span
          style={{
            ...S.badge,
            background: classStyle.bg,
            color: classStyle.text,
          }}
        >
          {classLabel(hazardsClass)}
        </span>
        <span style={S.scoreLine}>
          Risk score: {formatScore(hazardsScore)}
          {hazardsScore != null && Number.isFinite(hazardsScore) ? (
            <span style={{ marginLeft: "0.35rem", color: "#6b7280", fontWeight: 500 }}>
              ({scoreToPercent(hazardsScore)}/100)
            </span>
          ) : null}
        </span>
      </div>

      {bullets.length > 0 ? (
        <ul style={S.bullets}>
          {bullets.map((b, i) => (
            <li key={i} style={S.bullet}>
              {b}
            </li>
          ))}
        </ul>
      ) : null}

      {primary.length > 0 ? (
        <p style={S.primaryLine}>
          Primary concerns: {primary.join(", ")}
        </p>
      ) : null}

      <div style={S.tilesGrid}>
        <div style={S.tile}>
          <div style={S.tileIcon}>
            <Route size={16} style={{ color: "#6366f1" }} />
            <span style={S.tileLabel}>Road crossings</span>
          </div>
          <div style={S.tileCount}>Total: {counts.roadTotal}</div>
          {counts.roadRisky > 0 ? (
            <div style={S.tileRisky}>Risky: {counts.roadRisky}</div>
          ) : null}
        </div>
        <div style={S.tile}>
          <div style={S.tileIcon}>
            <Waves size={16} style={{ color: "#0ea5e9" }} />
            <span style={S.tileLabel}>Water crossings</span>
          </div>
          <div style={S.tileCount}>{counts.water}</div>
        </div>
        <div style={S.tile}>
          <div style={S.tileIcon}>
            <Mountain size={16} style={{ color: "#78716c" }} />
            <span style={S.tileLabel}>Cliff / steep edge</span>
          </div>
          <div style={S.tileCount}>{counts.cliff}</div>
        </div>
        <div style={S.tile}>
          <div style={S.tileIcon}>
            <Bike size={16} style={{ color: "#059669" }} />
            <span style={S.tileLabel}>Bike conflict</span>
          </div>
          <div style={S.tileCount}>{counts.bike}</div>
        </div>
        <div style={S.tile}>
          <div style={S.tileIcon}>
            <Dog size={16} style={{ color: "#a16207" }} />
            <span style={S.tileLabel}>Off-leash conflict proxy</span>
          </div>
          <div style={S.tileCount}>{counts.offLeash}</div>
        </div>
      </div>

      <details style={S.details}>
        <summary style={S.detailsSummary}>See full hazard data</summary>
        <div style={S.detailsInner}>
          <div style={S.detailRow}>
            <span style={S.detailKey}>hazardsClass</span>
            <span style={S.detailVal}>{hazardsClass ?? "—"}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>hazardsScore</span>
            <span style={S.detailVal}>{hazardsScore != null ? String(hazardsScore) : "—"}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>hazardsLastComputedAt</span>
            <span style={S.detailVal}>
              {hazardsLastComputedAt != null ? String(hazardsLastComputedAt) : "—"} ({formatDate(hazardsLastComputedAt)})
            </span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>hazardsReasons (raw)</span>
            <span style={{ ...S.detailVal, maxWidth: "70%", wordBreak: "break-word" }}>
              {rawReasonsStr || "—"}
            </span>
          </div>
          <div style={{ marginTop: "0.35rem" }}>
            <span style={S.detailKey}>hazards (object)</span>
            <pre style={S.rawPre}>
              {hazards != null ? JSON.stringify(hazards, null, 2) : "—"}
            </pre>
          </div>
        </div>
      </details>
    </section>
  );
}
