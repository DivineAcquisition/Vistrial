import type { Metadata } from "next";

import { publicPageMetadata } from "@/lib/seo";

import { AccessRequestForm } from "@/components/marketing/access-form";
import { MarketingShell } from "@/components/marketing/chrome";
import { FormAside } from "@/components/marketing/form-aside";
import { CONTACT_EMAIL } from "@/lib/constants";
import { FORMS } from "@/lib/marketing/content";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = publicPageMetadata({
  title: FORMS.customTitle,
  description: FORMS.customLead,
  path: "/contact",
  index: false,
});

export default function ContactPage() {
  return (
    <MarketingShell headerAction="none">
      <section className="px-5 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>
              {FORMS.customTitle}
            </h1>
            <p className={`${marketingSubhead} mt-4`}>
              {FORMS.customLead} Or email{" "}
              <a
                className="text-brand-300 underline"
                href={`mailto:${CONTACT_EMAIL}`}
              >
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </div>
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-10">
            <AccessRequestForm kind="custom" />
            <div className="lg:sticky lg:top-24">
              <FormAside kind="custom" />
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
