import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next";

const nextConfig: NextConfig = {
  distDir,

  // Strip X-Powered-By header to reduce response size and avoid fingerprinting.
  poweredByHeader: false,

  // Compress responses with gzip (default true, made explicit).
  compress: true,

  // Allow images from Google Places (trailhead photos) and static assets.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "maps.googleapis.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
