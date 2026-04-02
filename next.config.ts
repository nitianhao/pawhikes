import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next";

const nextConfig: NextConfig = {
  distDir,

  // Strip X-Powered-By header to reduce response size and avoid fingerprinting.
  poweredByHeader: false,

  // Compress responses with gzip (default true, made explicit).
  compress: true,

  // Image optimization disabled on external images (unoptimized prop) to avoid
  // Vercel transformation costs. Remote patterns kept for next/image src validation.
  images: {
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
