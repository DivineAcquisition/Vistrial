import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/marketing/hosts";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/app",
          "/portal",
          "/stellar",
          "/api/",
          "/auth/",
          "/accept-invite",
          "/login",
          "/request",
          "/thanks",
          "/contact",
          "/privacy",
          "/terms",
          "/disclaimer",
          "/book",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
