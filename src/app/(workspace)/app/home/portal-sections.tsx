import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronRight, ListChecks } from "lucide-react";

import { AttentionPanel } from "@/app/(workspace)/app/home/attention-panel";
import { FeedbackPrompt } from "@/app/(workspace)/app/home/feedback-prompt";
import { LiveMessage } from "@/app/(workspace)/app/home/live-message";
import { BarList, MetricCard } from "@/components/metrics/metric-card";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { canSeeMoney } from "@/lib/auth/portal-access";
import type { AuthContext } from "@/lib/auth/types";
import { compare } from "@/lib/home/metrics";
import type { HomePeriod, PeriodRange } from "@/lib/home/periods";
import { describeRange } from "@/lib/home/periods";
import { METRICS, OPEN_STAGES, stageLabel } from "@/lib/metrics/definitions";
import { loadCustomerView } from "@/lib/onboarding/load";
import { nextCustomerStep, progressCounts } from "@/lib/onboarding/stages";
import {
  currentNumber,
  formatCents,
  metricView,
  shareView,
  smallSampleNote,
  type MetricView,
} from "@/lib/metrics/format";
import {
  hasComparisonData,
  loadBreakdown,
  loadSummary,
  portalDb,
  type WorkspaceFacts,
} from "@/lib/metrics/load";
import { loadAttention } from "@/lib/portal/attention";

function drillHref(metric: string, period: string): string {
  return `/app/results/leads?${new URLSearchParams({ metric, period }).toString()}`;
}

/* ---------------------------------------------------------------------------
 * Needs attention
 * ------------------------------------------------------------------------- */

export async function AttentionSection({ ctx }: { ctx: AuthContext }) {
  return <AttentionPanel initial={await loadAttention(ctx)} />;
}

