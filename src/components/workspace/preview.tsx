"use client";

import { OrgProvider } from "@/components/app/org-provider";
import { AgentPanelProvider } from "@/components/live/agent-panel";
import { LiveProvider } from "@/components/live/live-provider";
import { RunViewerProvider } from "@/components/live/run-viewer";
import { BriefingSection } from "@/components/workspace/briefing";
import { DecisionsBlock, WorkspaceSubtitle } from "@/components/workspace/blocks";
import { CommandBarDialog, CommandBarField } from "@/components/workspace/command-bar";
import { CrewBand, OperatorAgentLine } from "@/components/workspace/crew-band";
import { AttentionNotice, Importing, WorkspaceLayout } from "@/components/workspace/layout";
import { OutcomeStrip } from "@/components/workspace/outcomes";
import { WorkspaceSection } from "@/components/workspace/section";
import { LiveStream } from "@/components/workspace/stream";
import { WelcomePanel } from "@/components/workspace/welcome";
import { DueNowList, TaskList, WorkNextList } from "@/components/workspace/work";
import type { ClientOrgState, WorkspaceRole } from "@/lib/auth/types";
import type { LiveSnapshot } from "@/lib/live/load";
import type { LiveRun, WaitingItem } from "@/lib/live/model";
import type { DecisionsData, WorkData } from "@/lib/workspace/load";
import { attentionFor } from "@/lib/workspace/state";
import { PREVIEW_STATES, type PreviewState } from "@/components/workspace/preview-states";
import { briefingFrom, OUTCOME_COPY, STATE_COPY, STREAM_COPY, welcomeLines, WORK_COPY } from "@/lib/workspace/voice";

/**
 * Seeded fake records for the development preview. Every name and number
 * here is invented for layout checks and never reaches a customer.
 */


