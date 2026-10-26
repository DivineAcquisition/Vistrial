import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { COMPANY_ADDRESS, CONTACT_EMAIL, LEGAL_ENTITY } from "@/lib/constants";
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
        <p className="rounded-[12px] border border-border bg-muted px-4 py-3 text-sm text-strong">{LEGAL_DRAFT_BANNER}</p>
        <h1 className={`${marketingHeroTitle} mt-8 text-[2.1rem] sm:text-4xl`}>Disclaimer</h1>
        <p className={`${marketingSubhead} mt-4`}>
          Nothing on this site is a promise of bookings, sales, or revenue. The Privacy Policy and the Terms of Service stay drafts until a Platform Admin approves them.
        </p>
        <p className={`${marketingSubhead} mt-4`}>
          {LEGAL_ENTITY}. {COMPANY_ADDRESS}. {CONTACT_EMAIL}
        </p>
      </article>
    </MarketingShell>
  );
}
