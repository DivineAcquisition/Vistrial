import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, PlugZap } from "lucide-react";

import { Card } from "@/components/ui/card";
import { HOME_AREAS } from "@/lib/home/catalog";
import type { HomeNumbers } from "@/lib/home/load";
import {
  formatCents,
  formatReplyTime,
  HOME_METRIC_DEFINITIONS,
  REVENUE_LIFECYCLE_LABELS,
  type Comparison,
  type HomeMetricId,
} from "@/lib/home/metrics";
import { describeRange } from "@/lib/home/periods";
import { cn } from "@/lib/utils";

function metricHref(metric: HomeMetricId, period: string) {
  return `/app/home/${metric}?period=${period}`;
}

/** Green when it got better, red when it got worse. The arrow follows the number. */
export function ComparisonLine({ comparison, className }: { comparison: Comparison | null; className?: string }) {
  if (!comparison) return null;
  const Icon = comparison.direction === "up" ? ArrowUpRight : comparison.direction === "down" ? ArrowDownRight : ArrowRight;
  const tone =
    comparison.improved === null ? "text-muted-foreground" : comparison.improved ? "text-success" : "text-destructive";
  return (
    <p className={cn("inline-flex items-center gap-1 text-sm font-medium", tone, className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {comparison.text}
    </p>
  );
}

function CostPerBookedCall({ numbers }: { numbers: HomeNumbers }) {
  const cost = numbers.costPerBookedCall;
  if (!cost) return null;
  return (
    <div className="min-w-0 text-right">
      <p className="text-xs font-medium text-muted-foreground">Cost per booked call</p>
      {cost.state === "not_connected" ? (
        <Link
          href="/portal"
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-brand-300 underline-offset-4 hover:underline"
        >
          <PlugZap className="size-4 shrink-0" aria-hidden />
          Connect ad spend
        </Link>
      ) : cost.state === "no_bookings" ? (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-card-foreground sm:text-3xl">—</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatCents(cost.spendCents)} spent, no calls yet</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-card-foreground sm:text-3xl">
            {formatCents(cost.cents)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{formatCents(cost.spendCents)} ad spend</p>
        </>
      )}
    </div>
  );
}

/** The visual anchor: calls booked and what each one cost. */
export function HeroCard({ numbers }: { numbers: HomeNumbers }) {
  return (
    <Card className="overflow-hidden border-brand-500/30 p-5 sm:p-7 dark:border-brand-500/25">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[linear-gradient(180deg,rgba(154,136,252,0.14),transparent)]"
      />
      <div className="relative">
        <p className="truncate text-sm text-muted-foreground">
          <span className="font-medium text-card-foreground">{numbers.workspaceName}</span>
          <span aria-hidden> · </span>
          {numbers.period.label}, {describeRange(numbers.period)}
        </p>
        <div className="mt-5 flex items-end justify-between gap-4">
          <Link
            href={metricHref("booked_calls", numbers.period.key)}
            className="group -m-1 min-w-0 rounded-xl p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Booked calls
              <ChevronRight className="size-3.5 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </p>
            <p className="mt-1 text-6xl leading-none font-semibold tracking-tight tabular-nums text-card-foreground sm:text-7xl">
              {numbers.bookedCalls.count}
            </p>
          </Link>
          <CostPerBookedCall numbers={numbers} />
        </div>
        <ComparisonLine comparison={numbers.bookedCalls.comparison} className="mt-4" />
      </div>
    </Card>
  );
}

function NumberCard({
  metric,
  period,
  value,
  sub,
  comparison,
}: {
  metric: HomeMetricId;
  period: string;
  value: string;
  sub?: string | null;
  comparison: Comparison | null;
}) {
  return (
    <Card
      render={<Link href={metricHref(metric, period)} />}
      className="group min-w-0 p-4 outline-none transition-colors hover:border-brand-500/40 focus-visible:ring-2 focus-visible:ring-ring sm:p-5"
    >
      <p className="flex items-start justify-between gap-2 text-xs leading-snug font-medium text-muted-foreground">
        <span className="min-w-0">{HOME_METRIC_DEFINITIONS[metric].label}</span>
        <ChevronRight className="size-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </p>
      <p className="mt-2 truncate text-2xl font-semibold tabular-nums text-card-foreground sm:text-3xl">{value}</p>
      {sub ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{sub}</p> : null}
      <ComparisonLine comparison={comparison} className="mt-2 text-xs" />
    </Card>
  );
}

function revenueSub(byLifecycle: NonNullable<HomeNumbers["revenueBooked"]>["byLifecycle"]): string | null {
  const parts = (Object.keys(byLifecycle) as Array<keyof typeof byLifecycle>)
    .filter((key) => byLifecycle[key] !== 0)
    .map((key) => `${REVENUE_LIFECYCLE_LABELS[key]} ${formatCents(byLifecycle[key])}`);
  return parts.length ? parts.join(" · ") : null;
}

function cardFor(metric: HomeMetricId, numbers: HomeNumbers) {
  const period = numbers.period.key;
  if (metric === "quiet_leads_recovered") {
    return (
      <NumberCard
        key={metric}
        metric={metric}
        period={period}
        value={String(numbers.quietLeadsRecovered.count)}
        comparison={numbers.quietLeadsRecovered.comparison}
      />
    );
  }
  if (metric === "first_reply_time") {
    const reply = numbers.firstReply;
    return (
      <NumberCard
        key={metric}
        metric={metric}
        period={period}
        value={reply.medianMinutes === null ? "—" : formatReplyTime(reply.medianMinutes)}
        sub={
          reply.medianMinutes === null
            ? reply.waiting
              ? `${reply.waiting} waiting for a first reply`
              : "No new leads yet"
            : reply.waiting
              ? `${reply.waiting} still waiting`
              : null
        }
        comparison={reply.comparison}
      />
    );
  }
  if (metric === "no_shows_rebooked") {
    return (
      <NumberCard
        key={metric}
        metric={metric}
        period={period}
        value={String(numbers.noShowsRebooked.count)}
        comparison={numbers.noShowsRebooked.comparison}
      />
    );
  }
  if (metric === "revenue_booked") {
    if (!numbers.revenueBooked) return null;
    return (
      <NumberCard
        key={metric}
        metric={metric}
        period={period}
        value={formatCents(numbers.revenueBooked.netCents)}
        sub={revenueSub(numbers.revenueBooked.byLifecycle)}
        comparison={numbers.revenueBooked.comparison}
      />
    );
  }
  return null;
}

/** Each area's numbers, two to a row. Revenue is left out for anyone who cannot see money. */
export function SupportingNumbers({ numbers }: { numbers: HomeNumbers }) {
  const cards = HOME_AREAS.flatMap((area) => area.cards)
    .map((metric) => cardFor(metric, numbers))
    .filter(Boolean);
  return (
    <section aria-label="Supporting numbers" className="grid grid-cols-2 gap-3 sm:gap-4">
      {cards}
    </section>
  );
}
