import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  basePath: "/new-app",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "staging.brinx.ai",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8888",
      },
      {
        protocol: "http",
        hostname: "flask",
        port: "8888",
      },
    ],
  },
};

export default nextConfig;
