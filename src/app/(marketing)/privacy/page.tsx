import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { LEGAL_DRAFT_BANNER, PRIVACY_PAGE } from "@/lib/marketing/content";
import { marketingHeroTitle } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: PRIVACY_PAGE.title,
  description: PRIVACY_PAGE.description,
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-white">
          {LEGAL_DRAFT_BANNER}
        </p>
        <h1 className={`${marketingHeroTitle} mt-8 text-[2.1rem] sm:text-4xl`}>{PRIVACY_PAGE.title}</h1>
        <div className="mt-8 space-y-8">
          {PRIVACY_PAGE.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="font-heading text-xl text-white">{section.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-silver">{section.body}</p>
            </section>
          ))}
        </div>
      </article>
    </MarketingShell>
  );
}
