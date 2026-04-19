import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Allow importing shared contracts (TS/JSON) from `../contracts` at repo root.
    externalDir: true,
  },
};

export default nextConfig;
