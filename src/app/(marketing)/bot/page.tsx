import type { Metadata } from "next";

import { publicPageMetadata } from "@/lib/seo";

import { MarketingShell } from "@/components/marketing/chrome";
import { CONTACT_EMAIL } from "@/lib/constants";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = publicPageMetadata({
  title: "VistrialBot",
  description: "What VistrialBot is, which pages it reads, and how to keep it off a site.",
  path: "/bot",
});

/** The page VistrialBot's user agent points to, so a site owner who sees it in their logs can find out what it is. */
export default function BotPage() {
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>VistrialBot</h1>
        <p className={`${marketingSubhead} mt-4`}>
          VistrialBot reads a public web page when a Vistrial customer asks for that page to be reviewed. It identifies itself as{" "}
          <code className="text-strong">VistrialBot/1.0 (+https://vistrial.io/bot)</code> on every request.
        </p>
        <p className={`${marketingSubhead} mt-4`}>
          It reads only pages a customer names, a few at a time. It follows robots.txt, including Crawl-delay, and waits at least four seconds between requests to one site. It does not log in, fill in forms,
          solve CAPTCHAs, get around paywalls or bot checks, or hide what it is. If a site refuses a request, it stops.
        </p>
        <p className={`${marketingSubhead} mt-4`}>
          To keep it off a site, add this to the site&apos;s robots.txt:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted px-4 py-3 text-sm text-strong">
          {"User-agent: VistrialBot\nDisallow: /"}
        </pre>
        <p className={`${marketingSubhead} mt-4`}>Questions or a problem with its behaviour: {CONTACT_EMAIL}</p>
      </article>
    </MarketingShell>
  );
}
