"use client";

import { useOrg } from "@/components/app/org-provider";
import { useWaitingTotal } from "@/components/live/live-provider";
import { WorkspaceSection } from "@/components/workspace/section";
import { DecisionsSection } from "@/components/workspace/decisions";
import type { QueueItemView } from "@/lib/home/views";
import type { DecisionsData } from "@/lib/workspace/load";
import { DECISION_COPY, subtitle } from "@/lib/workspace/voice";

/** The one "waiting on you" total, the same number as the sidebar and the Overview badge. */
function useOpenDecisions(): number {
  return useWaitingTotal();
}

/** The true line under the business name. Decisions are live; due now comes from Sentry's clocks. */
export function WorkspaceSubtitle({ firstName, dueNow, showDecisions }: { firstName: string | null; dueNow: number; showDecisions: boolean }) {
  const { org } = useOrg();
  const decisions = useOpenDecisions();
  const hour = Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: org.timezone })) % 24;
  return <p className="text-sm text-muted-foreground">{subtitle({ firstName, hour, decisions: showDecisions ? decisions : null, dueNow })}</p>;
}

export function DecisionsBlock({
  data,
  queue,
  now,
  collapsed,
  title = DECISION_COPY.heading,
}: {
  data: DecisionsData;
  queue: QueueItemView[];
  now: number;
  collapsed: boolean;
  title?: string;
}) {
  const decisions = useOpenDecisions();
  const total = decisions + queue.length + data.suggestedTasks.length + data.reconnect.length;
  return (
    <WorkspaceSection id="decisions" title={title} count={total} initiallyCollapsed={collapsed} summary={total ? DECISION_COPY.waiting(total) : null}>
      <DecisionsSection data={data} queue={queue} now={now} />
    </WorkspaceSection>
  );
}
