import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { LegalDraft } from "@/components/marketing/legal-draft";
import { loadTrustPublic } from "@/lib/trust/public";
import { marketingHeroTitle, marketingLead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms for using Vistrial.",
  robots: { index: false, follow: false },
};

export default async function TermsPage() {
  const trust = await loadTrustPublic();
  if (!trust.termsLive || !trust.legalEntity || !trust.mailingAddress) {
    return (
      <MarketingShell headerAction="none">
        <article className="mx-auto max-w-xl px-5 py-20">
          <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Terms</h1>
          <p className={`${marketingLead} mt-4`}>The terms are not published yet.</p>
        </article>
      </MarketingShell>
    );
  }
  return (
    <MarketingShell headerAction="none">
      <LegalDraft kind="terms" trust={trust} />
    </MarketingShell>
  );
}
