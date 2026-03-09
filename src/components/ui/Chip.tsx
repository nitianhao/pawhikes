import type { CSSProperties, ReactNode } from "react";
import { radius, type as t, color, toneColors, chipHeight, type Tone } from "@/design/tokens";

export type ChipVariant = "status" | "metadata" | "filter";

export type ChipProps = {
  children: ReactNode;
  variant?: ChipVariant;
  tone?: Tone;
  // filter chips only: indicates active/selected state
  active?: boolean;
  onClick?: () => void;
};

function chipStyles(variant: ChipVariant, tone: Tone, active: boolean): CSSProperties {
  const tc = toneColors(tone);
  const isInteractive = variant === "filter";

  const base: CSSProperties = {
    ...t.chip,
    display: "inline-flex",
    alignItems: "center",
    height: chipHeight,
    paddingLeft: "10px",
    paddingRight: "10px",
    borderRadius: radius.pill,
    border: "1px solid",
    whiteSpace: "nowrap",
    cursor: isInteractive ? "pointer" : "default",
    userSelect: "none",
    transition: isInteractive ? "background-color 0.12s ease, border-color 0.12s ease" : undefined,
  };

  if (variant === "status") {
    return {
      ...base,
      backgroundColor: tc.bg,
      borderColor: tc.border,
      color: tc.text,
      fontWeight: 600,
    };
  }

  if (variant === "metadata") {
    return {
      ...base,
      backgroundColor: color.neutral.bg,
      borderColor: color.neutral.border,
      color: color.neutral.text,
    };
  }

  // filter
  return {
    ...base,
    backgroundColor: active ? color.green100 : color.neutral.bg,
    borderColor: active ? color.green400 : color.neutral.border,
    color: active ? color.green700 : color.neutral.text,
    fontWeight: active ? 600 : 400,
  };
}

export function Chip({
  children,
  variant = "metadata",
  tone = "neutral",
  active = false,
  onClick,
}: ChipProps) {
  const style = chipStyles(variant, tone, active);

  if (variant === "filter") {
    return (
      <button type="button" className="chip" style={{ ...style, background: "none", font: "inherit" }} onClick={onClick}>
        {children}
      </button>
    );
  }

  return <span className="chip" style={style}>{children}</span>;
}