const ORG = "00000000-0000-4000-8000-000000000001";
const MIN = 60_000;
const NOW = Date.parse("2026-10-20T15:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

function org(role: WorkspaceRole): ClientOrgState {
  return {
    user: { id: "preview", email: "preview@example.com", displayName: "Jordan Reyes" },
    org: { id: ORG, name: "Northside Roofing", slug: "northside", timezone: "America/New_York", ghlLocationId: null, status: "active", isPlatformWorkspace: false },
    role: role === "operator" ? "setter" : role === "member" ? "member" : "owner",
    workspaceRole: role,
    isStaff: false,
    isPlatformAdmin: false,
    canApprove: role === "owner",
    canSeeMoney: role === "owner",
    canExport: false,
    avatarPath: null,
    templateAccess: false,
    lostWorkspace: false,
    memberId: "m-preview",
    surfaceAccess: "operator",
    memberships: [],
    cookieNeedsReset: false,
  } as ClientOrgState;
}

function run(id: string, agentId: LiveRun["agentId"], status: LiveRun["status"], subject: string, minutesAgo: number, extra: Partial<LiveRun> = {}): LiveRun {
  return {
    id,
    orgId: ORG,
    agentId,
    leadId: null,
    actorMemberId: null,
    subjectLabel: subject,
    subjectHref: null,
    status,
    currentStepLabel: null,
    plan: [],
    reasonSummary: null,
    plainError: null,
    needsPerson: null,
    sources: [],
    configVersion: null,
    batchId: null,
    simulated: true,
    cause: null,
    createdAt: iso(NOW - (minutesAgo + 2) * MIN),
    startedAt: iso(NOW - (minutesAgo + 2) * MIN),
    finishedAt: status === "working" ? null : iso(NOW - minutesAgo * MIN),
    lastProgressAt: iso(NOW - minutesAgo * MIN),
    ...extra,
  };
}

function waiting(id: string, title: string, reason: string, preview: string): WaitingItem {
  return { id, agentId: "relay", runId: null, kind: "approval", title, reason, preview, leadIds: [`lead-${id}`], status: "pending", createdAt: iso(NOW - 25 * MIN) };
}

const RUNS: LiveRun[] = [
  run("r1", "scribe", "working", "the call from 2:14 PM", 0, { currentStepLabel: "Reading the call from 2:14 PM" }),
  run("r2", "sentry", "completed", "Maria Lopez", 6, { reasonSummary: "Waiting 18 minutes" }),
  run("r3", "relay", "waiting_person", "Alex Kim", 12),
  ...Array.from({ length: 5 }, (_, index) => run(`s${index}`, "scribe", "completed", `the call with lead ${index + 1}`, 40 + index)),
  run("r4", "scribe", "completed", "the call with Jordan Reyes", 130),
];

const WAITING: WaitingItem[] = [
  waiting("d1", "Send a text to Jordan about the Thursday estimate", "Jordan became Hot after booking and replying in 5 minutes.", "Hi Jordan, thanks for booking Thursday. Want me to send the estimate checklist ahead of time?"),
  waiting("d2", "Follow up with Alex Kim", "Alex asked for pricing on the last call.", "Hi Alex, here are the two roof options we talked about. Which one should I price out?"),
];

const DECISIONS: DecisionsData = {
  meta: {
    d1: { leadId: "l1", leadName: "Jordan Reyes", windowEndsAt: iso(NOW + 12 * MIN), tier: "hot", checks: { kind: "clear" } },
    d2: { leadId: "l2", leadName: "Alex Kim", windowEndsAt: null, tier: "warm", checks: { kind: "quiet", resumeAt: iso(NOW + 17 * 60 * MIN), leadName: "Alex", timeZone: "America/New_York" } },
  },
  suggestedTasks: [{ id: "t9", text: "Call the Hendersons back about the gutter quote", because: "Suggested by Sentry because the promised callback is due.", leadId: "l3", leadName: "The Hendersons", source: "sentry" }],
  reconnect: [],
  lastDecisionAt: iso(NOW - 3 * 60 * MIN),
  canDecide: true,
};

const WORK: WorkData = {
  dueNow: [
    { leadId: "l4", name: "Maria Lopez", phone: "+15555550101", kind: "first_touch", state: "missed", deadlineAt: iso(NOW - 8 * MIN), reason: "New lead from the website, no reply yet.", tier: "warm" },
    { leadId: "l5", name: "Sam Patel", phone: "+15555550102", kind: "follow_up", state: "at_risk", deadlineAt: iso(NOW + 9 * MIN), reason: null, tier: null },
  ],
  workNext: [
    { leadId: "l1", name: "Jordan Reyes", phone: "+15555550103", tier: "hot", score: 88, reason: "Booked an estimate for Thursday", createdAt: iso(NOW - 2 * 86_400_000) },
    { leadId: "l6", name: "Dana Brooks", phone: "+15555550104", tier: "warm", score: 64, reason: "Replied within an hour twice", createdAt: iso(NOW - 4 * 86_400_000) },
    { leadId: "l7", name: "Chris Wu", phone: null, tier: "cool", score: 41, reason: "Opened the quote email", createdAt: iso(NOW - 6 * 86_400_000) },
  ],
  tasks: [{ id: "t1", text: "Send the revised quote to the Garcias", dueAt: iso(NOW - 45 * MIN), source: "person", leadId: null, leadName: "The Garcias", snoozed: false }],
  scope: "mine",
  canSeeEveryone: true,
};

const BRIEFING = briefingFrom(
  {
    sinceAt: iso(NOW - 21 * 60 * MIN),
    capped: false,
    newLeads: 9,
    caseFiles: 6,
    caseFilesForReview: 2,
    sentryCaught: 2,
    sentryReached: 2,
    sentrySlowestMinutes: 20,
    relayDrafted: 5,
    relayWaiting: 2,
    relayApproved: 3,
    relaySent: 3,
    assayMovedUp: 4,
    assayNewlyHot: ["Jordan Reyes"],
    needYouToday: 2,
  },
  NOW,
  "America/New_York"
);

const CREW = {
  sentry: { mode: "live" as const, watching: 14, nextDeadlineAt: iso(NOW + 12 * MIN) },
  scribe: { lastFinishedAt: iso(NOW - 40 * MIN) },
  assay: { scoredToday: 6, hotToday: 2, hotNow: 38, paused: false },
  trustAutoRun: [] as string[],
};

const TILES = [
  { id: "first_touch_time" as const, label: "Speed to first response", explain: "", href: "#", unit: "duration" as const, value: 540, trend: [900, 720, null, 660, 600, 560, 540], change: null, compareNote: OUTCOME_COPY.notEnough },
  { id: "leads_waiting" as const, label: "Leads waiting for a reply", explain: "", href: "#", unit: "count" as const, value: 2, trend: null, change: null, compareNote: null },
  { id: "bookings" as const, label: "Booked this week", explain: "", href: "#", unit: "count" as const, value: 7, trend: [0, 1, 2, 1, 0, 2, 1], change: null, compareNote: OUTCOME_COPY.notEnough },
  { id: "relay_approved" as const, label: "Follow-ups approved", explain: "", href: "#", unit: "count" as const, value: 23, trend: [2, 4, 3, 5, 3, 4, 2], change: { previous: 18, better: true }, compareNote: null },
];

export function WorkspacePreview({ state }: { state: PreviewState }) {
  const role: WorkspaceRole = state === "operator" ? "operator" : state === "member" ? "member" : "owner";
  const quiet = state === "quiet" || state === "first" || state === "importing";
  const snapshot: LiveSnapshot = {
    orgId: ORG,
    runs: state === "importing" ? [run("i1", "scribe", "working", "your history", 0, { currentStepLabel: "Reading past calls" })] : quiet ? [] : RUNS,
    events: [],
    controls: state === "paused" ? [{ agentId: "relay", paused: true, changedAt: iso(NOW - 90 * MIN), changedByName: "Dana", reason: null }] : [],
    waiting: quiet ? [] : WAITING,
    loadedAt: iso(NOW),
  };
  const attention =
    state === "attention"
      ? attentionFor([
          { kind: "reconnect", connector: "Your CRM", href: "#" },
          { kind: "delayed", connector: "Your calendar", href: "#" },
        ])
      : null;

  return (
    <OrgProvider value={org(role)}>
      <LiveProvider orgId={ORG} workspaceStatus={state === "paused" ? "paused" : "active"} initial={snapshot} initialCalm={false} offline>
        <RunViewerProvider staff={false}>
          <AgentPanelProvider>
            <CommandBarDialog />
            <nav aria-label="Preview states" className="mx-auto mb-4 flex max-w-6xl flex-wrap gap-2 text-xs">
              {PREVIEW_STATES.map((name) => (
                <a key={name} href={`?state=${name}`} className={name === state ? "font-medium text-brand-300 underline" : "text-muted-foreground"}>
                  {name}
                </a>
              ))}
            </nav>
            {role === "operator" ? <OperatorPreview /> : <OwnerPreview state={state} attention={attention} />}
          </AgentPanelProvider>
        </RunViewerProvider>
      </LiveProvider>
    </OrgProvider>
  );
}

function OwnerPreview({ state, attention }: { state: PreviewState; attention: ReturnType<typeof attentionFor> }) {
  const quiet = state === "quiet";
  const member = state === "member";
  const work = quiet ? { ...WORK, dueNow: [], workNext: [], tasks: [] } : WORK;
  return (
    <WorkspaceLayout
      banner={<AttentionNotice attention={attention} paused={state === "paused"} />}
      title="Northside Roofing"
      subtitle={<WorkspaceSubtitle firstName="Jordan" dueNow={state === "steady" || state === "attention" || member ? 2 : 0} showDecisions />}
      crew={() => <CrewBand facts={quiet || state === "first" ? { ...CREW, sentry: { ...CREW.sentry, watching: 0, nextDeadlineAt: null }, assay: { scoredToday: 0, hotToday: 0, hotNow: 0, paused: false } } : CREW} now={NOW} />}
      stream={() => (
        <WorkspaceSection id="stream" title={STREAM_COPY.heading}>
          <LiveStream moves={quiet || state === "first" || state === "importing" ? [] : [{ id: "m1", leadId: "l6", name: "Dana Brooks", tier: "warm", at: iso(NOW - 20 * MIN) }]} />
        </WorkspaceSection>
      )}
      main={
        <>
          {state === "importing" ? <Importing imported={1240} /> : null}
          {state === "first" ? (
            <WelcomePanel
              businessName="Northside Roofing"
              lines={welcomeLines({ businessName: "Northside Roofing", callsRead: 212, caseFiles: 148, scored: 1240, hotNow: 38, sentryMode: "live", watchFrom: iso(NOW - 26 * 60 * MIN), draftsWaiting: 0, callSourceConnected: true }, NOW, "America/New_York")}
              moves={[
                { key: "team", label: "Invite your closers and setters", href: "#", done: false },
                { key: "hours", label: "Confirm business hours and quiet hours", href: "#", done: false },
                { key: "calendar", label: "Connect a calendar", href: "#", done: true },
              ]}
            />
          ) : null}
          {state !== "importing" && state !== "first" ? (
            <>
              <DecisionsBlock data={{ ...DECISIONS, canDecide: !member }} queue={[]} now={NOW} collapsed={false} />
              {work.dueNow.length || work.workNext.length ? (
                <WorkspaceSection id="work" title={`${WORK_COPY.dueHeading} and ${WORK_COPY.nextHeading.toLowerCase()}`} count={work.dueNow.length}>
                  <div className="flex flex-col gap-5">
                    <DueNowList rows={work.dueNow} />
                    <TaskList rows={work.tasks} />
                    <WorkNextList data={work} learning={state === "steady"} order="best" />
                  </div>
                </WorkspaceSection>
              ) : null}
              <WorkspaceSection id="briefing" title="While you were away" collapsible={false}>
                <BriefingSection briefing={quiet ? briefingFrom({ ...emptyFacts() }, NOW, "America/New_York") : BRIEFING} firstViewToday history={[]} />
              </WorkspaceSection>
              <WorkspaceSection id="outcomes" title={OUTCOME_COPY.heading}>
                <OutcomeStrip tiles={quiet ? [] : TILES} contribution={quiet ? null : { caseFiles: 38, clocks: 212, drafts: 29 }} liveDays={quiet ? 2 : 40} />
              </WorkspaceSection>
              {quiet ? <p className="text-sm text-muted-foreground">{STATE_COPY.quietWatching}</p> : null}
            </>
          ) : null}
        </>
      }
    />
  );
}

function emptyFacts() {
  return {
    sinceAt: iso(NOW - 20 * 60 * MIN),
    capped: false,
    newLeads: 0,
    caseFiles: 0,
    caseFilesForReview: 0,
    sentryCaught: 0,
    sentryReached: 0,
    sentrySlowestMinutes: null,
    relayDrafted: 0,
    relayWaiting: 0,
    relayApproved: 0,
    relaySent: 0,
    assayMovedUp: 0,
    assayNewlyHot: [],
    needYouToday: 0,
  };
}

function OperatorPreview() {
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5">
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-2xl text-card-foreground">Today</h1>
        <WorkspaceSubtitle firstName="Sam" dueNow={1} showDecisions={false} />
      </header>
      <CommandBarField />
      <OperatorAgentLine />
      <WorkspaceSection id="work" title={`${WORK_COPY.dueHeading} and ${WORK_COPY.nextHeading.toLowerCase()}`} count={1}>
        <div className="flex flex-col gap-5">
          <DueNowList rows={WORK.dueNow.slice(0, 1)} />
          <TaskList rows={WORK.tasks} />
          <WorkNextList data={{ ...WORK, canSeeEveryone: false }} learning={false} order="best" />
        </div>
      </WorkspaceSection>
      <DecisionsBlock data={{ ...DECISIONS, canDecide: false, suggestedTasks: DECISIONS.suggestedTasks }} queue={[]} now={NOW} collapsed={false} title="Suggestions for your leads" />
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base text-card-foreground">Your week</h2>
        <ul className="grid grid-cols-3 gap-2">
          {[
            ["New leads assigned to you", "12"],
            ["Your speed to first response", "6 min"],
            ["Bookings from your leads", "3"],
          ].map(([label, value]) => (
            <li key={label} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="font-heading text-lg text-card-foreground">{value}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
