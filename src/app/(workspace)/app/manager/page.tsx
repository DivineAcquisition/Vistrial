import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PageFrame } from "@/components/app/page-frame";
import { ConfirmEodForm, DraftTodayButton, ManagerSwitch } from "@/app/(workspace)/app/manager/eod-controls";
import { EmptyLine, RecordSection } from "@/components/sales-os/record-section";
import { Badge } from "@/components/ui/badge";
import { EOD_LABEL, EOD_METRICS, localDay, type EodActivity } from "@/lib/manager/eod";
import type { Metric } from "@/lib/manager/scorecard";
import { loadEods, loadScorecard, teamReps, type EodReport, type Rep, type RepScorecard } from "@/lib/manager/store";
import { isTeamManager } from "@/lib/sales-os/flag";
import { requireSalesOs } from "@/lib/sales-os/guard";
import { requestNow } from "@/lib/sales-os/now";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Team" };

const PERIOD_DAYS = 7;
const DAY = 86_400_000;

function ActivityList({ activity }: { activity: EodActivity }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
      {EOD_METRICS.map((metric) => (
        <div key={metric} className="flex justify-between gap-2 sm:flex-col sm:justify-start">
          <dt className="text-xs text-muted-foreground">{EOD_LABEL[metric]}</dt>
          <dd className="font-medium tabular-nums">{activity[metric]}</dd>
        </div>
      ))}
    </dl>
  );
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.key} className="rounded-xl border border-border p-3">
          <dt className="text-xs text-muted-foreground">{metric.label}</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-2">
            {metric.value !== null ? (
              <span className="text-lg font-medium tabular-nums">{metric.value}</span>
            ) : (
              <span className="text-sm text-muted-foreground">{metric.hidden}</span>
            )}
            {metric.target ? <span className="text-xs text-muted-foreground">target {metric.target}</span> : null}
            {metric.status ? (
              <Badge variant={metric.status === "on_track" ? "success" : "warning"} size="sm">
                {metric.status === "on_track" ? "On track" : "Behind"}
              </Badge>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ScorecardBlock({ card, timeZone }: { card: RepScorecard; timeZone: string }) {
  return (
    <div className="flex flex-col gap-4">
      <MetricGrid metrics={card.metrics} />
      <div>
        <h3 className="text-sm font-medium">Coaching moments</h3>
        {card.coaching.length === 0 ? (
          <EmptyLine>Nothing to coach from recent calls.</EmptyLine>
        ) : (
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {card.coaching.map((moment) => (
              <li key={moment.callId}>
                {moment.text}{" "}
                <Link className="underline" href={`/app/calls/${moment.callId}`}>
                  Open the call from {new Date(moment.occurredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone })}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EodCard({ report, rep, mine }: { report: EodReport; rep: string; mine: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {rep} · {report.day}
        </span>
        <Badge variant={report.status === "confirmed" ? "success" : "info"} size="sm">
          {report.status === "confirmed" ? "Confirmed" : "Waiting for the rep"}
        </Badge>
      </div>
      <ActivityList activity={report.activity} />
      {report.repNote ? <p className="whitespace-pre-line text-sm">{report.repNote}</p> : null}
      {mine && report.status === "drafted" ? <ConfirmEodForm reportId={report.id} /> : null}
    </li>
  );
}

export default async function ManagerPage({ searchParams }: { searchParams: Promise<{ rep?: string }> }) {
  const ctx = await requireSalesOs();
  const db = (await createClient()) as unknown as SupabaseClient;
  const manager = await isTeamManager(ctx.org.id);
  const tz = ctx.org.timezone;
  const since = localDay(requestNow() - PERIOD_DAYS * DAY, tz);
  const { rep: repParam } = await searchParams;

  if (!manager) {
    const reps = await teamReps(db, ctx.org.id);
    const me: Rep = reps.find((rep) => rep.memberId === ctx.member.id) ?? {
      memberId: ctx.member.id,
      name: ctx.member.displayName || "You",
      role: ctx.member.role === "closer" ? "closer" : "setter",
      userId: ctx.user.id,
    };
    const [reports, card] = await Promise.all([loadEods(db, ctx.org.id, { memberId: me.memberId, since }), loadScorecard(db, ctx.org.id, me, PERIOD_DAYS, tz)]);
    return (
      <PageFrame title="My scorecard" description="Your end of day reports and your numbers. Only you and your managers can see them.">
        <div className="flex flex-col gap-4">
          <RecordSection id="my-eod" title="End of day reports" owner="Sales Manager">
            {reports.length === 0 ? (
              <EmptyLine>Your first report is drafted at the end of your business day.</EmptyLine>
            ) : (
              <ul className="flex flex-col gap-3">
                {reports.map((report) => (
                  <EodCard key={report.id} report={report} rep="You" mine />
                ))}
              </ul>
            )}
          </RecordSection>
          <RecordSection id="my-scorecard" title={`Last ${PERIOD_DAYS} days`} owner="Sales Manager">
            <ScorecardBlock card={card} timeZone={tz} />
          </RecordSection>
        </div>
      </PageFrame>
    );
  }

  const reps = await teamReps(db, ctx.org.id);
  const selected = reps.find((rep) => rep.memberId === repParam) ?? null;
  const [reports, cards] = await Promise.all([
    loadEods(db, ctx.org.id, { since, memberId: selected?.memberId }),
    Promise.all((selected ? [selected] : reps).map((rep) => loadScorecard(db, ctx.org.id, rep, PERIOD_DAYS, tz))),
  ]);
  const names = new Map(reps.map((rep) => [rep.memberId, rep.name]));
  const seats =
    ctx.workspaceRole === "owner" && !selected
      ? (((await db.from("org_members").select("id, display_name, can_manage_team").eq("org_id", ctx.org.id).eq("active", true).eq("role", "member")).data ?? []) as Array<{
          id: string;
          display_name: string | null;
          can_manage_team: boolean | null;
        }>)
      : [];

  return (
    <PageFrame
      title={selected ? selected.name : "Team"}
      description={selected ? "Scorecard, reports and coaching for one rep." : "Scorecards against your foundation targets, end of day reports, and coaching."}
      breadcrumbs={selected ? [{ href: "/app/manager", label: "Team" }, { href: `/app/manager?rep=${selected.memberId}`, label: selected.name }] : undefined}
      actions={<DraftTodayButton />}
    >
      <div className="flex flex-col gap-4">
        {selected ? (
          <RecordSection id="rep-scorecard" title={`Last ${PERIOD_DAYS} days`} owner="Sales Manager">
            <ScorecardBlock card={cards[0]} timeZone={tz} />
          </RecordSection>
        ) : (
          <RecordSection id="team-board" title={`Team board, last ${PERIOD_DAYS} days`} owner="Sales Manager">
            {reps.length === 0 ? (
              <EmptyLine>No setters or closers in this workspace yet.</EmptyLine>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {cards.map((card) => {
                  const behind = card.metrics.filter((metric) => metric.status === "behind").length;
                  return (
                    <li key={card.rep.memberId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link className="font-medium underline-offset-4 hover:underline" href={`/app/manager?rep=${card.rep.memberId}`}>
                          {card.rep.name}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          {card.rep.role === "closer" ? "Closer" : "Setter"} · {behind === 0 ? "On track" : behind === 1 ? "1 area behind" : `${behind} areas behind`}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {card.metrics
                          .slice(0, 4)
                          .map((metric) => `${metric.label}: ${metric.value ?? "not enough yet"}`)
                          .join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </RecordSection>
        )}
        {ctx.workspaceRole === "owner" && !selected ? (
          <RecordSection id="team-managers" title="Managers">
            <p className="text-sm text-muted-foreground">A Manager sees the team board and every rep&apos;s reports. It never changes pay, role or access.</p>
            {seats.length === 0 ? (
              <EmptyLine>Invite a member to the workspace to make them a Manager.</EmptyLine>
            ) : (
              <ul className="divide-y divide-border">
                {seats.map((seat) => (
                  <li key={seat.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-sm">{seat.display_name?.trim() || "Member"}</span>
                    <ManagerSwitch memberId={seat.id} name={seat.display_name?.trim() || "Member"} on={seat.can_manage_team === true} />
                  </li>
                ))}
              </ul>
            )}
          </RecordSection>
        ) : null}
        <RecordSection id="team-eods" title="End of day reports" owner="Sales Manager">
          {reports.length === 0 ? (
            <EmptyLine>Reports are drafted at the end of each business day, and reps confirm them.</EmptyLine>
          ) : (
            <ul className="flex flex-col gap-3">
              {reports.slice(0, 30).map((report) => (
                <EodCard key={report.id} report={report} rep={names.get(report.memberId) ?? "Teammate"} mine={report.memberId === ctx.member.id} />
              ))}
            </ul>
          )}
        </RecordSection>
      </div>
    </PageFrame>
  );
}
