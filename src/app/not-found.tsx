import Link from "next/link";

import { MarketingShell } from "@/components/marketing/chrome";
import { NOT_FOUND } from "@/lib/marketing/content";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export default function NotFound() {
  return (
    <MarketingShell headerAction="none">
      <section className="mx-auto max-w-xl px-5 py-20">
        <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>{NOT_FOUND.title}</h1>
        <p className={`${marketingSubhead} mt-4`}>{NOT_FOUND.body}</p>
        <p className="mt-8">
          <Link href="/" className="text-sm font-medium text-brand-300 underline">
            {NOT_FOUND.cta}
          </Link>
        </p>
      </section>
    </MarketingShell>
  );
}
