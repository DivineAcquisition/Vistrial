import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/marketing/hosts";
import { loadTrustPublic } from "@/lib/trust/public";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = siteOrigin();
  const trust = await loadTrustPublic();
  const disallow = [
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
    // Drafts stay out of search until they are live.
    ...(trust.termsLive ? [] : ["/terms"]),
    "/disclaimer",
    "/book",
    "/security/review",
    trust.privacyLive ? "/privacy/requests" : "/privacy",
  ];
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow,
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
