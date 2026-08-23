import type { MetadataRoute } from "next";

import { siteOrigin } from "@/lib/marketing/hosts";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  const lastModified = new Date();
  return [
    { url: origin, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/contact`, lastModified, changeFrequency: "yearly", priority: 0.4 },
    { url: `${origin}/privacy`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/terms`, lastModified, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/disclaimer`, lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
