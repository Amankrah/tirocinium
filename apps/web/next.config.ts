import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Guide 5: images go through next/image exclusively. The fig:// resolver
  // (Phase 2.3, decision 0014) renders seeded figures for now; remote patterns
  // for the signed figure and thumbnail URLs land with ingestion in Phase 4.
  // The shop photograph on a matched project line is the one exception that is
  // already a public image (decision 0111): only that host, only their files.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/files/**",
      },
    ],
  },
};

export default nextConfig;
