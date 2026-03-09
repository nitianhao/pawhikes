type JsonLdProps = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
  id?: string;
};

function toJsonLdString(data: JsonLdProps["data"]): string {
  // Prevent accidental script-breakouts from user/content strings.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function JsonLd({ data, id }: JsonLdProps) {
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: toJsonLdString(data) }}
    />
  );
}
