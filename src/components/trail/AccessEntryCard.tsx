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

type ParkingFeeVerdict = {
  status: "free" | "likely" | "unknown";
  label: string;
  detail: string;
};

type HoursVerdict = {
  status: "known" | "vary" | "unknown";
  label: string;
  detail: string;
};

type AccessVerdict = {
  status: "public" | "restricted" | "unknown";
  label: string;
  detail: string;
};

type PermitVerdict = {
  status: "not_required" | "likely" | "required" | "unknown";
  label: string;
  detail: string;
};

type ManagerVerdict = {
  label: string;
  detail: string;
};

type AccessEntryUi = {
  parkingFee: ParkingFeeVerdict;
  hours: HoursVerdict;
  access: AccessVerdict;
  permit: PermitVerdict;
  manager: ManagerVerdict | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toAccessRules(value: unknown): AccessRulesLike {
  const r = asRecord(value);
  if (!r) return null;
  return r as AccessRulesLike;
}

function formatTimeRange(text: string): string {
  return text.replace(/\u2013|\u2014|\u2212/g, "-").replace(/\s+/g, " ").trim();
}

function getDailyHoursSummary(openingHoursText: string[] | null | undefined): HoursVerdict {
  const rows = Array.isArray(openingHoursText)
    ? openingHoursText
        .map((line) => String(line ?? "").trim())
        .filter((line) => line.length > 0)
    : [];

  if (rows.length === 0) {
    return {
      status: "unknown",
      label: "Hours Unknown",
      detail: "Operating hours are not available.",
    };
  }

  if (rows.length === 1) {
    const only = formatTimeRange(rows[0]);
    return {
      status: "known",
      label: `Hours: ${only}`,
      detail: only,
    };
  }

  const parsed = rows.map((row) => {
    const parts = row.split(":");
    if (parts.length < 2) return { raw: row, day: "", range: row };
    const day = String(parts.shift() ?? "").trim();
    const range = formatTimeRange(parts.join(":"));
    return { raw: row, day, range };
  });

  const has7DailyEntries = parsed.length >= 7;
  const normalizedRanges = parsed
    .map((entry) => entry.range)
    .filter((range) => range.length > 0);
  const allSameRange =
    has7DailyEntries &&
    normalizedRanges.length >= 7 &&
    normalizedRanges.every((range) => range === normalizedRanges[0]);

  if (allSameRange) {
    return {
      status: "known",
      label: `Open Daily: ${normalizedRanges[0]}`,
      detail: `Open daily ${normalizedRanges[0]}.`,
    };
  }

  const compact = parsed
    .slice(0, 2)
    .map((entry) => entry.raw)
    .join("; ");
  const remaining = parsed.length > 2 ? ` (+${parsed.length - 2} more)` : "";
  return {
    status: "vary",
    label: "Hours Vary",
    detail: compact ? `Hours vary by day. ${compact}${remaining}` : "Hours vary by day.",
  };
}

function buildAccessUi(accessRulesRaw: unknown): AccessEntryUi {
  const accessRules = toAccessRules(accessRulesRaw);
  const feeLikely = accessRules?.fees?.feeLikely;
  const hoursKnown = accessRules?.hours?.known;
  const hoursText = accessRules?.hours?.openingHoursText;
  const accessClass = String(accessRules?.access?.accessClass ?? "unknown").toLowerCase();
  const accessNotes = String(accessRules?.access?.notes ?? "").trim();
  const permitRequiredLikely = accessRules?.permit?.permitRequiredLikely;
  const permitText = String(accessRules?.permit?.permitText ?? "").trim();
  const operator = String(accessRules?.landManager?.operator ?? "").trim();
  const owner = String(accessRules?.landManager?.owner ?? "").trim();
  const managerName = operator || owner || "";

  let parkingFee: ParkingFeeVerdict;
  if (feeLikely === true) {
    parkingFee = {
      status: "likely",
      label: "Parking Fee Likely",
      detail: "Some parking areas near trail entrances may require payment.",
    };
  } else if (feeLikely === false) {
    parkingFee = {
      status: "free",
      label: "Parking Likely Free",
      detail: "No parking fee signal was detected in linked access data.",
    };
  } else {
    parkingFee = {
      status: "unknown",
      label: "Parking Unknown",
      detail: "Parking fee information is not available.",
    };
  }

  let hours: HoursVerdict;
  if (hoursKnown && Array.isArray(hoursText) && hoursText.length > 0) {
    hours = getDailyHoursSummary(hoursText);
  } else {
    hours = {
      status: "unknown",
      label: "Hours Unknown",
      detail: "Operating hours are not available.",
    };
  }

  const notesMentionPrivate = /\bprivate\b/i.test(accessNotes);
  let access: AccessVerdict;
  if (accessClass === "private" || accessClass === "restricted" || notesMentionPrivate) {
    access = {
      status: "restricted",
      label: "Access May Be Restricted",
      detail: "Some nearby entrances are marked private or restricted.",
    };
  } else if (accessClass === "public" || accessClass === "permissive") {
    access = {
      status: "public",
      label: "Public Access",
      detail: "No public-access restriction was flagged in nearby access data.",
    };
  } else {
    access = {
      status: "unknown",
      label: "Access Unknown",
      detail: "Access restrictions are not clearly documented.",
    };
  }

  let permit: PermitVerdict;
  if (permitRequiredLikely === true) {
    permit = {
      status: "likely",
      label: "Permit May Be Required",
      detail: "Check local signage before visiting.",
    };
  } else if (permitRequiredLikely === false) {
    permit = {
      status: "not_required",
      label: "Permit Not Required",
      detail: "No permit signal was detected in linked access data.",
    };
  } else if (/\brequired\b/i.test(permitText)) {
    permit = {
      status: "required",
      label: "Permit Required",
      detail: permitText,
    };
  } else {
    permit = {
      status: "unknown",
      label: "Permit Unknown",
      detail: "Permit requirements are not available.",
    };
  }

  const manager =
    managerName.length > 0
      ? {
          label: `Managed by ${managerName}`,
          detail: `Managed by ${managerName}.`,
        }
      : null;

  return { parkingFee, hours, access, permit, manager };
}

function renderDetailValue(value: unknown): string {
  if (value == null) return "Unknown";
  if (typeof value === "string") return value.trim() || "Unknown";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

type AccessEntryCardProps = {
  accessRules: unknown;
  accessRulesClass?: unknown;
  accessRulesReasons?: unknown;
};

export function AccessEntryCard({
  accessRules,
  accessRulesClass,
  accessRulesReasons,
}: AccessEntryCardProps) {
  const ui = buildAccessUi(accessRules);
  const rules = toAccessRules(accessRules);
  const reasons = Array.isArray(accessRulesReasons) ? accessRulesReasons : [];

  const chips = [
    { key: "parking", title: "Parking", value: ui.parkingFee.label },
    { key: "hours", title: "Hours", value: ui.hours.label },
    { key: "access", title: "Access", value: ui.access.label },
    { key: "permit", title: "Permit", value: ui.permit.label },
    ...(ui.manager ? [{ key: "manager", title: "Manager", value: ui.manager.label.replace(/^Managed by\s+/, "") }] : []),
  ];

  return (
    <section
      style={{
        marginTop: "1.25rem",
        border: "1px solid #e5e7eb",
        borderRadius: "0.75rem",
        padding: "0.9rem",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Access & Entry</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "0.5rem",
          marginTop: "0.35rem",
        }}
      >
        {chips.map((chip) => (
          <div
            key={chip.key}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: "0.55rem",
              padding: "0.45rem 0.55rem",
              background: "#f9fafb",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.75rem", color: "#6b7280" }}>{chip.title}</p>
            <p style={{ margin: "0.2rem 0 0", fontWeight: 600, color: "#111827" }}>{chip.value}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: "0.75rem" }}>
        <p style={{ margin: "0.35rem 0", color: "#374151" }}>
          <strong>💵 {ui.parkingFee.label}:</strong> {ui.parkingFee.detail}
        </p>
        <p style={{ margin: "0.35rem 0", color: "#374151" }}>
          <strong>🕒 {ui.hours.label}:</strong> {ui.hours.detail}
        </p>
        <p style={{ margin: "0.35rem 0", color: "#374151" }}>
          <strong>🔓 {ui.access.label}:</strong> {ui.access.detail}
        </p>
        <p style={{ margin: "0.35rem 0", color: "#374151" }}>
          <strong>🎟 {ui.permit.label}:</strong> {ui.permit.detail}
        </p>
        {ui.manager ? (
          <p style={{ margin: "0.35rem 0", color: "#374151" }}>
            <strong>🏛 {ui.manager.label}:</strong> {ui.manager.detail}
          </p>
        ) : null}
      </div>

      <details style={{ marginTop: "0.7rem" }}>
        <summary style={{ cursor: "pointer", color: "#374151", fontWeight: 500 }}>
          View data details
        </summary>
        <div style={{ marginTop: "0.5rem", color: "#374151" }}>
          <p style={{ margin: "0.25rem 0" }}>
            <strong>Access rules class:</strong> {renderDetailValue(accessRulesClass)}
          </p>
          <p style={{ margin: "0.25rem 0" }}>
            <strong>Access rules reasons:</strong>{" "}
            {reasons.length > 0 ? reasons.map((v) => String(v)).join(" | ") : "Unknown"}
          </p>

          <p style={{ margin: "0.55rem 0 0.25rem", fontWeight: 600 }}>Hours</p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Known:</strong> {renderDetailValue(rules?.hours?.known)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Opening hours text:</strong> {renderDetailValue(rules?.hours?.openingHoursText)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Source:</strong> {renderDetailValue(rules?.hours?.source)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Confidence:</strong> {renderDetailValue(rules?.hours?.confidence)}
          </p>

          <p style={{ margin: "0.55rem 0 0.25rem", fontWeight: 600 }}>Fees</p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Fee likely:</strong> {renderDetailValue(rules?.fees?.feeLikely)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Fee text:</strong> {renderDetailValue(rules?.fees?.feeText)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Source:</strong> {renderDetailValue(rules?.fees?.source)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Confidence:</strong> {renderDetailValue(rules?.fees?.confidence)}
          </p>

          <p style={{ margin: "0.55rem 0 0.25rem", fontWeight: 600 }}>Access</p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Access class:</strong> {renderDetailValue(rules?.access?.accessClass)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Notes:</strong> {renderDetailValue(rules?.access?.notes)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Source:</strong> {renderDetailValue(rules?.access?.source)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Confidence:</strong> {renderDetailValue(rules?.access?.confidence)}
          </p>

          <p style={{ margin: "0.55rem 0 0.25rem", fontWeight: 600 }}>Permit</p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Permit required likely:</strong> {renderDetailValue(rules?.permit?.permitRequiredLikely)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Permit text:</strong> {renderDetailValue(rules?.permit?.permitText)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Source:</strong> {renderDetailValue(rules?.permit?.source)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Confidence:</strong> {renderDetailValue(rules?.permit?.confidence)}
          </p>

          <p style={{ margin: "0.55rem 0 0.25rem", fontWeight: 600 }}>Land manager</p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Operator:</strong> {renderDetailValue(rules?.landManager?.operator)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Owner:</strong> {renderDetailValue(rules?.landManager?.owner)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Agency class:</strong> {renderDetailValue(rules?.landManager?.agencyClass)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Source:</strong> {renderDetailValue(rules?.landManager?.source)}
          </p>
          <p style={{ margin: "0.2rem 0" }}>
            <strong>Confidence:</strong> {renderDetailValue(rules?.landManager?.confidence)}
          </p>
        </div>
      </details>
    </section>
  );
}
