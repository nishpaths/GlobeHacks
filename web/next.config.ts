import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    // Allow importing shared contracts (TS/JSON) from `../contracts` at repo root.
    externalDir: true,
  },
  turbopack: {
    // Pin the Turbopack workspace root to web/ so it doesn't get confused by
    // the package-lock.json at the repo root.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
