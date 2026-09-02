import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/chrome";
import { QualifyForm } from "@/components/marketing/forms";
import { AnimatedHeading } from "@/components/ui/animated-heading";
import { Panel } from "@/components/ui/panel";
import { trackingFromSearchParams, type SearchParams } from "@/lib/marketing/config";
import { BOOK } from "@/lib/marketing/copy";
import { eyebrow } from "@/lib/ui";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: BOOK.title,
  description: BOOK.description,
  robots: { index: false, follow: false },
};

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const tracking = trackingFromSearchParams(await searchParams);

  return (
    <MarketingShell headerAction="none">
      <section className="px-5 pb-10 pt-14 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className={`${eyebrow} animate-rise`}>{BOOK.eyebrow}</p>
          <AnimatedHeading
            as="h1"
            className={`${marketingHeroTitle} mt-6 text-[2.2rem] sm:text-4xl md:text-[2.9rem]`}
          >
            {BOOK.title}
          </AnimatedHeading>
          <p className={`${marketingSubhead} animate-rise delay-2 mx-auto mt-5 max-w-md`}>
            {BOOK.description}
          </p>
        </div>
      </section>
      <section className="px-5 pb-20 sm:px-6">
        <Panel className="animate-rise delay-3 mx-auto max-w-2xl rounded-3xl border-white/[0.1] p-6 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)] sm:p-8">
          <QualifyForm tracking={tracking} />
        </Panel>
      </section>
    </MarketingShell>
  );
}
