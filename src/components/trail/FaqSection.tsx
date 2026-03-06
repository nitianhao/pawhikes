type FaqItem = { q: string; a: string; confidence?: string };

type Props = { faqs?: FaqItem[] | unknown };

const CONF_DOT: Record<string, string> = {
  high: "#15803d",    // green-700
  medium: "#d97706",  // amber-600
  low: "#dc2626",     // red-600
};

export function FaqSection({ faqs }: Props) {
  const items = Array.isArray(faqs) ? (faqs as FaqItem[]) : [];
  if (items.length === 0) return null;

  return (
    <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.875rem" }}>
      {items.map((faq, i) => (
        <div
          key={i}
          style={{
            borderBottom: i < items.length - 1 ? "1px solid #e5e7eb" : undefined,
            paddingBottom: i < items.length - 1 ? "0.875rem" : undefined,
          }}
        >
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
