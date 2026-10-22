import Link from "next/link";
import { after } from "next/server";
import { Suspense, type ReactNode } from "react";

import { api } from "../../../convex/_generated/api";
import { loadWaitingTotal } from "@/lib/agents/summary-load";
import { BriefingSection } from "@/components/workspace/briefing";
import { DecisionsBlock, WorkspaceSubtitle } from "@/components/workspace/blocks";
import { CommandBarField } from "@/components/workspace/command-bar";
import { CrewBand, OperatorAgentLine } from "@/components/workspace/crew-band";
import { OutcomeStrip } from "@/components/workspace/outcomes";
import { AgentSidebarSwitch } from "@/components/agents/sidebar-switch";
import { AgenticHomeSwitch, WorkspaceRuntime } from "@/components/workspace/runtime";
import { SectionError, SectionSkeleton, WorkspaceSection } from "@/components/workspace/section";
import { LiveStream } from "@/components/workspace/stream";
import { WelcomePanel, type FirstMove } from "@/components/workspace/welcome";
import { AttentionNotice, Importing, WorkspaceLayout } from "@/components/workspace/layout";
import { DueNowList, TaskList, WorkNextList } from "@/components/workspace/work";
import type { AuthContext } from "@/lib/auth/types";
import { userConvex } from "@/lib/directory/commit";
import { loadApprovalQueue } from "@/lib/home/views";
import { formatMetricValue } from "@/lib/metrics/format";
import type { HomeState, StoredBriefingFacts } from "@/lib/workspace/home-state";
import {
  loadBriefingFacts,
  loadCrewFacts,
  loadDecisions,
  loadDueCount,
  loadFrame,
  loadLeadNames,
  loadOperatorNumbers,
  loadOutcomes,
  loadTierMoves,
  loadWelcomeFacts,
  loadWork,
  type FrameFacts,
} from "@/lib/workspace/load";
import { welcomeWindowOpen } from "@/lib/workspace/state";
import { BRIEFING_COPY, briefingFrom, OUTCOME_COPY, STATE_COPY, STREAM_COPY, WORK_COPY, welcomeLines } from "@/lib/workspace/voice";
import type { SectionId } from "../../../convex/homeRules";

/**
 * The agentic workspace: the sales team's office. Each section loads on its
 * own so a slow one never holds the page, and a failed one offers a retry.
 */

async function guarded(title: string, render: () => Promise<ReactNode>): Promise<ReactNode> {
  try {
    return await render();
  } catch {
    return <SectionError title={title} />;
  }
}

function firstName(ctx: AuthContext): string | null {
  return ctx.member.displayName?.split(/\s+/)[0] || null;
}

function collapsed(home: HomeState, id: SectionId): boolean {
  return home.prefs.collapsed.includes(id);
}

function AttentionBanner({ frame }: { frame: FrameFacts }) {
  return <AttentionNotice attention={frame.state.attention} paused={frame.state.workspacePaused} />;
}

async function CrewBlock({ ctx, frame, home }: { ctx: AuthContext; frame: FrameFacts; home: HomeState }) {
  return guarded("Your agents", async () => <CrewBand facts={await loadCrewFacts(ctx, frame)} now={home.now} />);
}

async function DecisionsArea({ ctx, frame, home }: { ctx: AuthContext; frame: FrameFacts; home: HomeState }) {
  return guarded("Decisions waiting", async () => {
    const [data, queue] = await Promise.all([loadDecisions(ctx, frame), loadApprovalQueue(ctx)]);
    return <DecisionsBlock data={data} queue={queue} now={home.now} collapsed={collapsed(home, "decisions")} />;
  });
}

async function WorkArea({ ctx, frame, home }: { ctx: AuthContext; frame: FrameFacts; home: HomeState }) {
  return guarded("Due now and work next", async () => {
    const work = await loadWork(ctx, home);
    if (!work.dueNow.length && !work.workNext.length && !work.tasks.length && !frame.state.learning) return null;
    return (
      <WorkspaceSection id="work" title={WORK_COPY.dueHeading + " and " + WORK_COPY.nextHeading.toLowerCase()} count={work.dueNow.length} initiallyCollapsed={collapsed(home, "work")}>
        <div className="flex flex-col gap-5">
          <DueNowList rows={work.dueNow} />
          <TaskList rows={work.tasks} />
          <WorkNextList data={work} learning={frame.state.learning} order={home.prefs.workOrder} />
        </div>
      </WorkspaceSection>
    );
  });
}

function toBriefingFacts(stored: StoredBriefingFacts, names: Map<string, string>) {
  return { ...stored, assayNewlyHot: stored.assayNewlyHotIds.flatMap((id) => (names.has(id) ? [names.get(id)!] : [])) };
}

