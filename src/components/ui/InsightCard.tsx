import type { ReactNode } from "react";
import {
  PawPrint,
  CloudRain,
  MapPin,
  ShieldCheck,
  Sparkles,
  BarChart2,
} from "lucide-react";

export type ChipItem = { label: string; tone?: "good" | "warn" | "bad" | "neutral" };
export type RowItem = { k: string; v: ReactNode };

export type InsightCardVariant = "dog" | "conditions" | "planning" | "safety" | "highlights" | "data";

/** Accent color — used for icon + title text in band */
const variantAccentColor: Record<InsightCardVariant, string> = {
  dog:        "#15803d", // green-700
  conditions: "#b45309", // amber-700
  planning:   "#15803d", // green-700
  safety:     "#b91c1c", // red-700
  highlights: "#6d28d9", // purple-700
  data:       "#475569", // slate-600
};

/** Tinted background for the header band */
const variantBandBg: Record<InsightCardVariant, string> = {
  dog:        "#dcfce7", // green-100
  conditions: "#fef3c7", // amber-100
  planning:   "#dcfce7", // green-100
  safety:     "#fee2e2", // red-100
  highlights: "#ede9fe", // purple-100
  data:       "#f1f5f9", // slate-100
};

/** Icon background inside the circular badge */
const variantIconBg: Record<InsightCardVariant, string> = {
  dog:        "#16a34a", // green-600
  conditions: "#d97706", // amber-600
  planning:   "#16a34a", // green-600
  safety:     "#dc2626", // red-600
  highlights: "#7c3aed", // purple-600
  data:       "#64748b", // slate-500
};

const ICON_SIZE = 16;

const variantIcon: Record<InsightCardVariant, ReactNode> = {
  dog:        <PawPrint size={ICON_SIZE} aria-hidden />,
  conditions: <CloudRain size={ICON_SIZE} aria-hidden />,
  planning:   <MapPin size={ICON_SIZE} aria-hidden />,
  safety:     <ShieldCheck size={ICON_SIZE} aria-hidden />,
  highlights: <Sparkles size={ICON_SIZE} aria-hidden />,
  data:       <BarChart2 size={ICON_SIZE} aria-hidden />,
};

const chipToneTextColor: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good:    "#15803d",
  warn:    "#d97706",
  bad:     "#dc2626",
  neutral: "#334155",
};

const cardStyle: React.CSSProperties = {
  borderRadius: "1rem",
  backgroundColor: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
  border: "1px solid #e2e8f0",
  display: "flex",
  flexDirection: "column",
  gap: 0,
  overflow: "hidden",
};

const bandStyle = (bg: string): React.CSSProperties => ({
  backgroundColor: bg,
  padding: "0.75rem 1.5rem",
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
});

const iconBadgeStyle = (bg: string): React.CSSProperties => ({
  width: "2rem",
  height: "2rem",
  borderRadius: "50%",
  backgroundColor: bg,
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
});

const bandTitleStyle = (color: string): React.CSSProperties => ({
  fontSize: "0.8125rem",
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase" as const,
  color,
  margin: 0,
});

const bodyStyle: React.CSSProperties = {
  padding: "1.25rem 1.5rem 1.5rem",
  display: "flex",
  flexDirection: "column",
  gap: 0,
  width: "100%",
  minWidth: 0,
};

const headlineStyle: React.CSSProperties = {
  marginTop: "0.25rem",
  fontSize: "1.2rem",
  fontWeight: 600,
  lineHeight: 1.3,
  color: "#0f172a",
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
  backgroundColor: "#f1f5f9",
  color: "#334155",
};

const rowsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.5rem 1.5rem",
  fontSize: "0.875rem",
  marginTop: "1rem",
};

const rowKeyStyle: React.CSSProperties = { color: "#64748b" };
const rowValStyle: React.CSSProperties = { color: "#0f172a", fontWeight: 500 };

const footerStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#94a3b8",
  marginTop: "0.5rem",
};

const detailsStyle: React.CSSProperties = {
  marginTop: "1.25rem",
};

const summaryStyle: React.CSSProperties = {
  cursor: "pointer",
  listStyle: "none",
  fontSize: "0.875rem",
  color: "#64748b",
  outlineOffset: 2,
};

const detailsContentStyle: React.CSSProperties = {
  marginTop: "1rem",
  borderTop: "1px solid #e2e8f0",
  paddingTop: "1rem",
  width: "100%",
  minWidth: 0,
};

const detailsContentInlineStyle: React.CSSProperties = {
  marginTop: 0,
  paddingTop: 0,
  width: "100%",
  minWidth: 0,
};

const sidebarTitleStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  letterSpacing: "0.025em",
  color: "#64748b",
  margin: "0 0 0.5rem",
};

const summaryContentWrapStyle: React.CSSProperties = {
  marginTop: "0.75rem",
};

