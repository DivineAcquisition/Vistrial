import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { TermsDocument } from "@/components/marketing/terms-document";
import { loadTrustPublic } from "@/lib/trust/public";

export async function generateMetadata(): Promise<Metadata> {
  const trust = await loadTrustPublic();
  return {
    title: "Terms",
    description: "Terms for using Vistrial.",
    robots: trust.termsLive ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function TermsPage() {
  const trust = await loadTrustPublic();
  return (
    <MarketingShell headerAction="none">
      <TermsDocument trust={trust} />
    </MarketingShell>
  );
}
