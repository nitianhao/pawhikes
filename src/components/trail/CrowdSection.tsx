import {
  Activity,
  Building2,
  Bus,
  Car,
  Coffee,
  DoorOpen,
  Info,
  Users,
} from "lucide-react";

export type CrowdSectionProps = {
  crowdClass?: string | null;
  crowdProxyScore?: number | null;
  crowdReasons?: string | string[] | null;
  crowdSignals?: Record<string, unknown> | null;
  crowdLastComputedAt?: number | string | null;
};

const DRIVER_ORDER = [
  "entranceCount",
  "parkingScore",
  "busStopCount",
  "urbanScore",
  "amenityScore",
] as const;

const DRIVER_CONFIG: Record<
  string,
  { label: string; icon: typeof DoorOpen; isScore: boolean }
> = {
  entranceCount: { label: "Entrances", icon: DoorOpen, isScore: false },
  parkingScore: { label: "Parking", icon: Car, isScore: true },
  busStopCount: { label: "Transit", icon: Bus, isScore: false },
  urbanScore: { label: "Urban", icon: Building2, isScore: true },
  amenityScore: { label: "Amenities", icon: Coffee, isScore: true },
};

function normalizeScorePercent(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return 0;
  const pct = score <= 1 ? Math.round(score * 100) : Math.round(score);
  return Math.max(0, Math.min(100, pct));
}

function classLabel(cls: string | null | undefined): string {
  const c = String(cls ?? "").trim().toLowerCase();
  if (c === "low") return "Usually quiet";
  if (c === "medium") return "Moderately busy";
  if (c === "high") return "Often busy";
  if (c === "unknown") return "Crowd unknown";
  return c ? `${c.charAt(0).toUpperCase()}${c.slice(1)}` : "Crowd unknown";
}

