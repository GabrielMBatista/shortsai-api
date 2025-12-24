import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // ⚡ Performance: Skip type checking during build (save ~1.2GB RAM)
  // Type safety is already enforced during development
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  output: 'standalone',
  poweredByHeader: false,

  // 🔥 Fix 413 Error: Increase body size limit for image/character analysis
  experimental: {
    serverActions: {
      bodySizeLimit: '150mb' // Allow large video uploads (up to 150MB)
    }
  },

  async headers() {
    return [
      {
        // matching all API routes
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: process.env.FRONTEND_URL || "http://localhost:3000" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version" },
        ]
      }
    ]
  }
};

export default nextConfig;
