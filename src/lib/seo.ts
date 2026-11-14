import type { Metadata, MetadataRoute } from "next";

import { APP_NAME, CONTACT_EMAIL, LEGAL_ENTITY } from "@/lib/constants";
import { HERO, SITE_DESCRIPTION, SOCIAL_IMAGE } from "@/lib/marketing/content";
import { PRICING_DISPLAY } from "@/lib/marketing/pricing";

/**
 * What search engines are told about the public site, in one place: the pages that exist, which of them
 * are listed, what robots.txt keeps out, and the structured data on the home page. The signed-in app and the
 * sign-in pages are never listed; each also says `noindex` in its own metadata.
 */

type PublicPage = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
  priority: number;
  /** Only listed once the page is live (privacy and terms wait for their published versions). */
  gate?: "privacy" | "terms";
};

export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/security", changeFrequency: "monthly", priority: 0.6 },
  { path: "/security/subprocessors", changeFrequency: "monthly", priority: 0.4 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3, gate: "privacy" },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3, gate: "terms" },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.3 },
  { path: "/disclaimer", changeFrequency: "yearly", priority: 0.3 },
  { path: "/bot", changeFrequency: "yearly", priority: 0.3 },
  // Public, linked from the security and privacy pages.
  { path: "/security/report", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy/requests", changeFrequency: "yearly", priority: 0.3, gate: "privacy" },
];

/**
 * Kept out of crawling: the app, account flows, internal pages and the stories. Sign-in and sign-up are not
 * blocked here on purpose: a crawler that cannot fetch them cannot see their `noindex`, and a blocked URL
 * that is linked from the site can still be listed without its content.
 */
export const PRIVATE_PREFIXES = [
  "/app",
  "/admin",
  "/portal",
  "/stellar",
  "/api/",
  "/auth/",
  "/join",
  "/accept-invite",
  "/login",
  // The access and contact forms stay out of search (owner decision, 2026-11-13).
  "/request",
  "/contact",
  "/thanks",
  "/dev/",
  "/security/review",
] as const;

/** Paths that must never appear in the sitemap. */
export const NEVER_LISTED = [...PRIVATE_PREFIXES, "/sign-in", "/sign-up"] as const;

export type TrustFlags = { privacyLive: boolean; termsLive: boolean };

function live(page: PublicPage, trust: TrustFlags) {
  if (page.gate === "privacy") return trust.privacyLive;
  if (page.gate === "terms") return trust.termsLive;
  return true;
}

export function sitemapEntries(origin: string, trust: TrustFlags, lastModified = new Date()): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.filter((page) => live(page, trust)).map((page) => ({
    url: page.path === "/" ? origin : `${origin}${page.path}`,
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}

export function robotsDisallow(trust: TrustFlags): string[] {
  // A draft page stays out of search until it is live.
  const drafts = PUBLIC_PAGES.filter((page) => !live(page, trust)).map((page) => page.path);
  return [...PRIVATE_PREFIXES, ...drafts];
}

/**
 * Organization and SoftwareApplication for the home page. Only facts the site states: the operator, the
 * contact address, and the price the pricing section shows. No ratings or reviews.
 */
export function homeJsonLd(origin: string) {
  const organization = `${origin}/#organization`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organization,
        name: APP_NAME,
        legalName: LEGAL_ENTITY,
        url: origin,
        logo: `${origin}/icons/icon-512.png`,
        email: CONTACT_EMAIL,
        contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: CONTACT_EMAIL },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#software`,
        name: APP_NAME,
        url: origin,
        headline: HERO.headline,
        description: SITE_DESCRIPTION,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        publisher: { "@id": organization },
        offers: {
          "@type": "Offer",
          name: "Private Access",
          price: "179",
          priceCurrency: "USD",
          description: PRICING_DISPLAY.privateAccess.price,
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: "179",
            priceCurrency: "USD",
            unitText: "MONTH",
          },
        },
      },
    ],
  };
}

/** JSON for a `<script type="application/ld+json">`, with `<` escaped so text can never close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Metadata for a public page: its title and description, its canonical URL, and Open Graph and Twitter cards
 * that keep the site's name and image. A page's `openGraph` replaces the layout's whole object rather than
 * merging with it, so every field is set here.
 */
export function publicPageMetadata({ title, description, path, index = true }: { title: string; description: string; path: string; index?: boolean }): Metadata {
  const social = `${title} · ${APP_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      title: social,
      description,
      url: path,
      siteName: APP_NAME,
      type: "website",
      locale: "en_US",
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: social,
      description,
      images: [SOCIAL_IMAGE.url],
    },
  };
}
