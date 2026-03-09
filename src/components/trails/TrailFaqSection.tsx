import type { CSSProperties } from "react";
import { space, type as t, color } from "@/design/tokens";
import { Section } from "@/components/ui/Section";
import { Disclosure } from "@/components/ui/Disclosure";

export type VisibleFaqItem = { q: string; a: string; confidence?: string };

export type TrailFaqSectionProps = {
  faqs: unknown;
};

const answerStyle: CSSProperties = {
  ...t.body,
  color: color.textSecondary,
  margin: 0,
};

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: space[3],
};

function faqAnchorId(question: string): string {
  return `faq-${question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "item"}`;
}

export function normalizeVisibleFaqs(raw: unknown): VisibleFaqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is VisibleFaqItem =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as VisibleFaqItem).q === "string" &&
      typeof (x as VisibleFaqItem).a === "string"
  );
}

export function TrailFaqSection({ faqs }: TrailFaqSectionProps) {
  const items = normalizeVisibleFaqs(faqs);
  if (items.length === 0) return null;

  return (
    <Section
      id="faqs"
      title="Frequently Asked Questions"
      subtitle="Common questions about dogs on this trail"
    >
      <div style={listStyle}>
        {items.map((faq) => (
          <article key={faq.q} id={faqAnchorId(faq.q)}>
            <Disclosure label={faq.q}>
              <p style={answerStyle}>{faq.a}</p>
            </Disclosure>
          </article>
        ))}
      </div>
    </Section>
  );
}
