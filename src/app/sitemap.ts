import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/marketing/hosts";
import { loadTrustPublic } from "@/lib/trust/public";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const lastModified = new Date();
  const trust = await loadTrustPublic();
  const pages: MetadataRoute.Sitemap = [
    { url: origin, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/security`, lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/security/subprocessors`, lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: `${origin}/security/report`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/privacy/requests`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/cookies`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
  if (trust.privacyLive) pages.push({ url: `${origin}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 });
  if (trust.termsLive) pages.push({ url: `${origin}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 });
  return pages;
}
