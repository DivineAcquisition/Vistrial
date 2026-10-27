"use client";

import { memo, useMemo, useState } from "react";
import { BotIcon, ChevronRightIcon, CircleCheckIcon, CircleXIcon, NotebookPenIcon, WrenchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  groupLabel,
  groupSteps,
  resultWords,
  stepLabel,
  type RunStepView,
  type StepGroup,
} from "@/lib/runs/view";

/** How many step rows show before "Show earlier steps". Long runs stay quick to render. */
export const VISIBLE_STEPS = 50;

const KIND_ICON = { tool: WrenchIcon, model: BotIcon, note: NotebookPenIcon } as const;

const StepRow = memo(function StepRow({ step }: { step: RunStepView }) {
  const Icon = KIND_ICON[step.kind];
  const failed = step.status === "failed";
  const StatusIcon = failed ? CircleXIcon : CircleCheckIcon;
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 py-2">
      <Icon aria-hidden="true" className="mt-0.5 size-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-card-foreground">
          <span className="text-muted-foreground tabular-nums">{step.index + 1}.</span>
          <span className="break-words">{stepLabel(step)}</span>
          <span className={cn("inline-flex items-center gap-1 text-xs", failed ? "text-destructive" : "text-success")}>
            <StatusIcon aria-hidden="true" className="size-3.5" />
            {failed ? "Could not finish" : "Done"}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDuration(step.durationMs)}
          {step.kind === "model" ? `, ${step.inputTokens + step.outputTokens} tokens` : ""}
          {failed ? `. ${resultWords(step.resultCode)}` : ""}
          <span className="ml-1 font-mono text-[11px] opacity-70">{step.resultCode}</span>
        </p>
      </div>
    </div>
  );
});

const GroupRow = memo(function GroupRow({ group }: { group: Extract<StepGroup, { type: "group" }> }) {
  const failed = group.steps.filter((step) => step.status === "failed").length;
  const total = group.steps.reduce((sum, step) => sum + step.durationMs, 0);
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full items-start gap-3 rounded-md py-2 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-90 motion-reduce:transition-none"
        />
        <span className="min-w-0">
          <span className="block text-sm text-card-foreground">
            <span className="mr-2 text-muted-foreground tabular-nums">
              {group.steps[0].index + 1}–{group.steps[group.steps.length - 1].index + 1}.
            </span>
            {groupLabel(group.toolSlug, group.steps.length)}
          </span>
          <span className="block text-xs text-muted-foreground">
            {formatDuration(total)}
            {failed > 0 ? `. ${failed} could not finish.` : "."}
          </span>
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ol className="ml-7 border-l border-border pl-3">
          {group.steps.map((step) => (
            <li key={step.id}>
              <StepRow step={step} />
            </li>
          ))}
        </ol>
      </CollapsiblePanel>
    </Collapsible>
  );
});

/** Ordered steps, repeats folded into groups, the running one marked with a quiet shimmer. */
export function StepList({ steps, running }: { steps: RunStepView[]; running: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const groups = useMemo(() => groupSteps(steps), [steps]);
  const hiddenGroups = showAll ? 0 : Math.max(0, groups.length - VISIBLE_STEPS);
  const visible = hiddenGroups > 0 ? groups.slice(hiddenGroups) : groups;
  const hidden = groups
    .slice(0, hiddenGroups)
    .reduce((sum, group) => sum + (group.type === "group" ? group.steps.length : 1), 0);

  if (steps.length === 0 && !running) {
    return <p className="text-sm text-muted-foreground">No steps ran.</p>;
  }

  return (
    <div className="grid gap-1">
      {hidden > 0 ? (
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setShowAll(true)}>
          Show {hidden} earlier {hidden === 1 ? "step" : "steps"}
        </Button>
      ) : null}
      <ol className="grid divide-y divide-border">
        {visible.map((group) => (
          <li key={group.key}>{group.type === "group" ? <GroupRow group={group} /> : <StepRow step={group.step} />}</li>
        ))}
        {running ? (
          <li className="flex items-center gap-3 py-2 text-sm text-muted-foreground">
            <span aria-hidden="true" className="live-pulse size-2 rounded-full bg-primary" />
            <span className="live-shimmer-text">Working on the next step</span>
          </li>
        ) : null}
      </ol>
    </div>
  );
}
