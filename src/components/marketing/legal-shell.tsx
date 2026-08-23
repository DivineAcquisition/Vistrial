import type { Metadata } from "next";
import type { ReactNode } from "react";

import { MarketingShell } from "@/components/marketing/chrome";
import { marketingHeroTitle } from "@/lib/marketing/ui";

export function LegalShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <MarketingShell headerAction="none">
      <article className="px-5 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className={`${marketingHeroTitle} text-[2.1rem] sm:text-4xl`}>{title}</h1>
          {description ? (
            <p className="mt-4 text-sm leading-relaxed text-silver">{description}</p>
          ) : null}
          <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-silver">{children}</div>
        </div>
      </article>
    </MarketingShell>
  );
}

export function legalMetadata(title: string, description: string): Metadata {
  return {
    title,
    description,
  };
}
