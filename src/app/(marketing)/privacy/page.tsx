import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { LegalDraft } from "@/components/marketing/legal-draft";
import { loadTrustPublic } from "@/lib/trust/public";
import { marketingHeroTitle, marketingLead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Vistrial handles personal data.",
  robots: { index: false, follow: false },
};

export default async function PrivacyPage() {
  const trust = await loadTrustPublic();
  if (!trust.privacyLive || !trust.legalEntity || !trust.mailingAddress) {
    return (
      <MarketingShell headerAction="none">
        <article className="mx-auto max-w-xl px-5 py-20">
          <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Privacy</h1>
          <p className={`${marketingLead} mt-4`}>
            The privacy policy is not published yet. Email {trust.privacyEmail} if you need to reach us about personal data.
          </p>
        </article>
      </MarketingShell>
    );
  }
  return (
    <MarketingShell headerAction="none">
      <LegalDraft kind="privacy" trust={trust} />
    </MarketingShell>
  );
}
