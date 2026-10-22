"use client";

import { useMemo } from "react";

import CourseCard, { type CardData, type CourseColor } from "@/components/ui/course-design-cards";
import { useLiveState, usePresence } from "@/components/live/live-provider";
import { useRunViewer } from "@/components/live/run-viewer";
import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import { liveStepLabel, OPEN_RUN_STATUSES, runOneLine, type AgentPresence, type LiveRun, type LiveStep, type PresenceState } from "@/lib/live/model";
import { agentMeterProgress, pickCurrentRun, workProgressPercent } from "@/lib/live/work-progress";

const CARD_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function portrait(id: string): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=160&h=160&q=80`;
}

const PORTRAITS: Record<LiveAgentId, [string, string]> = {
  scribe: [portrait("1494790108377-be9c29b29330"), portrait("1500648767791-00dcc994a43e")],
  sentry: [portrait("1438761681033-6461ffad8d80"), portrait("1472099645785-5658abf4ff4e")],
  relay: [portrait("1507003211169-0a1dd7228f2d"), portrait("1534528741775-53994a69daeb")],
  compass: [portrait("1544005313-94ddf0286df2"), portrait("1506794778202-cad84cf45f1d")],
  assay: [portrait("1524504388940-b1c1722653e1"), portrait("1531123897727-8f129e1688ce")],
};

const COLOR: Record<LiveAgentId, CourseColor> = {
  scribe: "green",
  sentry: "orange",
  relay: "blue",
  compass: "red",
  assay: "violet",
};

function formatCardDate(iso: string | null | undefined): string {
  if (!iso) return "No run yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "No run yet";
  return CARD_DATE.format(date);
}

function countdownForState(state: PresenceState): string {
  switch (state) {
    case "working":
      return "In progress";
    case "waiting":
      return "Needs you";
    case "attention":
      return "Check this";
    case "paused":
      return "Paused";
    case "stopped":
      return "Stopped";
    case "getting_ready":
      return "Starting";
    default:
      return "Idle";
  }
}

function countdownForRun(run: LiveRun): string {
  switch (run.status) {
    case "queued":
    case "working":
      return "In progress";
    case "waiting_person":
      return "Needs you";
    case "waiting_provider":
      return "Waiting";
    case "paused":
      return "Paused";
    case "completed":
      return "Done";
    case "needs_person":
      return "Needs a person";
    case "failed":
    case "stuck":
    case "stopped":
      return "Stopped";
    case "expired":
      return "Expired";
  }
}

function faces(agentId: LiveAgentId): Pick<CardData, "imgSrc1" | "imgAlt1" | "imgSrc2" | "imgAlt2"> {
  const [first, second] = PORTRAITS[agentId];
  return { imgSrc1: first, imgAlt1: "", imgSrc2: second, imgAlt2: "" };
}

function percentLabel(value: number): string {
  return `${value}%`;
}

type MeterCard = {
  data: CardData;
  selected?: boolean;
  onSelect?: () => void;
  onCountdown?: () => void;
};

function idlePresence(agentId: LiveAgentId): AgentPresence {
  return {
    agentId,
    state: "idle",
    stateLabel: "Idle",
    liveLabel: null,
    waitingCount: 0,
    currentRunId: null,
    runSummary: "Nothing in progress.",
    pausedBy: null,
    pausedAt: null,
  };
}

export function AgentWorkMeters({
  agentIds,
  runs,
  selectedId,
  onSelect,
  labelledBy,
}: {
  agentIds: readonly LiveAgentId[];
  /** When set, one card per run. An empty list shows a single idle card. */
  runs?: LiveRun[];
  selectedId?: LiveAgentId | null;
  onSelect?: (agentId: LiveAgentId) => void;
  labelledBy?: string;
}) {
  const live = useLiveState();
  const presence = usePresence();
  const viewer = useRunViewer();

  const cards = useMemo(() => {
    const stepsFor = (runId: string): LiveStep[] => live.steps.get(runId) ?? [];
    const watch = (run: LiveRun) => () => viewer.open(run.id);

    const overviewCard = (agentId: LiveAgentId): MeterCard => {
      const agent = AGENTS[agentId];
      const item = presence.find((entry) => entry.agentId === agentId) ?? idlePresence(agentId);
      const run = pickCurrentRun([...live.runs.values()], agentId);
      const steps = run ? stepsFor(run.id) : [];
      const percent = agentMeterProgress(run, steps);
      const work = item.liveLabel ?? item.runSummary ?? "Nothing in progress.";
      const countdown = countdownForState(item.state);
      const open = run != null && OPEN_RUN_STATUSES.includes(run.status);
      return {
        selected: selectedId === agentId,
        onSelect: onSelect ? () => onSelect(agentId) : undefined,
        onCountdown: open && run ? watch(run) : undefined,
        data: {
          id: agentId,
          colorClass: COLOR[agentId],
          date: formatCardDate(run?.startedAt ?? run?.createdAt ?? run?.lastProgressAt),
          title: agent.name,
          description: `${agent.sublabel}. ${work}`,
          progressPercent: percentLabel(percent),
          progressValue: percentLabel(percent),
          ...faces(agentId),
          countdownText: countdown,
          countdownLabel: open && run ? `${countdown}. Watch ${run.subjectLabel}` : undefined,
          selectLabel: `${selectedId === agentId ? "Showing" : "Show"} ${agent.name}. ${agent.sublabel}. ${work} Progress ${percentLabel(percent)}.`,
          href: `/app/agents/${agentId}`,
          countdownHref: open ? undefined : `/app/agents/${agentId}`,
        },
      };
    };

    const runCard = (run: LiveRun): MeterCard => {
      const agent = AGENTS[run.agentId];
      const percent = workProgressPercent(run, stepsFor(run.id));
      const countdown = countdownForRun(run);
      const detail = run.currentStepLabel ? liveStepLabel(run.agentId, run.currentStepLabel) : runOneLine(run);
      const title = run.subjectLabel || agent.name;
      return {
        onSelect: () => viewer.open(run.id),
        onCountdown: () => viewer.open(run.id),
        data: {
          id: run.id,
          colorClass: COLOR[run.agentId],
          date: formatCardDate(run.startedAt ?? run.createdAt),
          title,
          description: `${agent.sublabel}. ${detail}`,
          progressPercent: percentLabel(percent),
          progressValue: percentLabel(percent),
          ...faces(run.agentId),
          countdownText: countdown,
          countdownLabel: `${countdown}. Watch ${title}`,
          selectLabel: `Watch ${title}. ${detail} Progress ${percentLabel(percent)}.`,
          href: run.subjectHref || `/app/agents/${run.agentId}`,
        },
      };
    };

    if (runs) {
      if (runs.length === 0) {
        const agentId = agentIds[0];
        return agentId ? [overviewCard(agentId)] : [];
      }
      return runs.map(runCard);
    }

    return agentIds.map(overviewCard);
  }, [agentIds, live.runs, live.steps, onSelect, presence, runs, selectedId, viewer]);

  if (cards.length === 0) return null;

  return (
    <section className="course-design" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : "Agent progress"}>
      {cards.map((card) => (
        <CourseCard
          key={card.data.id}
          data={card.data}
          selected={card.selected}
          onSelect={card.onSelect}
          onCountdown={card.onCountdown}
        />
      ))}
    </section>
  );
}
