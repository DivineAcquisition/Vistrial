import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/marketing/hosts";
import { robotsDisallow } from "@/lib/seo";
import { loadTrustPublic } from "@/lib/trust/public";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = siteOrigin();
  const trust = await loadTrustPublic();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: robotsDisallow(trust),
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