function formatUpdated(ms: number | string | null | undefined): string {
  if (ms == null) return "—";
  const n = typeof ms === "string" ? Number(ms) : ms;
  const d = new Date(n);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getClassStyle(
  cls: string | null | undefined
): { bg: string; text: string } {
  const c = String(cls ?? "").trim().toLowerCase();
  if (c === "low") return { bg: "#dcfce7", text: "#166534" };
  if (c === "medium") return { bg: "#fef3c7", text: "#b45309" };
  if (c === "high") return { bg: "#fee2e2", text: "#b91c1c" };
  return { bg: "#f1f5f9", text: "#475569" };
}

function getDriverChips(
  signals: Record<string, unknown> | null | undefined
): Array<{ key: string; label: string; display: string; icon: typeof DoorOpen }> {
  if (!signals || typeof signals !== "object") return [];
  const chips: Array<{
    key: string;
    label: string;
    display: string;
    icon: typeof DoorOpen;
  }> = [];
  for (const key of DRIVER_ORDER) {
    const config = DRIVER_CONFIG[key];
    if (!config) continue;
    const raw = signals[key];
    if (raw == null) continue;
    const num =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : typeof raw === "string"
          ? Number(raw)
          : null;
    if (num == null || !Number.isFinite(num)) continue;
    const display = config.isScore
      ? `${Math.round(num <= 1 ? num * 100 : num)}%`
      : `${Math.round(num)}${key === "busStopCount" ? " stops" : ""}`;
    chips.push({
      key,
      label: config.label,
      display,
      icon: config.icon,
    });
  }
  return chips.slice(0, 5);
}

function getDogTip(
  crowdClass: string | null | undefined,
  signals: Record<string, unknown> | null | undefined
): string {
  const cls = String(crowdClass ?? "").trim().toLowerCase();
  const entranceCount =
    typeof signals?.entranceCount === "number"
      ? signals.entranceCount
      : Number(signals?.entranceCount) || 0;
  const busStopCount =
    typeof signals?.busStopCount === "number"
      ? signals.busStopCount
      : Number(signals?.busStopCount) || 0;
  const busyNearAccess =
    entranceCount >= 6 || busStopCount >= 8
      ? " Busiest near access points."
      : "";

  if (cls === "low")
    return `Good for reactive dogs and quiet walks.${busyNearAccess}`;
  if (cls === "medium")
    return `Expect some passing traffic—use leash etiquette near junctions.${busyNearAccess}`;
  if (cls === "high")
    return `Best off-peak for reactive dogs. Expect bikes/runners near entrances.${busyNearAccess}`;
  return busyNearAccess
    ? busyNearAccess.trim()
    : "Crowd level unknown—plan for possible traffic.";
}

function reasonsOneLine(reasons: string | string[] | null | undefined): string {
  if (reasons == null) return "";
  if (Array.isArray(reasons)) return reasons.map((r) => String(r).trim()).filter(Boolean).join(", ");
  const s = String(reasons).trim();
  return s;
}

export function CrowdSection({
  crowdClass,
  crowdProxyScore,
  crowdReasons,
  crowdSignals,
  crowdLastComputedAt,
}: CrowdSectionProps) {
  const hasAny =
    crowdClass != null ||
    crowdLastComputedAt != null ||
    crowdProxyScore != null ||
    crowdReasons != null ||
    (crowdSignals != null && Object.keys(crowdSignals).length > 0);

  if (!hasAny) return null;

  const pct = normalizeScorePercent(crowdProxyScore);
  const label = classLabel(crowdClass);
  const classStyle = getClassStyle(crowdClass);
  const updatedStr = formatUpdated(crowdLastComputedAt);
  const driverChips = getDriverChips(crowdSignals ?? undefined);
  const dogTip = getDogTip(crowdClass, crowdSignals ?? undefined);
  const reasonsStr = reasonsOneLine(crowdReasons);

  return (
    <section style={S.section}>
      {/* A) Header row */}
      <div style={S.headerRow}>
        <div style={S.headerLeft}>
          <h2 style={S.title}>
            <Users size={18} style={{ marginRight: "0.35rem", verticalAlign: "middle" }} />
            Crowd
          </h2>
          <p style={S.subtitle}>How busy it tends to feel</p>
        </div>
        {updatedStr !== "—" ? (
          <p style={S.updated}>Updated: {updatedStr}</p>
        ) : null}
      </div>

      {/* B) Headline block */}
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
      {reasonsStr ? (
        <p style={S.reasonsLine} title={reasonsStr}>
          {reasonsStr}
        </p>
      ) : null}

      {/* C) Mini gauge */}
      <div style={S.gaugeRow}>
        <Activity size={14} style={{ flexShrink: 0, color: "#6b7280" }} />
        <span style={S.gaugeMuted}>Busyness</span>
        <span style={S.gaugePct}>{pct}%</span>
      </div>
      <div
        style={S.barOuter}
        title={`Crowd proxy score: ${crowdProxyScore != null && Number.isFinite(crowdProxyScore) ? Number(crowdProxyScore).toFixed(2) : pct / 100}`}
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

      {/* D) What drives this chips */}
      {driverChips.length > 0 ? (
        <div style={S.chipsRow}>
          {driverChips.map(({ key, label: chipLabel, display, icon: Icon }) => (
            <div key={key} style={S.chip}>
              <Icon size={14} style={{ flexShrink: 0, color: "#6b7280" }} />
              <span style={S.chipText}>
                {chipLabel}: {display}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* E) Dog-owner guidance */}
      {dogTip ? (
        <div style={S.tipCallout}>
          <Info size={14} style={{ flexShrink: 0, color: "#6366f1" }} />
          <span style={S.tipText}>{dogTip}</span>
        </div>
      ) : null}

      {/* F) Full data disclosure */}
      <details style={S.details}>
        <summary style={S.detailsSummary}>Data details</summary>
        <div style={S.detailsInner}>
          <div style={S.detailRow}>
            <span style={S.detailKey}>crowdClass (raw)</span>
            <span style={S.detailVal}>{crowdClass ?? "—"}</span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>crowdProxyScore (raw)</span>
            <span style={S.detailVal}>
              {crowdProxyScore != null ? String(crowdProxyScore) : "—"}
            </span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>crowdLastComputedAt</span>
            <span style={S.detailVal}>
              {crowdLastComputedAt != null ? String(crowdLastComputedAt) : "—"}{" "}
              ({updatedStr})
            </span>
          </div>
          <div style={S.detailRow}>
            <span style={S.detailKey}>crowdReasons (raw)</span>
            <span style={{ ...S.detailVal, maxWidth: "70%", wordBreak: "break-word" }}>
              {crowdReasons != null ? String(crowdReasons) : "—"}
            </span>
          </div>
          <div style={{ marginTop: "0.35rem" }}>
            <span style={S.detailKey}>crowdSignals</span>
            <pre style={S.rawPre}>
              {crowdSignals != null
                ? JSON.stringify(crowdSignals, null, 2)
                : "—"}
            </pre>
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
    borderRadius: "1rem",
    padding: "0.9rem",
  } as const,
  headerRow: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap" as const,
  } as const,
  headerLeft: { minWidth: 0 } as const,
  updated: { margin: 0, fontSize: "0.8rem", color: "#6b7280", flexShrink: 0 } as const,
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
  scorePill: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: "#111827",
    fontVariantNumeric: "tabular-nums" as const,
  } as const,
  reasonsLine: {
    marginTop: "0.25rem",
    fontSize: "0.82rem",
    lineHeight: 1.4,
    color: "#6b7280",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical" as const,
    overflow: "hidden",
  } as const,
  gaugeRow: {
    marginTop: "0.6rem",
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
    marginTop: "0.6rem",
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
    whiteSpace: "nowrap" as const,
  } as const,
  chipText: { fontSize: "0.82rem", color: "#374151" } as const,
  tipCallout: {
    marginTop: "0.6rem",
    display: "flex",
    alignItems: "flex-start",
    gap: "0.4rem",
    padding: "0.4rem 0.55rem",
    border: "1px solid #e0e7ff",
    borderRadius: "0.5rem",
    background: "#eef2ff",
  } as const,
  tipText: {
    fontSize: "0.82rem",
    lineHeight: 1.45,
    color: "#3730a3",
  } as const,
  details: { marginTop: "0.75rem" } as const,
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
  detailKey: { color: "#6b7280", fontFamily: "monospace" } as const,
  detailVal: {
    fontFamily: "monospace",
    fontSize: "0.78rem",
    color: "#111827",
    wordBreak: "break-word" as const,
  } as const,
  rawPre: {
    marginTop: "0.35rem",
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
} as const;
