"use client";

import { FlaskConicalIcon, RotateCcwIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { QuestionPrompt } from "@/components/agent-elements/question/question-prompt";
import { ToolRowBase } from "@/components/agent-elements/tools/tool-row-base";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { BOX_ICONS } from "@/components/workflows/box-icons";
import { nextLocalTime } from "@/lib/follow-up/quiet-hours";
import { describeBox } from "@/lib/workflows/describe";
import { boxById } from "@/lib/workflows/graph";
import { formatLeadTime, simulateWorkflow, type SimulationChoices } from "@/lib/workflows/simulate";
import type { WorkflowGraph } from "@/lib/workflows/types";
import { ORG_TIMEZONES, ORG_TIMEZONE_LABELS } from "@/lib/timezones";
import { captionText, labelClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

const SAMPLE_NAME = "Jordan";

type StartKind = "now" | "tonight" | "tomorrow";

function startFor(kind: StartKind, now: Date, timeZone: string): Date {
  if (kind === "tonight") return nextLocalTime(now, timeZone, "21:30");
  if (kind === "tomorrow") return nextLocalTime(new Date(now.getTime() + 12 * 3_600_000), timeZone, "10:00");
  return now;
}

/**
 * "Test with a sample lead": a labeled fake lead walks the workflow, step by
 * step, and the person picks the way at every Check. It runs in the browser
 * on the graph alone. No draft, send, task, alert or route is made.
 */
export function TestRun({ graph, defaultTimeZone, now }: { graph: WorkflowGraph; defaultTimeZone: string; now: Date }) {
  const [timeZone, setTimeZone] = useState(defaultTimeZone);
  const [startKind, setStartKind] = useState<StartKind>("now");
  const [choices, setChoices] = useState<Required<SimulationChoices>>({ checks: {}, drafts: {} });

  const start = useMemo(() => startFor(startKind, now, timeZone), [startKind, now, timeZone]);
  const run = useMemo(
    () => simulateWorkflow(graph, { start, lead: { name: SAMPLE_NAME, timeZone }, choices, askAtChecks: true }),
    [graph, start, timeZone, choices]
  );
  const question = run.end.kind === "question" ? boxById(graph, run.end.boxId) : undefined;
  const reset = () => setChoices({ checks: {}, drafts: {} });
  const zones = (ORG_TIMEZONES as readonly string[]).includes(timeZone) ? ORG_TIMEZONES : [timeZone, ...ORG_TIMEZONES];

  return (
    <section aria-labelledby="test-run-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-500/12 text-brand-300">
            <FlaskConicalIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 id="test-run-title" className="text-base font-medium text-card-foreground">
              Test with a sample lead
            </h2>
            <p className={captionText}>Test lead: {SAMPLE_NAME}. Nothing is sent, created or assigned.</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={reset} aria-label="Start the test again">
          <RotateCcwIcon aria-hidden />
          Again
        </Button>
      </div>

      <div className="grid gap-3">
        <label className="flex flex-col">
          <span className={labelClass}>Lead&apos;s time zone</span>
          <Select
            aria-label="Lead's time zone"
            value={timeZone}
            options={zones.map((zone) => ({ value: zone, label: ORG_TIMEZONE_LABELS[zone as keyof typeof ORG_TIMEZONE_LABELS] ?? zone }))}
            onChange={(event) => setTimeZone(event.target.value)}
          />
        </label>
        <label className="flex flex-col">
          <span className={labelClass}>Lead enters</span>
          <Select
            aria-label="When the lead enters"
            value={startKind}
            options={[
              { value: "now", label: "Now" },
              { value: "tonight", label: "Tonight at 9:30 PM" },
              { value: "tomorrow", label: "Tomorrow at 10:00 AM" },
            ]}
            onChange={(event) => {
              setStartKind(event.target.value as StartKind);
              reset();
            }}
          />
        </label>
      </div>

      <ol className="flex flex-col gap-2 rounded-xl border bg-card p-3" aria-label="What happens, step by step">
        {run.steps.map((step, index) => {
          const Icon = BOX_ICONS[step.kind];
          const draftChoice = choices.drafts[step.boxId] ?? "approved";
          return (
            // Keyed by length too, so the newest step opens without changing a mounted row's default.
            <li key={`${step.boxId}-${index}-${run.steps.length}`} className="min-w-0">
              <ToolRowBase
                icon={<Icon className="size-3 text-muted-foreground" aria-hidden />}
                completeLabel={step.exitLabel ? `${step.title} ${step.exitLabel}` : step.title}
                detail={formatLeadTime(step.sendAt ?? step.at, timeZone)}
                isAnimating={false}
                expandable
                defaultOpen={index === run.steps.length - 1}
              >
                <div className="ml-5 space-y-2 border-l pl-3 text-sm text-card-foreground">
                  <p>{step.sentence}</p>
                  {step.kind === "draft" ? (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setChoices((prev) => ({ ...prev, drafts: { ...prev.drafts, [step.boxId]: draftChoice === "approved" ? "expired" : "approved" } }))
                      }
                    >
                      {draftChoice === "approved" ? "Try it not approved in time" : "Try it approved"}
                    </Button>
                  ) : null}
                  {step.kind === "check" ? (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        setChoices((prev) => {
                          const checks = { ...prev.checks };
                          delete checks[step.boxId];
                          return { ...prev, checks };
                        })
                      }
                    >
                      Choose again
                    </Button>
                  ) : null}
                </div>
              </ToolRowBase>
            </li>
          );
        })}
      </ol>

      {question && question.config.kind === "check" ? (
        <QuestionPrompt
          key={question.id}
          questions={[
            {
              kind: "single",
              title: describeBox(question).title,
              description: `At ${formatLeadTime(run.end.at, timeZone)}, ${SAMPLE_NAME}'s time. Pick the way this test goes.`,
              options: [
                { id: "yes", label: question.config.yesLabel || "Yes" },
                { id: "no", label: question.config.noLabel || "No" },
              ],
            },
          ]}
          allowSkip={false}
          submitLabel="Continue"
          onSubmit={(answer) => {
            const picked = answer.selectedIds?.[0];
            if (picked !== "yes" && picked !== "no") return;
            setChoices((prev) => ({ ...prev, checks: { ...prev.checks, [question.id]: picked } }));
          }}
        />
      ) : null}

      {run.end.kind !== "question" ? (
        <div
          role="status"
          className={cn(
            "rounded-xl border p-3 text-sm",
            run.end.kind === "stuck" ? "border-destructive/30 bg-destructive/6 text-destructive-foreground" : "border-border bg-muted text-card-foreground"
          )}
        >
          <p className="font-medium">{run.end.sentence}</p>
          <p className="mt-1 text-muted-foreground">
            In a real run this path would make {run.wouldCreate.drafts === 1 ? "1 draft" : `${run.wouldCreate.drafts} drafts`} for approval
            {run.wouldCreate.tasks ? `, ${run.wouldCreate.tasks === 1 ? "1 task" : `${run.wouldCreate.tasks} tasks`}` : ""}
            {run.wouldCreate.routes ? `, ${run.wouldCreate.routes === 1 ? "1 route" : `${run.wouldCreate.routes} routes`}` : ""}. This test made none of them.
          </p>
        </div>
      ) : null}
    </section>
  );
}
