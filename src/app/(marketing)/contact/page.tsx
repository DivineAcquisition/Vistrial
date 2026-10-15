import type { Metadata } from "next";

import { AccessRequestForm } from "@/components/marketing/access-form";
import { MarketingShell } from "@/components/marketing/chrome";
import { CONTACT_EMAIL } from "@/lib/constants";
import { FORMS } from "@/lib/marketing/content";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: FORMS.customTitle,
  description: FORMS.customLead,
  robots: { index: false, follow: false },
};

export default function ContactPage() {
  return (
    <MarketingShell headerAction="none">
      <section className="mx-auto max-w-xl px-5 py-14 sm:px-6 sm:py-20">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>{FORMS.customTitle}</h1>
        <p className={`${marketingSubhead} mt-4`}>
          {FORMS.customLead} Or email{" "}
          <a className="text-brand-300 underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
        <div className="mt-8">
          <AccessRequestForm kind="custom" />
        </div>
      </section>
    </MarketingShell>
  );
}
