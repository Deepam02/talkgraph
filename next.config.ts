import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // The canvas needs the microphone on our own origin only.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
