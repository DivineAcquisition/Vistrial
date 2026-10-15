import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/marketing/hosts";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const lastModified = new Date();
  return [
    { url: origin, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/security-overview`, lastModified, changeFrequency: "monthly", priority: 0.4 },
  ];
}
