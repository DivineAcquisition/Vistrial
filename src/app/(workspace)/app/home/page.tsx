import Link from "next/link";
import { notFound } from "next/navigation";

import { WelcomeBanner } from "@/app/(workspace)/app/home/welcome-banner";
import { AgentRequestCard } from "@/components/live/request-card";
import { MetricCard } from "@/components/metrics/metric-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AGENTS, agentCredit, isLiveAgentId } from "@/lib/agents/roster";
import { canSeeResults } from "@/lib/auth/portal-access";
import { getAuthContext } from "@/lib/auth/session";
import { loadAgentRequests, loadApprovalQueue } from "@/lib/home/views";
import { leadsWaitingCount } from "@/lib/home/simple";
import { resolveHomePeriod } from "@/lib/home/periods";
import { METRICS } from "@/lib/metrics/definitions";
import { currentNumber } from "@/lib/metrics/format";
import { loadSummary, portalDb } from "@/lib/metrics/load";
import { loadCustomerView } from "@/lib/onboarding/load";
import { CUSTOMER_STATE_LABEL, progressCounts } from "@/lib/onboarding/stages";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export const metadata = { title: "Home" };

function drill(metric: string): string {
  return `/app/results/leads?${new URLSearchParams({ metric, period: "this_week" }).toString()}`;
}

export default async function HomePage() {
  const ctx = await getAuthContext();
  if (!canSeeResults(ctx)) notFound();
  const period = resolveHomePeriod("this_week", { timeZone: ctx.org.timezone });
  const now = new Date().toISOString();
  const db = await portalDb();
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const [nowSummary, weekSummary, queue, requests, done, onboarding] = await Promise.all([
    loadSummary({
      orgId: ctx.org.id,
      metrics: ["missed_now", "at_risk_now", "drafts_waiting"],
      range: { from: now, to: now },
      db,
    }),
    loadSummary({ orgId: ctx.org.id, metrics: ["bookings"], range: period, db }),
    loadApprovalQueue(ctx),
    loadAgentRequests(ctx),
    supabase
      .from("agent_activity_runs")
      .select("id, agent_id, subject_label, reason_summary, finished_at")
      .eq("org_id", ctx.org.id)
      .eq("status", "completed")
      .order("finished_at", { ascending: false })
      .limit(5),
    ctx.workspaceRole === "operator" ? Promise.resolve(null) : loadCustomerView(ctx.org.id),
  ]);

  const waiting = leadsWaitingCount(currentNumber("missed_now", nowSummary.missed_now), currentNumber("at_risk_now", nowSummary.at_risk_now));
  const booked = currentNumber("bookings", weekSummary.bookings) ?? 0;
  const needsOk = currentNumber("drafts_waiting", nowSummary.drafts_waiting) ?? queue.filter((item) => item.canApprove).length;
  const checklist = onboarding && progressCounts(onboarding.steps).done < progressCounts(onboarding.steps).total ? onboarding.steps : [];
  const doneRows = ((done.data ?? []) as unknown) as Array<{ id: string; agent_id: string; subject_label: string; reason_summary: string | null }>;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <WelcomeBanner orgId={ctx.org.id} wentLiveAt={onboarding?.wentLiveAt ?? null} />

      {checklist.length ? (
        <section aria-labelledby="setup-checklist" className="flex flex-col gap-2">
          <h2 id="setup-checklist" className="font-heading text-base text-card-foreground">
            Setup
          </h2>
          <ul className="flex flex-col gap-2">
            {checklist.map((step) => (
              <li key={step.key} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                <span className="text-sm text-card-foreground">
                  {step.label}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {step.state === "waiting_on_team" ? "In progress" : CUSTOMER_STATE_LABEL[step.state].label}
                  </span>
                </span>
                {step.action ? (
                  <Button size="sm" variant="secondary" render={<Link href={step.action.href} />}>
                    {step.action.label}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {checklist.some((step) => step.key === "messaging" || step.key === "email") && (!onboarding?.textingEnabled || !onboarding?.emailEnabled) ? (
            <p className="text-sm text-muted-foreground">Sending to leads stays off until texting registration and email setup are done.</p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="home-numbers" className="grid gap-3 sm:grid-cols-3">
        <h2 id="home-numbers" className="sr-only">
          This week
        </h2>
        <MetricCard label="Leads waiting" value={String(waiting)} href={drill("missed_now")} explain={`${METRICS.missed_now.explain} ${METRICS.at_risk_now.explain}`} />
        <MetricCard label="Booked this week" value={String(booked)} href={drill("bookings")} explain={METRICS.bookings.explain} />
        <MetricCard label="Needs your OK" value={String(needsOk)} href="/app/agents" explain={METRICS.drafts_waiting.explain} />
      </section>

      <section aria-labelledby="needs-you" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="needs-you" className="font-heading text-base text-card-foreground">
            Needs you
          </h2>
          <Link href="/app/agents" className="text-sm font-medium text-brand-300 hover:underline">
            See all
          </Link>
        </div>
        {requests.length ? (
          requests.slice(0, 5).map((item) => <AgentRequestCard key={item.id} item={item} />)
        ) : (
          <Card className="gap-3 p-6">
            <p className="text-sm text-card-foreground">Nothing needs you right now. We&apos;ll put drafts here for your OK.</p>
            <Button variant="primary" render={<Link href="/app/agents" />}>
              See what the team is doing
            </Button>
          </Card>
        )}
      </section>

      <section aria-labelledby="done-for-you" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="done-for-you" className="font-heading text-base text-card-foreground">
            Done for you
          </h2>
          <Link href="/app/agents" className="text-sm font-medium text-brand-300 hover:underline">
            See all
          </Link>
        </div>
        {doneRows.length ? (
          <ul className="flex flex-col gap-2">
            {doneRows.map((row) => {
              const name = isLiveAgentId(row.agent_id) ? agentCredit(row.agent_id) : AGENTS.scribe.name;
              return (
                <li key={row.id} className="text-sm text-card-foreground">
                  {name}: {row.subject_label}{" "}
                  <Link href={`/app/runs/${row.id}`} className="font-medium text-brand-300 hover:underline">
                    Why?
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing finished yet. Work shows up here as the team completes it.</p>
        )}
      </section>
    </div>
  );
}
