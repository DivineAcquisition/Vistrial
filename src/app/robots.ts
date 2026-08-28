import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/marketing/hosts";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/portal", "/api/", "/auth/", "/accept-invite", "/login"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
