import type { NextConfig } from "next";

const ContentSecurityPolicy = [
  "default-src 'self'",
  // apis.google.com and gstatic: Google's folder picker, used only on the Drive connection card.
  // clerk.vistrial.io: production sign-in. *.clerk.accounts.dev: the development instance.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://challenges.cloudflare.com https://clerk.vistrial.io https://*.clerk.accounts.dev https://*.protect.clerk.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://challenges.cloudflare.com https://clerk.vistrial.io https://*.clerk.accounts.dev https://clerk-telemetry.com https://*.clerk-telemetry.com https://*.protect.clerk.com https://*.protect.clerk.com:* https://*.client.protect.clerk.com https://*.client.protect.clerk.com:*",
  "frame-src 'self' https://link.msgsndr.com https://*.leadconnectorhq.com https://*.msgsndr.com https://docs.google.com https://content.googleapis.com https://challenges.cloudflare.com https://clerk.vistrial.io https://accounts.vistrial.io https://*.clerk.accounts.dev https://*.protect.clerk.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://clerk.vistrial.io https://accounts.vistrial.io https://*.clerk.accounts.dev",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "9mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/sw.js",
        headers: [{ key: "Service-Worker-Allowed", value: "/" }],
      },
    ];
  },
};

export default nextConfig;
