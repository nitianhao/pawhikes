import type { Metadata } from "next";
import { absoluteUrl, getSiteName } from "@/lib/seo/site";
import { defaultOgImages } from "@/lib/seo/media";

type PageMetaInput = {
  title: string;
  description: string;
  pathname: string;
  index?: boolean;
  ogType?: "website" | "article";
  ogImages?: Array<{ url: string; alt?: string }>;
};

function normalizePathname(pathname: string): string {
  const raw = String(pathname ?? "").trim();
  if (!raw) return "/";
  const noFragment = raw.split("#")[0] ?? raw;
  const noQuery = noFragment.split("?")[0] ?? noFragment;
  const normalized = noQuery.startsWith("/") ? noQuery : `/${noQuery}`;
  return normalized || "/";
}

function safeTitle(value: string): string {
  const v = String(value ?? "").trim();
  return v.length > 0 ? v : "Paw Hikes";
}

function safeDescription(value: string): string {
  const v = String(value ?? "").trim();
  return v.length > 0
    ? v
    : "Dog-friendly hiking trail directory with city and trail details for dogs.";
}

export function buildPageMetadata(input: PageMetaInput): Metadata {
  const index = input.index ?? true;
  const title = safeTitle(input.title);
  const description = safeDescription(input.description);
  const canonicalPath = normalizePathname(input.pathname);
  const canonicalUrl = absoluteUrl(canonicalPath);
  const ogImages = input.ogImages && input.ogImages.length > 0
    ? input.ogImages
    : defaultOgImages();

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: index
      ? {
          index: true,
          follow: true,
        }
      : {
          index: false,
          follow: true,
          nocache: true,
        },
    openGraph: {
      type: input.ogType ?? "website",
      title,
      description,
      url: canonicalUrl,
      siteName: getSiteName(),
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImages.map((img) => img.url),
    },
  };
}
