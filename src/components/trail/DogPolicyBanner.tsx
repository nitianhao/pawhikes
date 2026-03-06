import React, { type ReactNode } from "react";
import { MapPin, Medal, PawPrint, TreePine } from "lucide-react";
import { LeashIcon } from "@/components/ui/TrailPictograms";

export type DogPolicyBannerProps = {
  dogsAllowed: string | null | undefined;
  leashPolicy: string | null | undefined;
  leashDetails?: string | null;
  policySourceUrl?: string | null;
  policySourceTitle?: string | null;
};

function sourceDisplayLabel(url: string | null | undefined, title: string | null | undefined): string {
  if (typeof title === "string" && title.trim()) return title.trim();
  if (typeof url !== "string" || !url) return "—";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function dogsLabel(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "Unknown";
  const s = String(raw).trim().toLowerCase();
  if (/yes|allowed/i.test(s)) return "Allowed";
  if (/no|not allowed|prohibited/i.test(s)) return "Not allowed";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function leashLabel(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "Unknown";
  const s = String(raw).trim().toLowerCase();
  if (/off[- ]?leash|leash[- ]?optional/i.test(s)) return "Off-leash / optional";
  if (/on[- ]?leash|required/i.test(s)) return "Required";
  if (/conditional/i.test(s)) return "Conditional";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function offLeashLabel(
  leashPolicy: string | null | undefined,
  leashDetails: string | null | undefined
): string {
  const lp = String(leashPolicy ?? "").trim().toLowerCase();
  const ld = String(leashDetails ?? "").trim().toLowerCase();
  if (/off[- ]?leash|leash[- ]?optional/i.test(lp)) return "Designated areas only";
  if (/conditional/i.test(lp)) {
    if (/dola|designated|off[- ]?leash area/i.test(ld)) return "Designated areas only";
    return "Conditional";
  }
  if (/on[- ]?leash|required/i.test(lp)) return "No";
  if (/designated|dola/i.test(ld)) return "Designated areas only";
  if (lp) return "See details";
  return "Unknown";
}

/** Chip colors aligned with RulesAndSafetySection / design tokens (globals.css, TrailPictograms). */
function chipStyle(
  dogsAllowed: string | null | undefined,
  leashPolicy: string | null | undefined,
  leashDetails: string | null | undefined,
  chipIndex: 0 | 1 | 2
): { bg: string; border: string; valueColor: string; iconBg: string; iconColor: string } {
  const dogsRaw = dogsAllowed != null ? String(dogsAllowed).trim() : "";
  const leashRaw = leashPolicy != null ? String(leashPolicy).trim() : "";
  const isOffLeash = /off[- ]?leash|leash[- ]?optional/i.test(leashRaw);
  const isOnLeash = /on[- ]?leash|required/i.test(leashRaw);
  const dogsOk = /yes|allowed/i.test(dogsRaw);
  const dogsBanned = /no|not allowed|prohibited/i.test(dogsRaw);
  const offLeashVal = offLeashLabel(leashPolicy, leashDetails);

  const neutral = { bg: "#f1f5f9", border: "#e2e8f0", valueColor: "#64748b", iconBg: "#64748b", iconColor: "#ffffff" };
  const good = { bg: "#dcfce7", border: "#86efac", valueColor: "#15803d", iconBg: "#16a34a", iconColor: "#ffffff" };
  const warn = { bg: "#fef3c7", border: "#fcd34d", valueColor: "#d97706", iconBg: "#d97706", iconColor: "#ffffff" };
  const bad = { bg: "#fee2e2", border: "#fca5a5", valueColor: "#dc2626", iconBg: "#dc2626", iconColor: "#ffffff" };

  if (chipIndex === 0) {
    if (dogsOk) return good;
    if (dogsBanned) return bad;
    return neutral;
  }
  if (chipIndex === 1) {
    if (isOffLeash) return good;
    if (isOnLeash) return warn;
    return neutral;
  }
  // Off-leash chip (index 2)
  if (offLeashVal === "Designated areas only") return good;
  if (offLeashVal === "No") return warn;
  return neutral;
}

function oneSentenceGuidance(
  dogsAllowed: string | null | undefined,
  leashPolicy: string | null | undefined,
  leashDetails?: string | null
): string {
  const dogs = dogsLabel(dogsAllowed);
  const leash = leashLabel(leashPolicy);
  if (dogs === "Unknown" && leash === "Unknown") return "Dog policy details below.";
  const parts: string[] = [];
  if (dogs !== "Unknown") parts.push(`Dogs ${dogs.toLowerCase()}.`);
  if (leash !== "Unknown") parts.push(`Leash ${leash.toLowerCase()}.`);
  const details = typeof leashDetails === "string" ? leashDetails.trim() : "";
  if (details && details.length < 120) parts.push(details);
  return parts.join(" ") || "Dog policy details below.";
}

export function DogPolicyBanner({
  dogsAllowed,
  leashPolicy,
  leashDetails,
  policySourceUrl,
  policySourceTitle,
}: DogPolicyBannerProps) {
  const hasCertified =
    dogsAllowed != null && String(dogsAllowed).trim() !== "" &&
    leashPolicy != null && String(leashPolicy).trim() !== "" &&
    policySourceUrl != null && String(policySourceUrl).trim() !== "";
  const badgeLabel = hasCertified ? "Certified dog policy" : "Dog policy available";
  const guidance = oneSentenceGuidance(dogsAllowed, leashPolicy, leashDetails);
  const sourceText = sourceDisplayLabel(policySourceUrl, policySourceTitle);
  const fullParagraph = typeof leashDetails === "string" && leashDetails.trim() ? leashDetails.trim() : null;

  const chips: Array<{ icon: ReactNode; label: string; value: string }> = [
    { icon: <PawPrint size={16} aria-hidden />, label: "Dogs", value: dogsLabel(dogsAllowed) },
    { icon: <LeashIcon size={16} />, label: "Leash", value: leashLabel(leashPolicy) },
    { icon: <TreePine size={16} aria-hidden />, label: "Off-leash", value: offLeashLabel(leashPolicy, leashDetails) },
  ];

  return (
    <section aria-labelledby="dog-policy-heading" style={{ marginTop: "1.5rem" }}>
      <div className="dog-policy-banner" style={{
        borderRadius: "1rem",
        backgroundColor: "#ffffff",
        boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.05), 0 1px 2px -1px rgb(0 0 0 / 0.05)",
        border: "1px solid #e2e8f0",
      }}>
        {/* Header */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", marginBottom: "0.25rem" }}>
          <h2 id="dog-policy-heading" style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "#0f172a" }}>
            Dog Policy
          </h2>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "0.375rem",
            backgroundColor: hasCertified ? "#fffbeb" : "#f8fafc",
            color: hasCertified ? "#b45309" : "#475569",
            border: `1px solid ${hasCertified ? "#fde68a" : "#e2e8f0"}`,
            borderRadius: "9999px", padding: "0.25rem 0.75rem",
            fontSize: "0.75rem", fontWeight: 600,
          }}>
            {hasCertified && <Medal size={14} aria-hidden style={{ flexShrink: 0 }} />}
            {badgeLabel}
          </span>
        </div>

        {/* One-sentence guidance */}
        <p style={{ margin: 0, fontSize: "0.9375rem", fontWeight: 500, color: "#334155", lineHeight: 1.4 }}>
          {guidance}
        </p>

        {/* 3 compact chips — color-coded like RulesAndSafetySection / Access & Entry */}
        <div className="dog-policy-chips" style={{ display: "grid", gap: "0.5rem", marginTop: "1rem" }}>
          {chips.map((c, i) => {
            const style = chipStyle(dogsAllowed, leashPolicy, leashDetails, i as 0 | 1 | 2);
            return (
              <div key={c.label} style={{
                display: "flex", alignItems: "center", gap: "0.625rem",
                backgroundColor: style.bg, borderRadius: "0.625rem",
                padding: "0.5rem 0.75rem", border: `1px solid ${style.border}`,
              }}>
                <span style={{
                  width: "1.75rem", height: "1.75rem", borderRadius: "50%",
                  backgroundColor: style.iconBg, color: style.iconColor,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {c.icon}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.65rem", color: "#64748b", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                    {c.label}
                  </div>
                  <div style={{ fontWeight: 700, color: style.valueColor, fontSize: "0.875rem", lineHeight: 1.2 }}>
                    {c.value}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {fullParagraph && (
          <p style={{ margin: "1rem 0 0", fontSize: "0.875rem", color: "#334155", lineHeight: 1.6 }}>
            {fullParagraph}
          </p>
        )}

        {/* Source */}
        {sourceText !== "—" && (
          <div style={{
            marginTop: "0.75rem", paddingTop: "0.625rem", borderTop: "1px solid #f1f5f9",
            fontSize: "0.75rem", color: "#94a3b8",
            display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center",
          }}>
            {policySourceUrl ? (
              <a href={policySourceUrl} target="_blank" rel="noreferrer"
                style={{ color: "#94a3b8", textDecoration: "underline" }}>
                Source: {sourceText}
              </a>
            ) : (
              <span>Source: {sourceText}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