export function AttentionSkeleton() {
  return (
    <section className="flex flex-col gap-3" aria-busy="true" aria-label="Loading what needs attention">
      <Skeleton className="h-5 w-40" />
      <Card className="gap-3 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </Card>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Since your last visit
 * ------------------------------------------------------------------------- */

const AWAY_METRICS = [
  { metric: "new_leads", fact: "has_leads", one: "new lead", many: "new leads" },
  { metric: "bookings", fact: "has_bookings", one: "call booked", many: "calls booked" },
  { metric: "relay_prepared", fact: "has_relay", one: "message drafted", many: "messages drafted" },
  { metric: "alerts_raised", fact: "has_alerts", one: "alert raised", many: "alerts raised" },
] as const;

function visitLabel(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

export async function AwaySummary({ ctx, facts }: { ctx: AuthContext; facts: WorkspaceFacts }) {
  const db = await portalDb();
  const { data: previous } = await db.rpc("portal_mark_home_seen", { p_org_id: ctx.org.id });
  if (typeof previous !== "string") return null;
  const metrics = AWAY_METRICS.filter((row) => facts[row.fact]);
  if (!metrics.length) return null;
  const summary = await loadSummary({
    orgId: ctx.org.id,
    metrics: metrics.map((row) => row.metric),
    range: { from: previous, to: new Date().toISOString() },
    db,
  });
  const parts = metrics.flatMap((row) => {
    const value = currentNumber(row.metric, summary[row.metric]);
    return value ? [`${value} ${value === 1 ? row.one : row.many}`] : [];
  });
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-card-foreground">Since {visitLabel(previous, ctx.org.timezone)}:</span>{" "}
      {parts.length ? parts.join(", ") : "nothing new yet"}.
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * Onboarding
 * ------------------------------------------------------------------------- */

/**
 * The setup card. It reads the one onboarding record (the same one the setup
 * flow, the staff queue, and the roster read). Owners and staff act from it;
 * Members see it read-only; Operators never see it.
 */
export async function OnboardingCard({ ctx }: { ctx: AuthContext }) {
  if (ctx.workspaceRole !== "owner" && ctx.workspaceRole !== "member" && !ctx.isStaff) return null;
  const view = await loadCustomerView(ctx.org.id);
  if (!view) return null;
  if (view.live) {
    return (
      <>
        {view.liveSeenAt ? null : <LiveMessage name={ctx.org.name} />}
        {view.feedbackDue ? <FeedbackPrompt /> : null}
      </>
    );
  }
  if (view.phase === "cancelled") return null;

  const canAct = ctx.workspaceRole === "owner" || ctx.isStaff;
  const { done, total } = progressCounts(view.steps);
  const next = canAct ? nextCustomerStep(view.steps) : null;
  const status =
    view.phase === "ready_for_review"
      ? " You said you are ready; your team is reviewing."
      : view.phase === "activating"
        ? " Approved. Your agents are being switched on one at a time."
        : view.phase === "paused"
          ? " Setup is paused."
          : next
            ? ` Next for you: ${next.label.toLowerCase()}.`
            : " The rest is with your Vistrial team.";
  return (
    <Card className="gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-300">
          <ListChecks className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-base text-card-foreground">Getting {ctx.org.name} ready</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {done} of {total} steps done.{status}
          </p>
        </div>
      </div>
      <Progress value={total ? Math.round((done / total) * 100) : 0} aria-label="Setup progress" />
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {next?.action ? (
          <Link href={next.action.href} className="font-medium text-brand-300 underline-offset-4 hover:underline">
            {next.action.label}: {next.label}
          </Link>
        ) : null}
        <Link
          href={canAct ? "/app/onboarding" : "/app/onboarding/progress"}
          className="inline-flex items-center gap-1 font-medium text-brand-300 underline-offset-4 hover:underline"
        >
          {canAct ? "Open setup" : "See every step"}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Numbers
 * ------------------------------------------------------------------------- */

const PAGE = 1000;

async function readSpend(db: SupabaseClient, orgId: string, range: PeriodRange): Promise<number> {
  let total = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("ad_spend_days")
      .select("spend_cents")
      .eq("org_id", orgId)
      .gte("spend_date", range.fromDate)
      .lte("spend_date", range.toDate)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Array<{ spend_cents: number }>;
    total += rows.reduce((sum, row) => sum + Number(row.spend_cents ?? 0), 0);
    if (rows.length < PAGE) return total;
  }
}

async function adSpendConnected(db: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await db
    .from("source_connections")
    .select("kind")
    .eq("org_id", orgId)
    .in("kind", ["meta_ads", "google_ads"])
    .eq("status", "active")
    .limit(1);
  return (data ?? []).length > 0;
}

type StatCard = { key: string; view: MetricView | null; note?: string | null; href?: string | null };

export async function StatCards({ ctx, facts, period }: { ctx: AuthContext; facts: WorkspaceFacts; period: HomePeriod }) {
  const db = (await portalDb()) as SupabaseClient;
  const money = canSeeMoney(ctx) && facts.can_see_money;
  const metrics = [
    "new_leads",
    "response_within",
    "response_decided",
    "first_touch_time",
    "bookings",
    "hot_open",
    "relay_prepared",
    ...(money && facts.has_revenue ? ["revenue"] : []),
  ];
  const [summary, spendOn] = await Promise.all([
    loadSummary({ orgId: ctx.org.id, metrics, range: period, previous: period.previous, db }),
    money ? adSpendConnected(db, ctx.org.id) : Promise.resolve(false),
  ]);
  const hasPreviousData = hasComparisonData(facts, period.previous.from);
  const base = { summary, comparisonLabel: period.comparisonLabel, hasPreviousData };
  const view = (metric: string, label?: string) => metricView({ ...base, metric, label });

  const cards: StatCard[] = [];
  if (facts.has_leads) cards.push({ key: "new_leads", view: view("new_leads"), href: drillHref("new_leads", period.key) });

  const share = facts.has_response ? shareView({ ...base, id: "response_rate" }) : null;
  if (share && share.denominator > 0) {
    cards.push({
      key: "response_rate",
      view: {
        metric: share.id,
        label: share.label,
        explain: share.explain,
        value: share.value,
        display: share.display,
        comparison: share.comparison,
        rows: share.denominator,
        smallSample: share.smallSample,
      },
      note: share.smallSample ? smallSampleNote(share.denominator) : null,
      href: drillHref("response_decided", period.key),
    });
  }

  if (facts.has_response) {
    const touch = view("first_touch_time");
    if (touch && touch.value !== null) {
      cards.push({
        key: "first_touch_time",
        view: touch,
        note: touch.smallSample ? smallSampleNote(touch.rows) : null,
        href: drillHref("first_touch_time", period.key),
      });
    }
  }

  if (facts.has_bookings) cards.push({ key: "bookings", view: view("bookings"), href: drillHref("bookings", period.key) });

  if (facts.has_bands && facts.top_band) {
    cards.push({
      key: "hot_open",
      view: view("hot_open", `Ready now (${facts.top_band})`),
      href: drillHref("hot_open", period.key),
    });
  }

  if (facts.has_relay) {
    cards.push({ key: "relay_prepared", view: view("relay_prepared"), href: drillHref("relay_prepared", period.key) });
  }

  if (money && facts.has_revenue) {
    cards.push({ key: "revenue", view: view("revenue"), href: drillHref("revenue", period.key) });
  }

  let spendCard: React.ReactNode = null;
  if (spendOn) {
    const [current, previous] = await Promise.all([
      readSpend(db, ctx.org.id, period),
      readSpend(db, ctx.org.id, period.previous),
    ]);
    const booked = currentNumber("bookings", summary.bookings) ?? 0;
    const bookedBefore = summary.bookings && !summary.bookings.hidden ? (summary.bookings.previous?.count ?? 0) : 0;
    const cost = booked > 0 ? Math.round(current / booked) : null;
    const costBefore = bookedBefore > 0 ? Math.round(previous / bookedBefore) : null;
    spendCard = (
      <MetricCard
        label="Cost per booked call"
        value={cost === null ? "—" : formatCents(cost)}
        sub={cost === null ? `${formatCents(current)} spent, no calls booked yet` : `${formatCents(current)} ad spend`}
        comparison={compare({
          current: cost,
          previous: costBefore,
          hasPreviousData,
          comparisonLabel: period.comparisonLabel,
          lowerIsBetter: true,
          format: (delta) => formatCents(delta),
        })}
        explain="Ad spend from your connected ad accounts for the days in the range, divided by calls booked in the range."
      />
    );
  }

  const shown = cards.filter((card): card is StatCard & { view: MetricView } => Boolean(card.view));
  if (!shown.length && !spendCard) return null;
  return (
    <section aria-labelledby="home-numbers" className="flex flex-col gap-3">
      <h2 id="home-numbers" className="font-heading text-base text-card-foreground">
        {period.label} <span className="font-normal text-muted-foreground">· {describeRange(period)}</span>
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {shown.map((card) => (
          <MetricCard
            key={card.key}
            label={card.view.label}
            value={card.view.display}
            comparison={card.view.comparison}
            explain={card.view.explain}
            note={card.note}
            href={card.href}
          />
        ))}
        {spendCard}
      </div>
    </section>
  );
}

export function StatCardsSkeleton() {
  return (
    <section className="flex flex-col gap-3" aria-busy="true" aria-label="Loading numbers">
      <Skeleton className="h-5 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index} className="p-4 sm:p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-8 w-16" />
            <Skeleton className="mt-2 h-3 w-20" />
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Pipeline snapshot
 * ------------------------------------------------------------------------- */

export async function PipelineSnapshot({ ctx, facts }: { ctx: AuthContext; facts: WorkspaceFacts }) {
  if (!facts.has_leads) return null;
  const db = await portalDb();
  const now = new Date().toISOString();
  const range = { from: now, to: now };
  const [stages, bands] = await Promise.all([
    loadBreakdown({ orgId: ctx.org.id, metric: "open_leads", range, dimension: "detail", db }),
    facts.has_bands
      ? loadBreakdown({ orgId: ctx.org.id, metric: "open_leads", range, dimension: "band", db })
      : Promise.resolve(null),
  ]);
  if (!stages) return null;
  const order = new Map<string, number>(OPEN_STAGES.map((stage, index) => [stage, index]));
  const stageRows = [...stages]
    .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
    .map((row) => ({
      key: row.key,
      label: stageLabel(row.key),
      value: row.count,
      href: `/app/results/leads?metric=${encodeURIComponent(`open_leads:${row.key}`)}`,
    }));
  const bandOrder = new Map(facts.bands.map((band, index) => [band.name, -index]));
  const bandRows = (bands ?? [])
    .sort((a, b) => (bandOrder.get(a.key) ?? 1) - (bandOrder.get(b.key) ?? 1))
    .map((row) => ({
      key: row.key,
      label: row.label,
      value: row.count,
      href: row.key === "none" ? null : `/app/results/leads?metric=${encodeURIComponent(`open_band:${row.key}`)}`,
    }));
  const total = stageRows.reduce((sum, row) => sum + row.value, 0);

  return (
    <section aria-labelledby="home-pipeline" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-pipeline" className="font-heading text-base text-card-foreground">
          Pipeline right now
        </h2>
        <Link
          href="/app/results/leads?metric=open_leads"
          className="text-sm font-medium text-brand-300 underline-offset-4 hover:underline"
        >
          {total} open {total === 1 ? "lead" : "leads"}
        </Link>
      </div>
      <Card className="gap-5 p-4 sm:p-5">
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">By stage</h3>
          <BarList rows={stageRows} label="Open leads by stage" empty="No open leads." />
        </div>
        {bandRows.length ? (
          <div>
            <h3 className="mb-1 text-xs font-medium text-muted-foreground">By readiness</h3>
            <BarList rows={bandRows} label="Open leads by readiness band" />
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{METRICS.open_leads.explain}</p>
      </Card>
    </section>
  );
}
