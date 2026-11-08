import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/chrome";
import { COMPANY_ADDRESS, CONTACT_EMAIL, LEGAL_ENTITY } from "@/lib/constants";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "What the Vistrial site and its examples do and do not promise.",
  alternates: { canonical: "/disclaimer" },
  robots: { index: true, follow: true },
};

export default function DisclaimerPage() {
  return (
    <MarketingShell headerAction="none">
      <article className="mx-auto max-w-3xl px-5 py-14 sm:px-6 sm:py-20">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>Disclaimer</h1>
        <p className={`${marketingSubhead} mt-4`}>
          Nothing on this site is a promise of bookings, sales, or revenue. Examples on the site show how the product works. They are not results from a named customer.
        </p>
        <p className={`${marketingSubhead} mt-4`}>
          Research reports summarize public sources and link to each one. Check a source before you rely on it. Your use of Vistrial is covered by the{" "}
          <Link href="/terms" className="text-strong underline underline-offset-4">Terms of Service</Link> and the{" "}
          <Link href="/privacy" className="text-strong underline underline-offset-4">Privacy Policy</Link>.
        </p>
        <p className={`${marketingSubhead} mt-4`}>
          {LEGAL_ENTITY}. {COMPANY_ADDRESS}. {CONTACT_EMAIL}
        </p>
      </article>
    </MarketingShell>
  );
}
