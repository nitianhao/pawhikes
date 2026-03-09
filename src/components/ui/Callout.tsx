import type { CSSProperties, ReactNode } from "react";
import { space, radius, type as t, color } from "@/design/tokens";

export type CalloutVariant = "info" | "caution" | "risk";

export type CalloutProps = {
  variant?: CalloutVariant;
  title?: string;
  children: ReactNode;
};

const variantMap: Record<CalloutVariant, { bg: string; border: string; accent: string; text: string; icon: string }> = {
  info: {
    bg:     color.neutral.bg,
    border: color.neutral.border,
    accent: color.neutral.icon,
    text:   color.neutral.text,
    icon:   "ℹ",
  },
  caution: {
    bg:     color.warn.bg,
    border: color.warn.border,
    accent: color.warn.icon,
    text:   color.warn.text,
    icon:   "⚠",
  },
  risk: {
    bg:     color.risk.bg,
    border: color.risk.border,
    accent: color.risk.icon,
    text:   color.risk.text,
    icon:   "✕",
  },
};

export function Callout({ variant = "info", title, children }: CalloutProps) {
  const v = variantMap[variant];

  const outerStyle: CSSProperties = {
    display: "flex",
    gap: space[3],
    backgroundColor: v.bg,
    border: `1px solid ${v.border}`,
    borderLeft: `3px solid ${v.accent}`,
    borderRadius: radius.md,
    padding: `${space[3]} ${space[4]}`,
  };

  const iconStyle: CSSProperties = {
    flexShrink: 0,
    width: "18px",
    height: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: v.accent,
    marginTop: "1px",
  };

  const bodyStyle: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: space[1],
    minWidth: 0,
  };

  const titleStyle: CSSProperties = {
    ...t.meta,
    fontWeight: 600,
    color: v.text,
    margin: 0,
  };

  const contentStyle: CSSProperties = {
    ...t.meta,
    color: color.textSecondary,
    margin: 0,
  };

  return (
    <div style={outerStyle} role={variant === "risk" ? "alert" : "note"}>
      <span style={iconStyle} aria-hidden="true">{v.icon}</span>
      <div style={bodyStyle}>
        {title ? <p style={titleStyle}>{title}</p> : null}
        <div style={contentStyle}>{children}</div>
      </div>
    </div>
  );
}
