import Link from "next/link";
import type { ReactNode } from "react";

import { SuggestionButtons } from "@/components/sales-os/action-controls";
import { EmptyLine, RecordSection } from "@/components/sales-os/record-section";
import { Button } from "@/components/ui/button";
import type { CommandData, CommandLead } from "@/lib/sales-os/command";
import { relativeTime } from "@/lib/sales-os/now";

function LeadList({ rows, empty, now, href }: { rows: CommandLead[]; empty: string; now: number; href: (leadId: string) => string }) {
  if (rows.length === 0) return <EmptyLine>{empty}</EmptyLine>;
  return (
    <ul className="divide-y divide-border">
      {rows.map((row, index) => (
        <li key={`${row.leadId}-${index}`} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
          <Link href={href(row.leadId)} scroll={false} className="text-sm underline-offset-4 hover:underline">
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

/** The Command center body. The page loads the data; the queue, activity and lead panel come in as slots. */
export function CommandView({
  data,
  now,
  showFoundation,
  leads,
  manager,
  queue,
  activity,
  lead,
  basePath = "/app/command",
}: {
  data: CommandData;
  now: number;
  showFoundation: boolean;
  leads: boolean;
  manager: boolean;
  queue: ReactNode;
  activity: ReactNode;
  lead: ReactNode | null;
  basePath?: string;
}) {
  const href = (leadId: string) => `${basePath}?lead=${leadId}`;
  return (
    <div className={lead ? "grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" : "flex flex-col gap-4"}>
      <div className="flex min-w-0 flex-col gap-4">
        {showFoundation ? (
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

        {queue}

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
                  <LeadList rows={data.alerts} empty="No open alerts." now={now} href={href} />
                </RecordSection>
                <RecordSection id="command-hot" title="Hot leads with no next step" owner="Assay">
                  <LeadList rows={data.hotNoNext} empty="Every hot lead has a next step." now={now} href={href} />
                </RecordSection>
                <RecordSection id="command-steps" title="Playbook steps due" owner="Relay">
                  <LeadList rows={data.stepsDue} empty="Nothing due in the next day." now={now} href={href} />
                </RecordSection>
              </>
            ) : null}
            <RecordSection
              id="command-eod"
              title={manager ? "End of day" : "Your end of day"}
              owner="Helm"
              action={
                <Link href="/app/manager" className="text-sm underline-offset-4 hover:underline">
                  {manager ? "Open Team" : "Open scorecard"}
                </Link>
              }
            >
              {data.myEod ? <p className="text-sm">Your report for {data.myEod.day} is drafted. Check it and confirm.</p> : <EmptyLine>No report waiting on you.</EmptyLine>}
              {data.teamYesterday ? (
                <p className="text-sm text-muted-foreground">
                  Yesterday: {data.teamYesterday.confirmed} confirmed, {data.teamYesterday.drafted} not confirmed yet.
                </p>
              ) : null}
            </RecordSection>
          </div>
        ) : null}

        {activity}
      </div>

      {lead ? (
        <aside aria-label="Selected lead" className="order-first flex min-w-0 flex-col gap-4 lg:order-last lg:sticky lg:top-4 lg:self-start">
          {lead}
        </aside>
      ) : null}
    </div>
  );
}
