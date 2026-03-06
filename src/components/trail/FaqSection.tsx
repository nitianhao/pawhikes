type FaqItem = { q: string; a: string; confidence?: string };

type Props = { faqs?: unknown };

const CONF_DOT: Record<string, string> = {
  high: "#15803d",    // green-700
  medium: "#d97706",  // amber-600
  low: "#dc2626",     // red-600
};

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
};

function dividerStyle(isLast: boolean): React.CSSProperties | undefined {
  return isLast ? undefined : { borderBottom: "1px solid #e5e7eb", paddingBottom: "0.875rem" };
}

export function FaqSection({ faqs }: Props) {
  const items = Array.isArray(faqs)
    ? (faqs as unknown[]).filter(
        (x): x is FaqItem =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as FaqItem).q === "string" &&
          typeof (x as FaqItem).a === "string"
      )
    : [];
  if (items.length === 0) return null;

  return (
    <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      {items.map((faq, i) => (
        <div key={faq.q} style={dividerStyle(i === items.length - 1)}>
          <dt
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "#111827",
              lineHeight: 1.4,
              marginBottom: "0.3rem",
            }}
          >
            {faq.confidence && (
              <>
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-block",
                    width: "0.5rem",
                    height: "0.5rem",
                    borderRadius: "50%",
                    background: CONF_DOT[faq.confidence] ?? "#9ca3af",
                    flexShrink: 0,
                    marginTop: "0.35rem",
                  }}
                />
                <span style={srOnly}>{faq.confidence} confidence</span>
              </>
            )}
            {faq.q}
          </dt>
          <dd
            style={{
              margin: 0,
              fontSize: "0.875rem",
              color: "#374151",
              lineHeight: 1.6,
              paddingLeft: faq.confidence ? "1rem" : 0,
            }}
          >
            {faq.a}
          </dd>
        </div>
      ))}
    </dl>
  );
}