async function BriefingArea({ ctx, home }: { ctx: AuthContext; home: HomeState }) {
  return guarded(BRIEFING_COPY.heading, async () => {
    const sinceAt = home.visit.sinceAt ?? home.now - 86_400_000;
    const due = await loadDueCount(ctx);
    const facts = await loadBriefingFacts(ctx, new Date(sinceAt).toISOString(), home.visit.capped, due);
    const stored: StoredBriefingFacts = { ...facts };
    delete (stored as Partial<typeof facts>).assayNewlyHot;
    if (home.available) {
      after(async () => {
        const client = await userConvex().catch(() => null);
        await client?.mutation(api.home.saveBriefing, { workspaceId: ctx.org.id, day: home.day, sinceAt, facts: stored }).catch(() => undefined);
      });
    }
    const past = home.briefings.filter((entry) => entry.day !== home.day);
    const names = await loadLeadNames([...new Set([...facts.assayNewlyHotIds, ...past.flatMap((entry) => entry.facts.assayNewlyHotIds ?? [])])]);
    const briefing = briefingFrom(toBriefingFacts(stored, names), home.now, ctx.org.timezone);
    const history = past.map((entry) => ({ day: entry.day, briefing: briefingFrom(toBriefingFacts(entry.facts, names), home.now, ctx.org.timezone) }));
    return (
      <WorkspaceSection id="briefing" title={BRIEFING_COPY.heading} collapsible={false}>
        <BriefingSection briefing={briefing} firstViewToday={home.visit.firstViewToday} history={history} />
      </WorkspaceSection>
    );
  });
}

async function OutcomeArea({ ctx, frame, home }: { ctx: AuthContext; frame: FrameFacts; home: HomeState }) {
  return guarded(OUTCOME_COPY.heading, async () => {
    const data = await loadOutcomes(ctx, home.outcomeMetrics);
    if (!data.tiles.length && (frame.state.liveDays === null || frame.state.liveDays >= 7)) return null;
    return (
      <WorkspaceSection
        id="outcomes"
        title={OUTCOME_COPY.heading}
        initiallyCollapsed={collapsed(home, "outcomes")}
        actions={
          ctx.workspaceRole === "owner" || ctx.isStaff ? (
            <Link href="/app/settings/organization#home-numbers" className="text-xs font-medium text-brand-300 hover:underline">
              Choose numbers
            </Link>
          ) : null
        }
      >
        <OutcomeStrip tiles={data.tiles} contribution={data.contribution} liveDays={frame.state.liveDays} />
      </WorkspaceSection>
    );
  });
}

async function StreamArea({ ctx, home }: { ctx: AuthContext; home: HomeState }) {
  return guarded(STREAM_COPY.heading, async () => (
    <WorkspaceSection id="stream" title={STREAM_COPY.heading} initiallyCollapsed={collapsed(home, "stream")}>
      <LiveStream moves={await loadTierMoves(ctx)} />
    </WorkspaceSection>
  ));
}

async function WelcomeArea({ ctx, frame }: { ctx: AuthContext; frame: FrameFacts }) {
  return guarded("Welcome", async () => {
    const facts = await loadWelcomeFacts(ctx, frame, await loadWaitingTotal(ctx.org.id, "relay"));
    const moves: FirstMove[] = [];
    if (facts.draftsWaiting || facts.firstDraftDecided) moves.push({ key: "draft", label: "Approve or skip your first draft", href: "#decisions", done: facts.firstDraftDecided });
    moves.push({ key: "team", label: "Invite your closers and setters", href: "/app/settings/members", done: facts.members > 1 });
    moves.push({ key: "hours", label: "Confirm business hours and quiet hours", href: "/app/settings/business-profile", done: facts.hoursConfirmed });
    if (!facts.calendarConnected) moves.push({ key: "calendar", label: "Connect a calendar", href: "/app/settings/connections", done: false });
    const ordered = [...moves.filter((move) => !move.done), ...moves.filter((move) => move.done)].slice(0, 4);
    return <WelcomePanel businessName={ctx.org.name} lines={welcomeLines(facts, Date.now(), ctx.org.timezone)} moves={ordered} />;
  });
}


async function Subtitle({ ctx, showDecisions }: { ctx: AuthContext; showDecisions: boolean }) {
  const due = await loadDueCount(ctx).catch(() => 0);
  return <WorkspaceSubtitle firstName={firstName(ctx)} dueNow={due} showDecisions={showDecisions} />;
}

