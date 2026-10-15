import type { Metadata } from "next";
import Link from "next/link";

import { MarketingShell } from "@/components/marketing/chrome";
import { THANKS } from "@/lib/marketing/content";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: THANKS.title,
  robots: { index: false, follow: false },
};

export default async function ThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  const body = params.kind === "custom" ? THANKS.custom : THANKS.access;
  return (
    <MarketingShell headerAction="none">
      <section className="mx-auto max-w-xl px-5 py-20 sm:px-6">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>{THANKS.title}</h1>
        <p className={`${marketingSubhead} mt-4`}>{body}</p>
        <p className="mt-8">
          <Link href="/" className="text-sm font-medium text-brand-300 underline">
            Back to Vistrial
          </Link>
        </p>
      </section>
    </MarketingShell>
  );
}
