import Link from "next/link";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/app/page-frame";
import { SalesOsPreviewShell } from "@/components/preview/sales-os-preview-shell";
import { ActionsView } from "@/components/sales-os/actions-view";
import { CommandView } from "@/components/sales-os/command-view";
import { NowPanel, TierBadge } from "@/components/sales-os/lead-summary";
import { EmptyLine, RecordSection } from "@/components/sales-os/record-section";
import type { RunView } from "@/lib/actions/views";
import { registrySeed } from "@/lib/agents/roster";
import { buildAgentSummary, type RawAgent, type RawSummary } from "@/lib/agents/summary";
import type { CommandData } from "@/lib/sales-os/command";
import { nowSummary, requestNow } from "@/lib/sales-os/now";

export const dynamic = "force-dynamic";

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const HOUR = 3_600_000;
const FACTS = { waiting: { approvals: 0, questions: 0 }, openRun: null, latestRun: null, waitingRunsWithoutItem: 0, doneToday: 0, lastDoneAt: null, outputs: [] };

function sampleSummary(now: number) {
  const seed = registrySeed();
  const agent = (row: Record<string, unknown>, patch: Partial<RawAgent> = {}): RawAgent => ({
    id: row.id as string,
    area: (row.area_id as string | null) ?? "sales",
    name: row.name as string,
    sublabel: row.sublabel as string,
    description: row.description as string,
    glyph: row.glyph as string,
    accent: row.accent as string,
    promise: row.promise as string,
    availability: "available",
    inCohort: true,
    planAllowed: true,
    lockedReason: "",
    prerequisites: [],
    sort: row.sort as number,
    startsOn: true,
    activitySource: (row.activity_source as RawAgent["activitySource"]) ?? "runs",
    outputSource: (row.output_source as RawAgent["outputSource"]) ?? "activity",
    version: 1,
    stage: "on",
    paused: false,
    pausedByName: null,
    pausedAt: null,
    pausedReason: null,
    halted: false,
    haltedAt: null,
    queue: null,
    facts: { ...FACTS },
    ...patch,
  });
  const agents = [
    ...seed.agents.map((row) => agent(row)),
    agent({ id: "sales_manager", area_id: "sales", name: "Helm", sublabel: "Team Manager", description: "End of day reports and scorecards.", glyph: "spark", accent: "neutral", promise: "It never changes pay, role or access.", sort: 5 }),
  ];
  const raw: RawSummary = {
    orgId: ORG_ID,
    generatedAt: new Date(now).toISOString(),
    access: "owner",
    workspace: { status: "active", agentsHalted: false, billingState: "active" },
    backlog: { pending: 0, oldestSeconds: 0 },
    sidebar: true,
    areas: seed.areas.map((area) => ({
      id: area.id as string,
      name: area.name as string,
      description: area.description as string,
      recordKind: area.record_kind as string,
      workPage: area.work_page as RawSummary["areas"][number]["workPage"],
      homePage: area.home_page as RawSummary["areas"][number]["homePage"],
      availability: area.availability as "available" | "coming_soon",
      sort: area.sort as number,
    })),
    agents,
    waitingTotal: 2,
  };
  return buildAgentSummary(raw, { crm_connected: true, call_source: true }, now);
}

function sampleCommand(now: number): CommandData {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
  return {
    alerts: [
      { leadId: "lead-1", name: "Sample Lead A", detail: "No reply after the booked call", at: at(2) },
      { leadId: "lead-2", name: "Sample Lead B", detail: "Second follow-up is overdue", at: at(5) },
    ],
    hotNoNext: [{ leadId: "lead-3", name: "Sample Lead C", detail: "Score 86, no next step", at: null }],
    stepsDue: [
      { leadId: "lead-4", name: "Sample Lead D", detail: "Playbook step due", at: new Date(now + 3 * HOUR).toISOString() },
      { leadId: "lead-1", name: "Sample Lead A", detail: "Playbook step due", at: new Date(now + 20 * HOUR).toISOString() },
    ],
    suggestions: [
      { id: "run-1", action: "crm.move_stage", label: "Move a CRM stage", connector: "hubspot", status: "suggested", leadId: "lead-3", leadName: "Sample Lead C", requestedBy: "Relay", createdAt: at(1), resultCode: null, reversible: true },
      { id: "run-2", action: "crm.create_task", label: "Create a CRM task", connector: "hubspot", status: "suggested", leadId: "lead-2", leadName: "Sample Lead B", requestedBy: "Sentry", createdAt: at(3), resultCode: null, reversible: true },
    ],
    myEod: null,
    teamYesterday: { confirmed: 3, drafted: 1 },
    foundation: { confirmed: 0, drafted: 14, needsOwner: 7, total: 21, version: null },
  };
}

