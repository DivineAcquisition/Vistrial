import type { Metadata } from "next";

import { publicPageMetadata } from "@/lib/seo";

import { MarketingShell } from "@/components/marketing/chrome";
import { PrivacyPolicy } from "@/components/marketing/privacy-policy";
import { loadTrustPublic } from "@/lib/trust/public";

export async function generateMetadata(): Promise<Metadata> {
  const trust = await loadTrustPublic();
  return publicPageMetadata({ title: "Privacy", description: "How Vistrial handles personal data.", path: "/privacy", index: trust.privacyLive });
}

export default async function PrivacyPage() {
  const trust = await loadTrustPublic();
  return (
    <MarketingShell headerAction="none">
      <PrivacyPolicy trust={trust} />
    </MarketingShell>
  );
}