export async function AgenticWorkspace({ ctx, home, forceWelcome = false }: { ctx: AuthContext; home: HomeState; forceWelcome?: boolean }) {
  const frame = await loadFrame(ctx, home);
  const { state } = frame;
  const showWelcome = state.showWelcome || (forceWelcome && ctx.workspaceRole === "owner" && welcomeWindowOpen(home.prefs.firstSeenAt, home.now));
  const canSeeDecisions = ctx.isStaff || ctx.workspaceRole === "owner" || ctx.workspaceRole === "member";

  return (
    <WorkspaceLayout
      runtime={<WorkspaceRuntime />}
      banner={<AttentionBanner frame={frame} />}
      title={ctx.org.name}
      subtitle={
        <Suspense fallback={<p className="h-5" aria-hidden />}>
          <Subtitle ctx={ctx} showDecisions={canSeeDecisions} />
        </Suspense>
      }
      crew={(key) => (
        <Suspense key={key} fallback={<SectionSkeleton label="your agents" rows={key === "aside" ? 5 : 1} />}>
          <CrewBlock ctx={ctx} frame={frame} home={home} />
        </Suspense>
      )}
      stream={(key) => (
        <Suspense key={key} fallback={<SectionSkeleton label="live" rows={3} />}>
          <StreamArea ctx={ctx} home={home} />
        </Suspense>
      )}
      main={
        <>
          {state.lifecycle === "importing" ? <Importing imported={frame.imported} /> : null}
          {showWelcome ? (
            <Suspense fallback={<SectionSkeleton label="welcome" rows={2} tall />}>
              <WelcomeArea ctx={ctx} frame={frame} />
            </Suspense>
          ) : null}
          {state.showWork ? (
            <>
              <Suspense fallback={<SectionSkeleton label="decisions" rows={2} tall />}>
                <DecisionsArea ctx={ctx} frame={frame} home={home} />
              </Suspense>
              <Suspense fallback={<SectionSkeleton label="due now and work next" rows={3} />}>
                <WorkArea ctx={ctx} frame={frame} home={home} />
              </Suspense>
            </>
          ) : null}
          {!showWelcome ? (
            <Suspense fallback={<SectionSkeleton label="briefing" rows={1} tall />}>
              <BriefingArea ctx={ctx} home={home} />
            </Suspense>
          ) : null}
          {state.lifecycle !== "importing" && state.lifecycle !== "setup" ? (
            <Suspense fallback={<SectionSkeleton label="numbers" rows={1} />}>
              <OutcomeArea ctx={ctx} frame={frame} home={home} />
            </Suspense>
          ) : null}
          {state.lifecycle === "quiet" ? <p className="text-sm text-muted-foreground">{STATE_COPY.quietWatching}</p> : null}
        </>
      }
      footer={ctx.isStaff ? <div className="space-y-3"><AgenticHomeSwitch enabled available={home.available} /><AgentSidebarSwitch /></div> : null}
    />
  );
}

/** Today for Operators: the same design language, only their leads. */
export async function OperatorToday({ ctx, home, claimable }: { ctx: AuthContext; home: HomeState; claimable: ReactNode }) {
  const frame = await loadFrame(ctx, home);
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5">
      <WorkspaceRuntime />
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="font-heading text-2xl text-card-foreground">Today</h1>
        <Suspense fallback={<p className="h-5" aria-hidden />}>
          <Subtitle ctx={ctx} showDecisions={false} />
        </Suspense>
      </header>
      <CommandBarField />
      <OperatorAgentLine />
      <Suspense fallback={<SectionSkeleton label="your work" rows={3} />}>
        <WorkArea ctx={ctx} frame={frame} home={home} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton label="suggestions" rows={2} />}>
        <OperatorSuggestions ctx={ctx} frame={frame} home={home} />
      </Suspense>
      {claimable}
      <Suspense fallback={<SectionSkeleton label="your numbers" rows={1} />}>
        <OperatorNumbers ctx={ctx} />
      </Suspense>
    </div>
  );
}

async function OperatorSuggestions({ ctx, frame, home }: { ctx: AuthContext; frame: FrameFacts; home: HomeState }) {
  return guarded("Suggestions for your leads", async () => {
    const data = await loadDecisions(ctx, frame);
    return <DecisionsBlock data={data} queue={[]} now={home.now} collapsed={collapsed(home, "decisions")} title="Suggestions for your leads" />;
  });
}

async function OperatorNumbers({ ctx }: { ctx: AuthContext }) {
  return guarded("Your numbers", async () => {
    const rows = await loadOperatorNumbers(ctx);
    if (!rows.length) return null;
    return (
      <section aria-labelledby="ws-mine" className="flex flex-col gap-2">
        <h2 id="ws-mine" className="font-heading text-base text-card-foreground">
          Your week
        </h2>
        <ul className="grid grid-cols-3 gap-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3">
              <span className="text-xs text-muted-foreground">{row.label}</span>
              <span className="font-heading text-lg text-card-foreground">{row.value === null ? "None yet" : formatMetricValue({ unit: row.unit }, row.value)}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  });
}
