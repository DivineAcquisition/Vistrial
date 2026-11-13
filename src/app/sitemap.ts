import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/marketing/hosts";
import { sitemapEntries } from "@/lib/seo";
import { loadTrustPublic } from "@/lib/trust/public";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const trust = await loadTrustPublic();
  return sitemapEntries(siteOrigin(), trust);
}
