const LOCALHOST_FALLBACK = "http://localhost:3000";

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return LOCALHOST_FALLBACK;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withProtocol.replace(/\/$/, "");
}

export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL ??
    LOCALHOST_FALLBACK;

  return normalizeBaseUrl(raw);
}

export function getSiteName(): string {
  return "Paw Hikes";
}

export function absoluteUrl(pathname: string): string {
  const base = getSiteUrl();
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${base}${path}`;
}
