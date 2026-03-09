import type { ReactNode } from "react";

export type ChipItem = { label: string; tone?: "good" | "warn" | "bad" | "neutral" };
export type RowItem = { k: string; v: ReactNode };

export type InsightCardVariant = "dog" | "conditions" | "planning" | "safety" | "highlights" | "data";

const chipToneTextColor: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good:    "#2c5f28",
  warn:    "#d97706",
  bad:     "#dc2626",
  neutral: "#3d3730",
};

const cardStyle: React.CSSProperties = {
  borderRadius: "1rem",
  backgroundColor: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.06)",
  border: "1px solid #e5e0d8",
  display: "flex",
  flexDirection: "column",
  gap: 0,
  overflow: "hidden",
};

const headerLabelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: "#a09880",
};

const bodyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  width: "100%",
  minWidth: 0,
};

const headlineStyle: React.CSSProperties = {
  marginTop: "0.25rem",
  fontSize: "1.25rem",
  fontWeight: 600,
  lineHeight: 1.3,
  color: "#1c1a17",
};

const chipsWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginTop: "0.75rem",
};

const chipBase: React.CSSProperties = {
  display: "inline-block",
  padding: "0.25rem 0.75rem",
  borderRadius: "9999px",
  fontSize: "0.75rem",
  fontWeight: 500,
  backgroundColor: "#f5f2ee",
  color: "#3d3730",
};


const rowKeyStyle: React.CSSProperties = { color: "#6b6457" };
const rowValStyle: React.CSSProperties = { color: "#1c1a17", fontWeight: 500 };

const footerStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#a09880",
  marginTop: "0.5rem",
};

const detailsContentStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
};

const detailsContentInlineStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
};

const sidebarTitleStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  color: "#a09880",
  margin: "0 0 0.75rem",
};

const summaryContentWrapStyle: React.CSSProperties = {
  marginTop: "0.75rem",
};

const dividerStyle: React.CSSProperties = {
  borderTop: "1px solid #f0ece6",
  marginTop: "1.25rem",
  marginBottom: 0,
};

export type InsightCardProps = {
  id?: string;
  title: string;
  variant?: InsightCardVariant;
  layout?: "auto" | "wide";
  icon?: ReactNode;
  headline?: ReactNode;
  summaryContent?: ReactNode;
  defaultOpen?: boolean;
  childrenInline?: boolean;
  dividerBeforeDetails?: boolean;
  chips?: ChipItem[];
  rows?: RowItem[];
  sidebar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

const DEFAULT_VARIANT: InsightCardVariant = "data";


function CardHeader({ title }: { title: string }) {
  return (
    <div className="insight-card__header">
      <span style={headerLabelStyle}>{title}</span>
    </div>
  );
}

function CardContent({
  title,
  headline,
  summaryContent,
  childrenInline,
  dividerBeforeDetails,
  omitHeader,
  chips,
  rows,
  footer,
  children,
}: {
  title: string;
  headline?: ReactNode;
  summaryContent?: ReactNode;
  childrenInline?: boolean;
  dividerBeforeDetails?: boolean;
  omitHeader?: boolean;
  chips: ChipItem[];
  rows: RowItem[];
  footer?: ReactNode;
  children: ReactNode;
}) {
  const summaryBlock = (
    <>
      {headline ? <div style={headlineStyle}>{headline}</div> : null}
      {summaryContent != null ? (
        <div style={summaryContentWrapStyle}>{summaryContent}</div>
      ) : chips.length > 0 ? (
        <div style={chipsWrapStyle}>
          {chips.map((c, i) => {
            const tone = c.tone ?? "neutral";
            return (
              <span key={`${c.label}-${i}`} style={{ ...chipBase, color: chipToneTextColor[tone] }}>
                {c.label}
              </span>
            );
          })}
        </div>
      ) : null}
      {rows.length > 0 ? (
        <div className="insight-card-rows-grid">
          {rows.map((r, i) => (
            <div key={`${r.k}-${i}`}>
              <span style={rowKeyStyle}>{r.k}</span>
              <span style={rowValStyle}>{r.v}</span>
            </div>
          ))}
        </div>
      ) : null}
      {footer ? <div style={footerStyle}>{footer}</div> : null}
    </>
  );

  const detailsBlock = childrenInline ? (
    <div style={detailsContentInlineStyle}>{children}</div>
  ) : (
    <div style={detailsContentStyle}>{children}</div>
  );

  return (
    <>
      {omitHeader ? null : <CardHeader title={title} />}
      <div className={omitHeader ? undefined : "insight-card__body"} style={bodyStyle}>
        {summaryBlock}
        {dividerBeforeDetails ? <div style={dividerStyle} role="separator" /> : null}
        {detailsBlock}
      </div>
    </>
  );
}

const wideSectionWrapStyle: React.CSSProperties = {
  maxWidth: 1200,
  width: "100%",
  boxSizing: "border-box",
};

const wideContentGridStyle: React.CSSProperties = {
  display: "grid",
  width: "100%",
  minWidth: 0,
  alignItems: "stretch",
  boxSizing: "border-box",
};

const wideSidebarStyle: React.CSSProperties = {
  width: "100%",
  justifySelf: "stretch",
  boxSizing: "border-box",
  padding: "1.25rem 1.5rem",
  border: "1px solid #e5e0d8",
  borderRadius: "0.75rem",
  backgroundColor: "#faf8f5",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};


export function InsightCard({
  id,
  title,
  variant = DEFAULT_VARIANT,
  layout = "auto",
  headline,
  summaryContent,
  childrenInline,
  dividerBeforeDetails = false,
  chips = [],
  rows = [],
  sidebar,
  footer,
  children,
}: InsightCardProps) {
  const isWideLayout = layout === "wide";
  const inlineChildren = childrenInline === true;

  const content = (
    <CardContent
      title={title}
      headline={headline}
      summaryContent={summaryContent}
      childrenInline={inlineChildren}
      dividerBeforeDetails={dividerBeforeDetails}
      chips={chips}
      rows={rows}
      footer={footer}
    >
      {children}
    </CardContent>
  );

  if (isWideLayout) {
    const hasSidebar = sidebar != null;
    return (
      <div className="insight-card-wide-wrap" style={wideSectionWrapStyle}>
        <section
          id={id}
          style={{ ...cardStyle, width: "100%" }}
          data-section-title
          className="insight-card insight-card--wide"
        >
          <CardHeader title={title} />
          <div
            className="insight-card__inner"
            style={wideContentGridStyle}
          >
            <div className="insight-card__main" style={{ minWidth: 0, width: "100%" }}>
              <CardContent
                title={title}
                headline={headline}
                summaryContent={summaryContent}
                childrenInline={inlineChildren}
                dividerBeforeDetails={dividerBeforeDetails}
                omitHeader
                chips={chips}
                rows={rows}
                footer={footer}
              >
                {children}
              </CardContent>
            </div>
            {hasSidebar ? (
              <aside
                className="insight-card__sidebar"
                style={wideSidebarStyle}
                aria-label="Quick stats"
              >
                <div style={sidebarTitleStyle}>Quick stats</div>
                {sidebar}
              </aside>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <section id={id} style={cardStyle} className="insight-card" data-section-title>
      {content}
    </section>
  );
}
