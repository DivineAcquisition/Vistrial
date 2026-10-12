import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OnboardingOverview } from "@/app/(workspace)/app/onboarding/overview";
import { getAuthContext } from "@/lib/auth/session";
import { SAMPLE_STATES, isSampleState, sampleCustomerView } from "@/lib/onboarding/samples";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Onboarding states",
  robots: { index: false, follow: false },
};

/** The setup overview in each onboarding state, from sample data. Platform Admins only. */
export default async function OnboardingStatesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.isPlatformAdmin) notFound();
  const query = await searchParams;
  const state = isSampleState(query.state) ? query.state : "mid_setup";
  const now = Date.parse(new Date().toISOString());

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Onboarding states" className="flex flex-wrap gap-2">
        {SAMPLE_STATES.map((item) => (
          <Link
            key={item.id}
            href={`/app/layouts/onboarding?state=${item.id}`}
            aria-current={item.id === state ? "page" : undefined}
            className={cn(
              "inline-flex min-h-11 items-center rounded-full border px-3 text-sm",
              item.id === state
                ? "border-brand-500/40 bg-brand-500/12 text-brand-200"
                : "border-border text-muted-foreground hover:text-card-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <OnboardingOverview view={sampleCustomerView(state, now)} isStaff={false} now={now} />
    </div>
  );
}
