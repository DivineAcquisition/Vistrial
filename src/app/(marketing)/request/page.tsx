import type { Metadata } from "next";

import { AccessRequestForm } from "@/components/marketing/access-form";
import { MarketingShell } from "@/components/marketing/chrome";
import { FORMS } from "@/lib/marketing/content";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: FORMS.accessTitle,
  description: FORMS.accessLead,
  robots: { index: false, follow: false },
};

export default function RequestPage() {
  return (
    <MarketingShell headerAction="none">
      <section className="mx-auto max-w-xl px-5 py-14 sm:px-6 sm:py-20">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>{FORMS.accessTitle}</h1>
        <p className={`${marketingSubhead} mt-4`}>{FORMS.accessLead}</p>
        <div className="mt-8">
          <AccessRequestForm kind="private_access" />
        </div>
      </section>
    </MarketingShell>
  );
}
