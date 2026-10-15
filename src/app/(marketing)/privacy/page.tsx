import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { PrivacyPolicy } from "@/components/marketing/privacy-policy";
import { loadTrustPublic } from "@/lib/trust/public";

export async function generateMetadata(): Promise<Metadata> {
  const trust = await loadTrustPublic();
  return {
    title: "Privacy",
    description: "How Vistrial handles personal data.",
    robots: trust.privacyLive ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function PrivacyPage() {
  const trust = await loadTrustPublic();
  return (
    <MarketingShell headerAction="none">
      <PrivacyPolicy trust={trust} />
    </MarketingShell>
  );
}
