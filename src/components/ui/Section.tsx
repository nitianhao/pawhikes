import type { ReactNode, CSSProperties } from "react";
import { space, radius, shadow, color } from "@/design/tokens";

export type SectionProps = {
  id?: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

const sectionStyle: CSSProperties = {
  backgroundColor: color.surface,
  border: `1px solid ${color.border}`,
  borderRadius: radius.lg,
  boxShadow: shadow.card,
  overflow: "hidden",
};


const headerLeftStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space[1],
  minWidth: 0,
};

export function Section({ id, title, subtitle, actions, children }: SectionProps) {
  return (
    <section id={id} style={sectionStyle} className="section-card">
      <div className="section-card__header">
        <div style={headerLeftStyle}>
          <h2 className="section-card__title">{title}</h2>
          {subtitle ? <p className="section-card__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div className="section-card__body">{children}</div>
    </section>
  );
}
