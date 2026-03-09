import { type CSSProperties, type ReactNode } from "react";
import { space, radius, type as t, color } from "@/design/tokens";

export type DisclosureProps = {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

const triggerBaseStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: space[3],
  padding: `${space[3]} ${space[4]}`,
  background: "none",
  border: "none",
  borderRadius: radius.md,
  cursor: "pointer",
  textAlign: "left",
  transition: "background-color 0.12s ease",
};

const triggerLabelStyle: CSSProperties = {
  ...t.meta,
  fontWeight: 500,
  color: color.textSecondary,
};

const panelStyle: CSSProperties = {
  padding: `0 ${space[4]} ${space[4]}`,
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        color: color.textMuted,
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Disclosure({ label, defaultOpen = false, children }: DisclosureProps) {
  const wrapStyle: CSSProperties = {
    border: `1px solid ${color.border}`,
    borderRadius: radius.md,
    backgroundColor: color.surfaceSubtle,
    overflow: "hidden",
  };

  const triggerStyle: CSSProperties = {
    ...triggerBaseStyle,
    backgroundColor: "transparent",
  };

  return (
    <details style={wrapStyle} className="disclosure-wrap" open={defaultOpen}>
      <summary style={triggerStyle} className="collapsible-summary">
        <span style={triggerLabelStyle}>{label}</span>
        <span className="insight-card__toggle-icon" aria-hidden="true">
          <ChevronIcon open={false} />
        </span>
      </summary>
      <div style={panelStyle}>{children}</div>
    </details>
  );
}
