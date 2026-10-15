import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { LEGAL_DRAFT_BANNER } from "@/lib/marketing/content";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Disclaimer",
  robots: { index: false, follow: false },
};

export default function DisclaimerPage() {
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <p className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-white">{LEGAL_DRAFT_BANNER}</p>
        <h1 className={`${marketingHeroTitle} mt-8 text-[2.1rem] sm:text-4xl`}>Disclaimer</h1>
        <p className={`${marketingSubhead} mt-4`}>
          [Counsel will replace this page.] Nothing on the public site is a promise of results.
        </p>
      </article>
    </MarketingShell>
  );
}
