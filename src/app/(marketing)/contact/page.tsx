import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { ContactForm } from "@/components/marketing/forms";
import { AnimatedHeading } from "@/components/ui/animated-heading";
import { Panel } from "@/components/ui/panel";
import { CONTACT_EMAIL } from "@/lib/constants";
import { CONTACT_PAGE } from "@/lib/marketing/copy";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: CONTACT_PAGE.title,
  description: CONTACT_PAGE.description,
};

export default function ContactPage() {
  return (
    <MarketingShell headerAction="none">
      <section className="px-5 pb-10 pt-14 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-2xl">
          <AnimatedHeading as="h1" className={`${marketingHeroTitle} text-[2.2rem] sm:text-4xl`}>
            {CONTACT_PAGE.title}
          </AnimatedHeading>
          <p className={`${marketingSubhead} mt-4`}>
            {CONTACT_PAGE.description} Or email{" "}
            <a
              className="text-brand-300 underline-offset-4 hover:text-white hover:underline"
              href={`mailto:${CONTACT_EMAIL}`}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </section>
      <section className="px-5 pb-20 sm:px-6">
        <Panel className="mx-auto max-w-2xl rounded-3xl border-white/[0.1] p-6 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] sm:p-8">
          <ContactForm />
        </Panel>
      </section>
    </MarketingShell>
  );
}
