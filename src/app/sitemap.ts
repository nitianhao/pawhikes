import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo/site";
import { loadIndexablePaths } from "@/lib/seo/sitemapData";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const paths = await loadIndexablePaths();

  return paths.map((entry) => ({
    url: absoluteUrl(entry.path),
    lastModified: entry.lastModified,
    changeFrequency: entry.path === "/" ? "daily" : "weekly",
    priority: entry.path === "/" ? 1 : entry.path.split("/").length >= 4 ? 0.6 : 0.8,
  }));
}
