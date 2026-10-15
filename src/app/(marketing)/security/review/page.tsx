import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { TrustRequestForm } from "@/components/marketing/trust-form";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Request a security review",
  description: "Ask Vistrial for a questionnaire, a data processing agreement, or another security question.",
  robots: { index: false, follow: false },
};

export default function SecurityReviewPage() {
  return (
    <MarketingShell headerAction="none">
      <section className="mx-auto max-w-xl px-5 py-14 sm:px-6">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Request a security review</h1>
        <p className={`${marketingSubhead} mt-4`}>Tell us what you need. A person will reply from contact@vistrial.io. This page does not promise a date.</p>
        <div className="mt-8">
          <TrustRequestForm kind="security_review" />
        </div>
      </section>
    </MarketingShell>
  );
}
