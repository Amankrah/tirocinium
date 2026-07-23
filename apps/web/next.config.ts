import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Guide 5: images go through next/image exclusively. The fig:// resolver
  // (Phase 2.3, decision 0014) renders seeded figures for now; remote patterns
  // for the signed figure and thumbnail URLs land with ingestion in Phase 4.
};

export default nextConfig;
