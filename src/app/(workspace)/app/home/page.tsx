import { Suspense } from "react";

import { PeriodSelect } from "@/app/(workspace)/app/home/period-select";
import {
  ActivitySection,
  ActivitySkeleton,
  NumbersSection,
  NumbersSkeleton,
  QueueSection,
  QueueSkeleton,
} from "@/app/(workspace)/app/home/sections";
import Logo from "@/components/brand/logo";
import { HomeLiveBand } from "@/components/live/home-live";
import { canViewReporting } from "@/lib/auth/permissions";
import { getAuthContext } from "@/lib/auth/session";
import { parseHomePeriodKey } from "@/lib/home/periods";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home" };

/**
 * Outcomes first: calls booked and what they cost, then the numbers behind
 * them, then what is waiting on a person, then what already happened.
 * Each band loads on its own so a slow query never holds the others.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await getAuthContext();
  const period = parseHomePeriodKey((await searchParams).period);
  const showMoney = canViewReporting(ctx.role, ctx.isStaff);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 sm:gap-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Logo markOnly className="hidden h-8 w-auto md:block" />
          <h1 className="font-heading text-xl text-card-foreground">Home</h1>
        </div>
        <PeriodSelect value={period} />
      </header>

      <Suspense key={period} fallback={<NumbersSkeleton showMoney={showMoney} />}>
        <NumbersSection ctx={ctx} period={period} />
      </Suspense>

      <HomeLiveBand />

      <Suspense fallback={<QueueSkeleton />}>
        <QueueSection ctx={ctx} />
      </Suspense>

      <Suspense fallback={<ActivitySkeleton />}>
        <ActivitySection ctx={ctx} />
      </Suspense>
    </div>
  );
}
