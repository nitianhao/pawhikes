import { absoluteUrl } from "@/lib/seo/site";
import { normalizeBreadcrumbs } from "@/lib/seo/entities";

type Crumb = {
  name: string;
  path: string;
};

function normalizeSchemaPath(path: string): string {
  const raw = String(path ?? "").trim();
  if (!raw) return "/";
  const noFragment = raw.split("#")[0] ?? raw;
  const noQuery = noFragment.split("?")[0] ?? noFragment;
  return noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
}

export function websiteSchema(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Paw Hikes",
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: `${absoluteUrl("/search")}?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function breadcrumbSchema(crumbs: Crumb[]): Record<string, unknown> {
  const normalized = normalizeBreadcrumbs(crumbs);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: normalized.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(normalizeSchemaPath(crumb.path)),
    })),
  };
}

export function collectionPageSchema(input: {
  name: string;
  description: string;
  path: string;
  about?: {
    name: string;
    path: string;
  } | null;
}): Record<string, unknown> {
  const page: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: input.name,
    description: input.description,
    url: absoluteUrl(normalizeSchemaPath(input.path)),
  };
  if (input.about) {
    page.about = {
      "@type": "Place",
      name: input.about.name,
      url: absoluteUrl(normalizeSchemaPath(input.about.path)),
    };
  }
  return page;
}

export function trailPlaceSchema(input: {
  name: string;
  description: string;
  path: string;
  city: string | null;
  state: string | null;
  geo?: { lat: number; lon: number } | null;
}): Record<string, unknown> {
  const place: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Place",
    "@id": `${absoluteUrl(normalizeSchemaPath(input.path))}#trail`,
    name: input.name,
    description: input.description,
    url: absoluteUrl(normalizeSchemaPath(input.path)),
  };

  if (input.city || input.state) {
    place.address = {
      "@type": "PostalAddress",
      addressLocality: input.city ?? undefined,
      addressRegion: input.state ?? undefined,
      addressCountry: "US",
    };
  }
  if (input.geo) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: input.geo.lat,
      longitude: input.geo.lon,
    };
  }

  return place;
}

export function trailWebPageSchema(input: {
  name: string;
  description: string;
  path: string;
}): Record<string, unknown> {
  const url = absoluteUrl(normalizeSchemaPath(input.path));
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: input.name,
    description: input.description,
    url,
    mainEntity: {
      "@id": `${url}#trail`,
    },
  };
}

export type FaqSchemaItem = {
  question: string;
  answer: string;
};

export function faqPageSchema(input: {
  path: string;
  items: FaqSchemaItem[];
}): Record<string, unknown> | null {
  const items = input.items
    .map((item) => ({
      question: String(item.question ?? "").trim(),
      answer: String(item.answer ?? "").trim(),
    }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0);
  if (items.length === 0) return null;

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url: absoluteUrl(normalizeSchemaPath(input.path)),
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}
