import {
  AlertTriangle,
  Clock3,
  CreditCard,
  Info,
  Landmark,
  Lock,
  Ticket,
  Unlock,
} from "lucide-react";

type Source = "osm" | "google" | "derived" | "unknown";
type AccessClass = "public" | "permissive" | "private" | "restricted" | "unknown";
type AgencyClass = "city" | "county" | "state" | "federal" | "private" | "unknown";

type AccessRulesLike = {
  hours?: {
    known?: boolean;
    openingHoursText?: string[] | null;
    source?: Source;
    confidence?: number;
  } | null;
  fees?: {
    feeLikely?: boolean;
    feeText?: string | null;
    source?: Source;
    confidence?: number;
  } | null;
  permit?: {
    permitRequiredLikely?: boolean;
    permitText?: string | null;
    source?: Source;
    confidence?: number;
  } | null;
  access?: {
    accessClass?: AccessClass;
    notes?: string | null;
    source?: Source;
    confidence?: number;
  } | null;
  landManager?: {
    operator?: string | null;
    owner?: string | null;
    agencyClass?: AgencyClass;
    source?: Source;
    confidence?: number;
  } | null;
} | null;

type AccessEntryModel = {
  fee: { status: "free" | "paid" | "likely_paid" | "unknown"; label: string; note?: string };
  hours: {
    status: "known" | "unknown";
    label: string;
    detail?: string;
    weekly?: Array<{ day: string; open: string }>;
  };
  access: { status: "public" | "restricted" | "private" | "unknown"; label: string; note?: string };
  permit: {
    status: "not_required" | "likely_required" | "required" | "unknown";
    label: string;
    note?: string;
  };
  manager?: { label: string; note?: string };
  warnings: Array<{ kind: "warning" | "info"; text: string }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toAccessRules(value: unknown): AccessRulesLike {
  const rec = asRecord(value);
  if (!rec) return null;
  return rec as AccessRulesLike;
}

function shortText(value: unknown, max = 90): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

function formatRange(text: string): string {
  return text.replace(/\u2013|\u2014|\u2212/g, "–").replace(/\s+/g, " ").trim();
}

function parseWeekly(openingHoursText: unknown): Array<{ day: string; open: string }> {
  if (!Array.isArray(openingHoursText)) return [];
  const rows = openingHoursText
    .map((line) => String(line ?? "").trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return { day: "", open: formatRange(line) };
      const day = line.slice(0, idx).trim();
      const open = formatRange(line.slice(idx + 1).trim());
      return { day, open };
    });
  return rows;
}

function buildModel(accessRulesRaw: unknown): AccessEntryModel {
  const rules = toAccessRules(accessRulesRaw);

  const feeLikely = rules?.fees?.feeLikely;
  const feeNote = shortText(rules?.fees?.feeText);
  const permitLikely = rules?.permit?.permitRequiredLikely;
  const permitNote = shortText(rules?.permit?.permitText);
  const accessClass = String(rules?.access?.accessClass ?? "").trim().toLowerCase();
  const accessNotes = String(rules?.access?.notes ?? "").trim();
  const weekly = parseWeekly(rules?.hours?.openingHoursText);

  const ranges = weekly.map((r) => r.open).filter((v) => v.length > 0);
  const allSameRange = ranges.length >= 7 && ranges.every((r) => r === ranges[0]);

  const fee: AccessEntryModel["fee"] =
    feeLikely === true
      ? { status: "likely_paid", label: "Fee likely", note: feeNote }
      : feeLikely === false
        ? { status: "free", label: "No fee reported", note: feeNote }
        : { status: "unknown", label: "Fee unknown", note: feeNote };

  const hours: AccessEntryModel["hours"] =
    rules?.hours?.known === true && weekly.length > 0
      ? allSameRange
        ? { status: "known", label: `Open daily: ${ranges[0]}` }
        : { status: "known", label: "Hours vary", detail: "See weekly schedule", weekly }
      : { status: "unknown", label: "Hours unknown" };

  const notesMentionPrivateOrRestricted = /\b(private|restricted)\b/i.test(accessNotes);
  const access: AccessEntryModel["access"] =
    accessClass === "private"
      ? { status: "private", label: "Access restricted", note: "Some entrances marked private" }
      : accessClass === "restricted" || notesMentionPrivateOrRestricted
        ? { status: "restricted", label: "Access may be restricted", note: "Some entrances may be restricted" }
        : accessClass
          ? { status: "public", label: "Public access", note: shortText(accessNotes) }
          : { status: "unknown", label: "Access unknown" };

  let permit: AccessEntryModel["permit"];
  if (permitLikely === true) {
    permit = { status: "likely_required", label: "Permit may be required", note: permitNote };
  } else if (permitLikely === false) {
    permit = { status: "not_required", label: "No permit reported", note: permitNote };
  } else if (/\brequired\b/i.test(String(rules?.permit?.permitText ?? ""))) {
    permit = { status: "required", label: "Permit required", note: permitNote };
  } else {
    permit = { status: "unknown", label: "Permit unknown", note: permitNote };
  }

  const managerName = String(rules?.landManager?.operator ?? "").trim() || String(rules?.landManager?.owner ?? "").trim();
  const manager =
    managerName.length > 0
      ? {
          label: `Managed by ${managerName}`,
          note:
            typeof rules?.landManager?.agencyClass === "string" && rules.landManager.agencyClass.trim().length > 0
              ? rules.landManager.agencyClass
              : undefined,
        }
      : undefined;

  const warnings: AccessEntryModel["warnings"] = [];
  if (access.status === "private" || access.status === "restricted") {
    warnings.push({ kind: "warning", text: "Some access points may be private—check signage." });
  }
  if (hours.status === "unknown") {
    warnings.push({ kind: "info", text: "Hours not confirmed—check before visiting." });
  }
  if (permit.status === "likely_required") {
    warnings.push({ kind: "warning", text: "Permit may be required—verify locally." });
  }

  return { fee, hours, access, permit, manager, warnings };
}

function detailValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value.trim() || "—";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isRawTag(value: unknown): boolean {
  return typeof value === "string" && /\b[a-z_]+=[a-z0-9_:.-]+\b/i.test(value);
}

type AccessEntrySectionProps = {
  accessRules: unknown;
  /** When true, omit outer section border/padding so parent grid controls gutters (e.g. inside Rules & Safety). */
  nested?: boolean;
};

export function AccessEntrySection({ accessRules, nested }: AccessEntrySectionProps) {
  const rules = toAccessRules(accessRules);
  const model = buildModel(accessRules);

  const chips = [
    {
      key: "fee",
      icon: <CreditCard size={14} />,
      text: `Fee: ${model.fee.label}`,
    },
    {
      key: "hours",
      icon: <Clock3 size={14} />,
      text: model.hours.status === "unknown" ? "Hours: Unknown" : model.hours.label,
    },
    {
      key: "access",
      icon: model.access.status === "private" || model.access.status === "restricted" ? <Lock size={14} /> : <Unlock size={14} />,
      text:
        model.access.status === "private"
          ? "Access: Private"
          : model.access.status === "restricted"
            ? "Access: Restricted"
            : model.access.status === "public"
              ? "Access: Public"
              : "Access: Unknown",
    },
    {
      key: "permit",
      icon: <Ticket size={14} />,
      text:
        model.permit.status === "not_required"
          ? "Permit: Not required"
          : model.permit.status === "likely_required"
            ? "Permit: May be required"
            : model.permit.status === "required"
              ? "Permit: Required"
              : "Permit: Unknown",
    },
    ...(model.manager
      ? [{ key: "manager", icon: <Landmark size={14} />, text: model.manager.label }]
      : []),
  ];

  const noteLine = [model.fee.note, model.access.note, model.permit.note]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, 1)
    .join(" ");

  const Wrapper = nested ? "div" : "section";
  const wrapperStyle = nested
    ? undefined
    : {
        marginTop: "1.25rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "0.9rem",
      };

  return (
    <Wrapper style={wrapperStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.2rem", color: "#111827" }}>Access & Entry</h2>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "0.82rem" }}>Rules, hours, fees</p>
      </div>

      <div style={{ marginTop: "0.5rem", display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {chips.map((chip) => (
          <span
            key={chip.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              border: "1px solid #e5e7eb",
              borderRadius: "0.6rem",
              padding: "0.25rem 0.55rem",
              fontSize: "0.82rem",
              color: "#374151",
              maxWidth: chip.key === "manager" ? "280px" : undefined,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              background: "#fff",
            }}
            title={chip.text}
          >
            {chip.icon}
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chip.text}</span>
          </span>
        ))}
      </div>

      {model.hours.detail && model.hours.weekly && model.hours.weekly.length > 0 ? (
        <details style={{ marginTop: "0.45rem" }}>
          <summary style={{ cursor: "pointer", color: "#374151", fontSize: "0.82rem", fontWeight: 500 }}>
            View schedule
          </summary>
          <div style={{ marginTop: "0.3rem", border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "0.35rem 0.5rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "0.75rem", rowGap: "0.15rem" }}>
              {model.hours.weekly.map((row, idx) => (
                <div key={`${row.day}-${idx}`} style={{ display: "contents" }}>
                  <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>{row.day || "Day"}</span>
                  <span style={{ fontSize: "0.8rem", color: "#374151" }}>{row.open || "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </details>
      ) : null}

      {noteLine ? (
        <p style={{ margin: "0.45rem 0 0", fontSize: "0.82rem", color: "#6b7280" }}>{noteLine}</p>
      ) : null}

      {model.warnings.length > 0 ? (
        <div style={{ marginTop: "0.5rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.4rem" }}>
          {model.warnings.slice(0, 2).map((w, idx) => (
            <div
              key={`${w.kind}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                border: `1px solid ${w.kind === "warning" ? "#fcd34d" : "#bfdbfe"}`,
                background: w.kind === "warning" ? "#fffbeb" : "#eff6ff",
                color: "#374151",
                borderRadius: "0.55rem",
                padding: "0.3rem 0.45rem",
                fontSize: "0.8rem",
              }}
              title={w.text}
            >
              {w.kind === "warning" ? <AlertTriangle size={14} /> : <Info size={14} />}
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                }}
              >
                {w.text}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <details style={{ marginTop: "0.6rem", border: "1px solid #e5e7eb", borderRadius: "0.55rem", padding: "0.45rem 0.55rem" }}>
        <summary style={{ cursor: "pointer", color: "#374151", fontWeight: 500, fontSize: "0.84rem" }}>
          Data details
        </summary>
        <div style={{ marginTop: "0.4rem", color: "#374151" }}>
          {[
            {
              title: "Fees",
              rows: [
                ["feeLikely", rules?.fees?.feeLikely],
                ["feeText", rules?.fees?.feeText],
                ["source", rules?.fees?.source],
                ["confidence", rules?.fees?.confidence],
              ],
            },
            {
              title: "Hours",
              rows: [
                ["known", rules?.hours?.known],
                ["openingHoursText", rules?.hours?.openingHoursText],
                ["source", rules?.hours?.source],
                ["confidence", rules?.hours?.confidence],
              ],
            },
            {
              title: "Access",
              rows: [
                ["accessClass", rules?.access?.accessClass],
                ["notes", rules?.access?.notes],
                ["source", rules?.access?.source],
                ["confidence", rules?.access?.confidence],
              ],
            },
            {
              title: "Permit",
              rows: [
                ["permitRequiredLikely", rules?.permit?.permitRequiredLikely],
                ["permitText", rules?.permit?.permitText],
                ["source", rules?.permit?.source],
                ["confidence", rules?.permit?.confidence],
              ],
            },
            {
              title: "Manager",
              rows: [
                ["operator", rules?.landManager?.operator],
                ["owner", rules?.landManager?.owner],
                ["agencyClass", rules?.landManager?.agencyClass],
                ["source", rules?.landManager?.source],
                ["confidence", rules?.landManager?.confidence],
              ],
            },
          ].map((group) => (
            <div key={group.title} style={{ marginTop: "0.4rem" }}>
              <p style={{ margin: "0.25rem 0", fontWeight: 600, fontSize: "0.82rem" }}>{group.title}</p>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: "0.45rem", padding: "0.3rem 0.45rem" }}>
                {group.rows.map(([label, value]) => (
                  <div
                    key={String(label)}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "150px 1fr",
                      gap: "0.4rem",
                      alignItems: "center",
                      padding: "0.15rem 0",
                      borderTop: "1px solid #f1f5f9",
                      fontSize: "0.8rem",
                    }}
                  >
                    <span style={{ color: "#6b7280" }}>{label}</span>
                    <span style={isRawTag(value) ? { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" } : undefined}>
                      {detailValue(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </Wrapper>
  );
}

