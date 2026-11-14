import type { Metadata } from "next";

import { publicPageMetadata } from "@/lib/seo";

import { MarketingShell } from "@/components/marketing/chrome";
import { TermsDocument } from "@/components/marketing/terms-document";
import { loadTrustPublic } from "@/lib/trust/public";

export async function generateMetadata(): Promise<Metadata> {
  const trust = await loadTrustPublic();
  return publicPageMetadata({ title: "Terms", description: "Terms for using Vistrial.", path: "/terms", index: trust.termsLive });
}

export default async function TermsPage() {
  const trust = await loadTrustPublic();
  return (
    <MarketingShell headerAction="none">
      <TermsDocument trust={trust} />
    </MarketingShell>
  );
}
