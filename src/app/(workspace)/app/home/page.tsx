import { Suspense } from "react";
import { notFound } from "next/navigation";

import { PeriodSelect } from "@/app/(workspace)/app/home/period-select";
import {
  AttentionSection,
  AttentionSkeleton,
  AwaySummary,
  OnboardingCard,
  PipelineSnapshot,
  StatCards,
  StatCardsSkeleton,
} from "@/app/(workspace)/app/home/portal-sections";
import { RecentLeads } from "@/app/(workspace)/app/home/recent-leads";
import {
  ActivitySection,
  ActivitySkeleton,
  EmptyWorkspace,
  QueueSection,
  QueueSkeleton,
} from "@/app/(workspace)/app/home/sections";
import Logo from "@/components/brand/logo";
import { HomeLiveBand } from "@/components/live/home-live";
import { ConnectionHold } from "@/components/connectors/connection-hold";
import { canSeePeople, canSeeResults } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import { parseHomePeriodKey, resolveHomePeriod } from "@/lib/home/periods";
import { loadFacts } from "@/lib/metrics/load";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home" };

/**
 * What needs someone first, then the numbers for the period, then the
 * pipeline as it stands, then what is waiting on a person and what already
 * happened. Each band loads on its own so a slow query never holds the others.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await getAuthContext();
  if (!canSeeResults(ctx)) notFound();
  const key = parseHomePeriodKey((await searchParams).period);
  const period = resolveHomePeriod(key, { timeZone: ctx.org.timezone });
  const facts = await loadFacts(ctx.org.id);
  if (!facts) notFound();
  const people = canSeePeople(ctx);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 sm:gap-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Logo markOnly className="hidden h-8 w-auto md:block" />
            <h1 className="font-heading text-xl text-card-foreground">Home</h1>
          </div>
          <PeriodSelect value={key} />
        </div>
        <Suspense fallback={null}>
          <AwaySummary ctx={ctx} facts={facts} />
        </Suspense>
      </header>

      <Suspense fallback={null}>
        <ConnectionHold orgId={ctx.org.id} />
      </Suspense>

      <Suspense fallback={null}>
        <OnboardingCard ctx={ctx} />
      </Suspense>

      <Suspense fallback={<AttentionSkeleton />}>
        <AttentionSection ctx={ctx} />
      </Suspense>

      {facts.has_leads ? (
        <Suspense key={key} fallback={<StatCardsSkeleton />}>
          <StatCards ctx={ctx} facts={facts} period={period} />
        </Suspense>
      ) : (
        <EmptyWorkspace name={ctx.org.name} canConnect={people} />
      )}

      <HomeLiveBand />

      <Suspense fallback={<QueueSkeleton />}>
        <QueueSection ctx={ctx} />
      </Suspense>

      <Suspense fallback={null}>
        <PipelineSnapshot ctx={ctx} facts={facts} />
      </Suspense>

      {people ? <RecentLeads /> : null}

      <Suspense fallback={<ActivitySkeleton />}>
        <ActivitySection ctx={ctx} />
      </Suspense>
    </div>
  );
}