function sampleRuns(now: number): RunView[] {
  const at = (hoursAgo: number) => new Date(now - hoursAgo * HOUR).toISOString();
  return [
    { id: "run-3", action: "crm.add_note", label: "Add a CRM note", connector: "hubspot", status: "done", leadId: "lead-1", leadName: "Sample Lead A", requestedBy: "Scribe", createdAt: at(4), resultCode: "ok", reversible: true },
    { id: "run-4", action: "airtable.upsert_record", label: "Create or update an Airtable record", connector: "airtable", status: "failed", leadId: null, leadName: null, requestedBy: "A teammate", createdAt: at(26), resultCode: "not_connected", reversible: true },
  ];
}

/**
 * Development only: the Sales OS screens on labeled fake data. Never served by
 * a production build, never reads a workspace, and saves nothing.
 */
export default async function SalesOsPreviewPage({ searchParams }: { searchParams: Promise<{ view?: string; lead?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { view, lead } = await searchParams;
  const now = requestNow();
  const summary = sampleSummary(now);
  const tabs = [
    { id: "command", label: "Command center" },
    { id: "actions", label: "Actions" },
  ];
  const current = view === "actions" ? "actions" : "command";

  const tabNav = (
    <nav aria-label="Preview screens" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={`/preview/sales-os?view=${tab.id}`}
          aria-current={tab.id === current ? "page" : undefined}
          className={
            tab.id === current
              ? "rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-sm text-card-foreground"
              : "rounded-full border px-3 py-1 text-sm text-muted-foreground hover:text-card-foreground"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );

  if (current === "actions") {
    return (
      <SalesOsPreviewShell title="Actions" summary={summary} generatedAt={new Date(now).toISOString()}>
        <PageFrame title="Actions" description="The only things agents can do in your tools. Anything a lead or client would see always waits for your approval." toolbar={tabNav}>
          <ActionsView policies={new Map([["crm.add_note", "do_and_log"]])} runs={sampleRuns(now)} owner now={now} />
        </PageFrame>
      </SalesOsPreviewShell>
    );
  }

  const leadPanel = lead ? (
    <>
      <RecordSection
        id="preview-lead"
        title="Lead"
        action={
          <Link href="/preview/sales-os" scroll={false} className="text-sm underline-offset-4 hover:underline">
            Close
          </Link>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-lg text-card-foreground">Sample Lead C</span>
          <TierBadge tier="hot" />
        </div>
      </RecordSection>
      <RecordSection id="preview-lead-now" title="Now" owner="Compass">
        <NowPanel
          summary={nowSummary({
            stage: "booked",
            lastTouch: { at: new Date(now - 26 * HOUR).toISOString(), label: "call outbound, connected" },
            nextStep: null,
            ownerName: "Sample Closer",
            overdueSteps: 0,
            openAlerts: 0,
            playbookStep: null,
            waitingApprovals: 1,
            seenAt: new Date(now - 30 * HOUR).toISOString(),
            changes: [{ at: new Date(now - 26 * HOUR).toISOString(), label: "Stage moved to booked" }],
            now,
          })}
        />
      </RecordSection>
    </>
  ) : null;

  return (
    <SalesOsPreviewShell title="Command center" summary={summary} generatedAt={new Date(now).toISOString()}>
      <PageFrame title="Command" description="What needs you now, across your leads, playbooks and team." toolbar={tabNav}>
        <CommandView
          data={sampleCommand(now)}
          now={now}
          showFoundation
          leads
          manager
          basePath="/preview/sales-os"
          queue={
            <RecordSection id="preview-queue" title="Needs your approval">
              <EmptyLine>Drafts waiting for approval show here, from the existing approval queue.</EmptyLine>
            </RecordSection>
          }
          activity={
            <RecordSection id="preview-activity" title="Handled while you were away">
              <EmptyLine>The activity log shows here.</EmptyLine>
            </RecordSection>
          }
          lead={leadPanel}
        />
      </PageFrame>
    </SalesOsPreviewShell>
  );
}
