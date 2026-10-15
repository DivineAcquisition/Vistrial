import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { LEGAL_DRAFT_BANNER, TERMS_PAGE } from "@/lib/marketing/content";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: TERMS_PAGE.title,
  description: TERMS_PAGE.description,
  robots: { index: false, follow: false },
};

export default function TermsPage() {
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-white">
          {LEGAL_DRAFT_BANNER}
        </p>
        <h1 className={`${marketingHeroTitle} mt-8 text-[2.1rem] sm:text-4xl`}>{TERMS_PAGE.title}</h1>
        <p className={`${marketingSubhead} mt-4`}>{TERMS_PAGE.body}</p>
      </article>
    </MarketingShell>
  );
}
