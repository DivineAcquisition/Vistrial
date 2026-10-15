import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { TrustRequestForm } from "@/components/marketing/trust-form";
import { loadTrustPublic } from "@/lib/trust/public";
import { marketingHeroTitle, marketingLead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Report a vulnerability",
  description: "How to tell Vistrial about a security issue.",
  robots: { index: true, follow: true },
};

export default async function VulnerabilityPage() {
  const trust = await loadTrustPublic();
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-xl px-5 py-14 sm:px-6">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Report a vulnerability</h1>
        <div className={`${marketingLead} mt-4 space-y-3`}>
          <p>Email {trust.vulnerabilityEmail} with the subject Security report, or use the form.</p>
          <p>Include the page or endpoint, what you expected, and the steps you took. Give us time to fix the issue before you write about it in public.</p>
          <p>There is no bounty, and this page does not promise a reply time.</p>
          {trust.safeHarborLive ? (
            <p>We will not take legal action against good-faith research that avoids privacy violations, data destruction, and service disruption.</p>
          ) : null}
        </div>
        <div className="mt-8">
          <TrustRequestForm kind="vulnerability" />
        </div>
      </article>
    </MarketingShell>
  );
}
