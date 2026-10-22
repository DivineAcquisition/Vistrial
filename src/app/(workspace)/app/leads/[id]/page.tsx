import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { ScribeCaseFile } from "@/components/live/scribe-case-file";
import { LeadHeader, NowPanel } from "@/components/sales-os/lead-summary";
import { EmptyLine, RecordSection } from "@/components/sales-os/record-section";
import { Badge } from "@/components/ui/badge";
import { isLeadId } from "@/lib/cases/filters";
import type { CaseTimelineEntry } from "@/lib/cases/types";
import { requireSalesOs } from "@/lib/sales-os/guard";
import { loadLeadRecord } from "@/lib/sales-os/lead-record";
import { relativeTime } from "@/lib/sales-os/now";
import { loadScribeCaseFile } from "@/lib/scribe/case-file";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lead" };

const ALERT_STATUS: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  snoozed: "Snoozed",
  withdrawn: "Withdrawn",
  resolved: "Resolved",
};

function timelineRow(entry: CaseTimelineEntry): { what: string; source: string } {
  switch (entry.kind) {
    case "touch":
      return {
        what: `${entry.channel} ${entry.direction}${entry.outcome ? `, ${entry.outcome.replaceAll("_", " ")}` : ""}`,
        source: entry.touchType === "human" ? "A person" : "Automated",
      };
    case "call":
      return { what: `${entry.callType} call${entry.outcome ? `, ${entry.outcome.replaceAll("_", " ")}` : ""}`, source: "Call" };
    case "status":
      return { what: `Stage moved to ${entry.toStatus.replaceAll("_", " ")}`, source: entry.source === "manual" ? "A person" : "CRM" };
    case "activity":
      return { what: entry.headline, source: "Vistrial" };
  }
}

function stamp(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone });
}

export default async function LeadRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isLeadId(id)) notFound();
  const ctx = await requireSalesOs();
  if (ctx.workspaceRole === "member") notFound();
  const [record, scribeFile] = await Promise.all([
    loadLeadRecord(id, { orgId: ctx.org.id, userId: ctx.user.id }),
    loadScribeCaseFile(ctx.org.id, id).catch(() => null),
  ]);
  if (!record) notFound();
  const { payload } = record;
  const now = Date.now();
  const tz = ctx.org.timezone;

  return (
    <PageFrame
      title={payload.lead.name}
      description="Everything known about this lead, from every connected app."
      breadcrumbs={[
        { href: "/app/leads", label: "Leads" },
        { href: `/app/leads/${payload.lead.id}`, label: payload.lead.name },
      ]}
    >
      <div className="flex flex-col gap-4">
        <RecordSection id="lead-header" title="Overview">
          <LeadHeader payload={payload} now={now} />
        </RecordSection>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex min-w-0 flex-col gap-4">
            <RecordSection id="lead-now" title="Now" owner="Compass">
              <NowPanel summary={record.now} />
            </RecordSection>

            <RecordSection id="lead-facts" title="Facts" owner="Scribe">
              <ScribeCaseFile leadId={payload.lead.id} initial={scribeFile} />
            </RecordSection>

            <RecordSection id="lead-timeline" title="Timeline">
              {payload.timeline.entries.length === 0 ? (
                <EmptyLine>Nothing has happened yet.</EmptyLine>
              ) : (
                <ol className="flex flex-col divide-y divide-border">
                  {payload.timeline.entries.map((entry) => {
                    const row = timelineRow(entry);
                    return (
                      <li key={`${entry.kind}-${entry.id}`} className="flex flex-col gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                        <span>{row.what}</span>
                        <span className="text-xs text-muted-foreground">
                          <time dateTime={entry.at}>{stamp(entry.at, tz)}</time> · {row.source}
                          {entry.actorName ? ` · ${entry.actorName}` : ""}
                          {entry.kind === "call" ? (
                            <>
                              {" · "}
                              <Link className="underline" href={`/app/calls/${entry.id}`}>
                                Open the call
                              </Link>
                            </>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </RecordSection>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <RecordSection id="lead-playbook" title="Playbook" owner="Relay">
              {record.playbooks.length === 0 ? (
                <EmptyLine>Not in a playbook.</EmptyLine>
              ) : (
                <ul className="flex flex-col gap-3">
                  {record.playbooks.map((book) => (
                    <li key={book.enrollmentId} className="text-sm">
                      <Link className="font-medium underline-offset-4 hover:underline" href={`/app/workflows/${book.playbookId}`}>
                        {book.playbook}
                      </Link>
                      <p>
                        Now: {book.step}
                        {book.stepSummary ? <span className="text-muted-foreground"> · {book.stepSummary}</span> : null}
                      </p>
                      {book.nextDueAt ? <p className="text-xs text-muted-foreground">Next {relativeTime(book.nextDueAt, now)}</p> : null}
                      {book.status !== "active" ? <Badge variant="warning">{book.status === "paused" ? "Paused" : "Needs attention"}</Badge> : null}
                    </li>
                  ))}
                </ul>
              )}
              {record.approvals.length ? (
                <div className="border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Waiting for approval</p>
                  <ul className="mt-1 flex flex-col gap-1 text-sm">
                    {record.approvals.map((item) => (
                      <li key={item.id}>
                        <Link className="underline-offset-4 hover:underline" href="/app/approvals">
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </RecordSection>

            <RecordSection id="lead-alerts" title="Alerts" owner="Sentry">
              {record.alerts.length === 0 ? (
                <EmptyLine>No alerts on this lead.</EmptyLine>
              ) : (
                <ol className="flex flex-col gap-2" aria-label="Alert thread">
                  {record.alerts.map((alert) => (
                    <li key={alert.id} className="flex flex-col gap-0.5 text-sm">
                      <span className="flex flex-wrap items-center gap-2">
                        {alert.title}
                        <Badge variant={alert.status === "open" ? "warning" : "outline"} size="sm">
                          {ALERT_STATUS[alert.status] ?? alert.status}
                        </Badge>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {alert.kind === "escalation" ? `Escalated, step ${alert.level}` : "Reminder"} · {stamp(alert.createdAt, tz)}
                        {alert.acknowledgedAt ? ` · acknowledged ${relativeTime(alert.acknowledgedAt, now)}` : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </RecordSection>

            <RecordSection id="lead-team" title="Team">
              {record.team.length === 0 ? (
                <EmptyLine>No one on your team has touched this lead yet.</EmptyLine>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {record.team.map((person) => (
                    <li key={person.name}>
                      {person.name}
                      <span className="text-muted-foreground">
                        {" "}
                        · {person.role}
                        {person.lastAt ? `, ${relativeTime(person.lastAt, now)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>

            <RecordSection id="lead-apps" title="In connected apps">
              {record.apps.length === 0 && !payload.lead.crmUrl ? (
                <EmptyLine>This lead is not linked to a connected app yet.</EmptyLine>
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {payload.lead.crmUrl ? (
                    <li>
                      <a className="underline" href={payload.lead.crmUrl} target="_blank" rel="noreferrer">
                        Open in your CRM
                      </a>
                    </li>
                  ) : null}
                  {record.apps.map((app) => (
                    <li key={`${app.key}-${app.externalId}`}>
                      {app.label}
                      <span className="text-muted-foreground"> · {app.lastSyncAt ? `last sync ${relativeTime(app.lastSyncAt, now)}` : "not synced yet"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}
