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
};

export default nextConfig;