const dividerStyle: React.CSSProperties = {
  borderTop: "1px solid #e2e8f0",
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
  /** Pictogram summary (MetricGrid, MiniMeters). When set, chips are not rendered. */
  summaryContent?: ReactNode;
  /** When true, the "View detailed breakdown" details block is open by default. */
  defaultOpen?: boolean;
  /** When true, children are rendered directly in the card body (no details/summary wrapper). Use for content that should sit one level higher, e.g. Trailheads. */
  childrenInline?: boolean;
  /** When true, a divider is shown between the summary block (headline/rows) and the details/children. */
  dividerBeforeDetails?: boolean;
  chips?: ChipItem[];
  rows?: RowItem[];
  sidebar?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

const DEFAULT_VARIANT: InsightCardVariant = "data";

const bodyStyleNoPadding: React.CSSProperties = {
  ...bodyStyle,
  padding: 0,
};

function CardContent({
  variant,
  title,
  headline,
  summaryContent,
  defaultOpen,
  childrenInline,
  dividerBeforeDetails,
  omitBand,
  chips,
  rows,
  footer,
  children,
}: {
  variant: InsightCardVariant;
  title: string;
  headline?: ReactNode;
  summaryContent?: ReactNode;
  defaultOpen?: boolean;
  childrenInline?: boolean;
  dividerBeforeDetails?: boolean;
  /** When true, render only the body (no header band). Used when band is rendered separately above the grid. */
  omitBand?: boolean;
  chips: ChipItem[];
  rows: RowItem[];
  footer?: ReactNode;
  children: ReactNode;
}) {
  const accentColor = variantAccentColor[variant];
  const bandBg = variantBandBg[variant];
  const iconBg = variantIconBg[variant];
  const icon = variantIcon[variant];

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
        <div style={rowsGridStyle}>
          {rows.map((r, i) => (
            <div key={`${r.k}-${i}`} style={{ display: "contents" }}>
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
    <details style={detailsStyle} open={defaultOpen}>
      <summary style={summaryStyle} className="collapsible-summary insight-card-summary">
        View detailed breakdown
      </summary>
      <div style={detailsContentStyle}>{children}</div>
    </details>
  );

  const bodyWrapperStyle = omitBand ? bodyStyleNoPadding : bodyStyle;

  return (
    <>
      {omitBand ? null : (
        <div style={bandStyle(bandBg)} aria-hidden={false}>
          <div style={iconBadgeStyle(iconBg)}>{icon}</div>
          <h2 style={bandTitleStyle(accentColor)}>{title}</h2>
        </div>
      )}
      <div style={bodyWrapperStyle}>
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

const wideHeaderRowStyle = (bg: string): React.CSSProperties => ({
  ...bandStyle(bg),
  width: "100%",
  boxSizing: "border-box",
  flexShrink: 0,
});

const wideContentGridStyle: React.CSSProperties = {
  display: "grid",
  gap: "1.5rem",
  padding: "1.5rem",
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
  border: "1px solid #e2e8f0",
  borderRadius: "0.75rem",
  backgroundColor: "#fff",
  boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
};


export function InsightCard({
  id,
  title,
  variant = DEFAULT_VARIANT,
  layout = "auto",
  headline,
  summaryContent,
  defaultOpen,
  childrenInline,
  dividerBeforeDetails = false,
  chips = [],
  rows = [],
  sidebar,
  footer,
  children,
}: InsightCardProps) {
  const isWideLayout = layout === "wide";
  // Conditions section: always show content inline (no "View detailed breakdown" link)
  const inlineChildren = childrenInline === true || id === "conditions";

  const content = (
    <CardContent
      variant={variant}
      title={title}
      headline={headline}
      summaryContent={summaryContent}
      defaultOpen={defaultOpen}
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
    const accentColor = variantAccentColor[variant];
    const bandBg = variantBandBg[variant];
    const iconBg = variantIconBg[variant];
    const icon = variantIcon[variant];
    const bandNode = (
      <div
        className="insight-card__header-row"
        style={wideHeaderRowStyle(bandBg)}
        aria-hidden={false}
      >
        <div style={iconBadgeStyle(iconBg)}>{icon}</div>
        <h2 style={bandTitleStyle(accentColor)}>{title}</h2>
      </div>
    );
    const mainContent = (
      <CardContent
        variant={variant}
        title={title}
        headline={headline}
        summaryContent={summaryContent}
        defaultOpen={defaultOpen}
        childrenInline={inlineChildren}
        dividerBeforeDetails={dividerBeforeDetails}
        omitBand
        chips={chips}
        rows={rows}
        footer={footer}
      >
        {children}
      </CardContent>
    );
    const hasSidebar = sidebar != null;
    return (
      <div className="insight-card-wide-wrap" style={wideSectionWrapStyle}>
        <section
          id={id}
          style={{ ...cardStyle, width: "100%" }}
          data-section-title
          className="insight-card insight-card--wide"
        >
          {bandNode}
          <div
            className="insight-card__inner"
            style={wideContentGridStyle}
          >
            <div className="insight-card__main" style={{ minWidth: 0, width: "100%" }}>
              {mainContent}
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
    <section id={id} style={cardStyle} data-section-title>
      {content}
    </section>
  );
}
