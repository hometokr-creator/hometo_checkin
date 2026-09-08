import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
];

const nextConfig: NextConfig = {
  logging: false, // Access-token paths must not be printed by the dev server.
  async headers() {
    return [
      { source: "/admin/:path*", headers: securityHeaders },
      { source: "/api/checkin/:path*", headers: securityHeaders },
      {
        source: "/c/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
