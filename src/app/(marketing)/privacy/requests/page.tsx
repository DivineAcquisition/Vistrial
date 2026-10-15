import type { Metadata } from "next";

import { LeadDataForm } from "@/components/marketing/lead-data-form";
import { MarketingShell } from "@/components/marketing/chrome";
import { loadTrustPublic } from "@/lib/trust/public";
import { marketingHeroTitle, marketingLead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Data requests",
  description: "How to ask Vistrial for an export, a correction, or deletion.",
};

export default async function DataRequestsPage() {
  const trust = await loadTrustPublic();
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-xl px-5 py-14 sm:px-6">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Data requests</h1>
        <div className={`${marketingLead} mt-4 space-y-3`}>
          <p>Workspace Owners can ask for an export, a correction, or deletion from inside the product, under Help. A person verifies the request. Nothing is deleted or exported on its own.</p>
          <p>If you are a person contacted by one of our customers and want your information changed or removed, contact that business. You can also email {trust.privacyEmail} and we will pass your request to them when we can tell who they are.</p>
        </div>
        <div className="mt-8">
          <LeadDataForm />
        </div>
      </article>
    </MarketingShell>
  );
}
