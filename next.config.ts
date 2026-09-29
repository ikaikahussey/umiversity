import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Badge evidence uploads (max 5 MB) go through a server action.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
