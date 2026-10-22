import Link from "next/link";
import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ActivitySection, ActivitySkeleton, QueueSection, QueueSkeleton } from "@/app/(workspace)/app/home/sections";
import { PageFrame } from "@/components/app/page-frame";
import { SuggestionButtons } from "@/components/sales-os/action-controls";
import { LeadHeader, NowPanel } from "@/components/sales-os/lead-summary";
import { EmptyLine, RecordSection } from "@/components/sales-os/record-section";
import { Button } from "@/components/ui/button";
import { isLeadId } from "@/lib/cases/filters";
import { loadCommand, type CommandLead } from "@/lib/sales-os/command";
import { isTeamManager } from "@/lib/sales-os/flag";
import { requireSalesOs } from "@/lib/sales-os/guard";
import { loadLeadRecord } from "@/lib/sales-os/lead-record";
import { relativeTime } from "@/lib/sales-os/now";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Command" };

function LeadList({ rows, empty, now }: { rows: CommandLead[]; empty: string; now: number }) {
  if (rows.length === 0) return <EmptyLine>{empty}</EmptyLine>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((row, index) => (
        <li key={`${row.leadId}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
          <Link href={`/app/command?lead=${row.leadId}`} scroll={false} className="text-sm underline-offset-4 hover:underline">
            {row.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {row.detail}
            {row.at ? ` · ${relativeTime(row.at, now)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function CommandPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const ctx = await requireSalesOs();
  const { lead } = await searchParams;
  const db = (await createClient()) as unknown as SupabaseClient;
  const leads = ctx.workspaceRole !== "member" || ctx.isStaff;
  const manager = await isTeamManager(ctx.org.id);
  const now = Date.now();
  const [data, record] = await Promise.all([
    loadCommand(db, {
      orgId: ctx.org.id,
      memberId: ctx.member.id,
      timeZone: ctx.org.timezone,
      leads,
      manager,
      now,
    }),
    leads && lead && isLeadId(lead) ? loadLeadRecord(lead, { orgId: ctx.org.id, userId: ctx.user.id }) : Promise.resolve(null),
  ]);
  const owner = ctx.workspaceRole === "owner";
  const foundationOpen = data.foundation.version === null || data.foundation.confirmed < data.foundation.total;

  return (
    <PageFrame title="Command" description="What needs you now, across your leads, playbooks and team.">
      <div className={record ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" : "flex flex-col gap-4"}>
        <div className="flex min-w-0 flex-col gap-4">
          {foundationOpen && (owner || ctx.isStaff) ? (
            <RecordSection
              id="command-foundation"
              title="Confirm your foundation"
              owner="Compass"
              action={
                <Button size="sm" variant="outline" render={<Link href="/app/foundation" />}>
                  Open Foundation
                </Button>
              }
            >
              <p className="text-sm text-muted-foreground">
                {data.foundation.confirmed} of {data.foundation.total} fields confirmed. {data.foundation.drafted} drafted and waiting for you,{" "}
                {data.foundation.needsOwner} only you can answer. Agents use confirmed fields only.
              </p>
            </RecordSection>
          ) : null}

          <Suspense fallback={<QueueSkeleton />}>
            <QueueSection ctx={ctx} />
          </Suspense>

          <RecordSection id="command-suggestions" title="Suggested changes" owner="Waiting for a confirm">
            {data.suggestions.length === 0 ? (
              <EmptyLine>No suggestions right now.</EmptyLine>
            ) : (
              <ul className="divide-y divide-border">
                {data.suggestions.map((run) => (
                  <li key={run.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm">
                        {run.label}
                        {run.leadName ? <span className="text-muted-foreground"> for {run.leadName}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {run.requestedBy} · {relativeTime(run.createdAt, now)}
                      </p>
                    </div>
                    <SuggestionButtons runId={run.id} />
                  </li>
                ))}
              </ul>
            )}
          </RecordSection>

          {leads || manager ? (
            <div className="grid gap-4 md:grid-cols-2">
              {leads ? (
                <>
                  <RecordSection id="command-alerts" title="Open alerts" owner="Sentry">
                    <LeadList rows={data.alerts} empty="No open alerts." now={now} />
                  </RecordSection>
                  <RecordSection id="command-hot" title="Hot leads with no next step" owner="Assay">
                    <LeadList rows={data.hotNoNext} empty="Every hot lead has a next step." now={now} />
                  </RecordSection>
                  <RecordSection id="command-steps" title="Playbook steps due" owner="Relay">
                    <LeadList rows={data.stepsDue} empty="Nothing due in the next day." now={now} />
                  </RecordSection>
                </>
              ) : null}
              <RecordSection
                id="command-eod"
                title={manager ? "End of day" : "Your end of day"}
                owner="Sales Manager"
                action={
                  <Link href="/app/manager" className="text-sm underline-offset-4 hover:underline">
                    {manager ? "Open Team" : "Open scorecard"}
                  </Link>
                }
              >
                {data.myEod ? (
                  <p className="text-sm">Your report for {data.myEod.day} is drafted. Check it and confirm.</p>
                ) : (
                  <EmptyLine>No report waiting on you.</EmptyLine>
                )}
                {data.teamYesterday ? (
                  <p className="text-sm text-muted-foreground">
                    Yesterday: {data.teamYesterday.confirmed} confirmed, {data.teamYesterday.drafted} not confirmed yet.
                  </p>
                ) : null}
              </RecordSection>
            </div>
          ) : null}

          <Suspense fallback={<ActivitySkeleton />}>
            <ActivitySection ctx={ctx} />
          </Suspense>
        </div>

        {record ? (
          <aside aria-label="Selected lead" className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
            <RecordSection
              id="command-lead"
              title="Lead"
              action={
                <Link href="/app/command" scroll={false} className="text-sm underline-offset-4 hover:underline">
                  Close
                </Link>
              }
            >
              <LeadHeader payload={record.payload} now={now} compact />
            </RecordSection>
            <RecordSection id="command-lead-now" title="Now" owner="Compass">
              <NowPanel summary={record.now} />
            </RecordSection>
          </aside>
        ) : null}
      </div>
    </PageFrame>
  );
}
