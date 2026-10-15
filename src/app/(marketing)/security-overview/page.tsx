import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { SECURITY_PAGE } from "@/lib/marketing/content";
import { marketingHeroTitle } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: SECURITY_PAGE.title,
  description: SECURITY_PAGE.description,
};

export default function SecurityOverviewPage() {
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm leading-relaxed text-silver">
          {SECURITY_PAGE.draft}
        </p>
        <h1 className={`${marketingHeroTitle} mt-8 text-[2.1rem] sm:text-4xl`}>{SECURITY_PAGE.title}</h1>
        <div className="mt-8 space-y-8">
          {SECURITY_PAGE.sections.map((section) => (
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
