"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CopyIcon, ExternalLinkIcon } from "lucide-react";

import { fetchRunDetail } from "@/app/(workspace)/app/agents/actions";
import { AgentGlyph, formatClock, toneText } from "@/components/live/agent-identity";
import { useRunLive } from "@/components/live/live-provider";
import { AgentRequestCard } from "@/components/live/request-card";
import { SourceChips } from "@/components/live/source-chips";
import { StepList } from "@/components/live/step-list";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetPanel, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { AGENTS } from "@/lib/agents/roster";
import type { RunDetail } from "@/lib/live/load";
import {
  formatDuration,
  OPEN_RUN_STATUSES,
  RUN_STATUS_LABEL,
  RUN_STATUS_TONE,
  type LiveOutput,
  type LiveStep,
} from "@/lib/live/model";
import { cn } from "@/lib/utils";

function mergeSteps(saved: LiveStep[], live: LiveStep[]): LiveStep[] {
  const bySeq = new Map(saved.map((step) => [step.seq, step]));
  for (const step of live) bySeq.set(step.seq, step);
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
}

function mergeOutputs(saved: LiveOutput[], live: LiveOutput[]): LiveOutput[] {
  const byId = new Map(saved.map((output) => [output.id, output]));
  for (const output of live) byId.set(output.id, output);
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function ElapsedSince({ since, until }: { since: string; until: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  return <>{formatDuration((until ? Date.parse(until) : now) - Date.parse(since))}</>;
}

/** Text that reveals as it arrives, then settles. Calm mode shows it at once. */
function Reveal({ text, fresh }: { text: string; fresh: boolean }) {
  const [shown, setShown] = useState(fresh ? 0 : text.length);
  useEffect(() => {
    if (!fresh) return;
    const calm =
      document.documentElement.dataset.calm === "true" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const step = calm ? text.length : Math.max(2, Math.ceil(text.length / 60));
    const tick = () => {
      setShown((value) => {
        const next = Math.min(text.length, value + step);
        if (next < text.length) frame = requestAnimationFrame(tick);
        return next;
      });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [fresh, text]);
  return <span className="whitespace-pre-wrap">{text.slice(0, shown)}</span>;
}

function DiffView({ before, after }: { before: unknown; after: unknown }) {
  const render = (value: unknown) => {
    if (value == null) return "Nothing";
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      return Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => `${key.replace(/_/g, " ")}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`)
        .join(", ");
    }
    return String(value);
  };
  return (
    <div className="grid gap-2 sm:grid-cols-2" aria-label="What changed">
      <div className="rounded-lg border border-border p-2">
        <p className="text-xs text-muted-foreground">Before</p>
        <p className="text-sm text-card-foreground line-through decoration-muted-foreground/60">{render(before)}</p>
      </div>
      <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 p-2">
        <p className="text-xs text-muted-foreground">After</p>
        <p className="text-sm text-card-foreground">{render(after)}</p>
      </div>
    </div>
  );
}

const OUTPUT_VERB: Record<string, string> = {
  summary: "Written",
  score: "Scored",
  draft: "Drafted",
  alert: "Raised",
  file: "Saved",
  change: "Changed",
  answer: "Answered",
  note: "Noted",
};

/** The "watch it work" view of one run. Used in the drawer and the full page. */
export function RunViewer({ runId, initial, staff }: { runId: string; initial?: RunDetail | null; staff: boolean }) {
  const [detail, setDetail] = useState<RunDetail | null>(initial ?? null);
  const [missing, setMissing] = useState(false);
  const live = useRunLive(runId);
  const [openedAt] = useState(() => new Date().toISOString());

  const load = useCallback(
    () =>
      fetchRunDetail(runId).then((result) => {
        if (result.ok) setDetail(result.data);
        else setMissing(true);
      }),
    [runId]
  );

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetchRunDetail(runId).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetail(result.data);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initial, runId]);

  // A finished run reloads once so outputs and staff detail are complete.
  const liveStatus = live.run?.status;
  const finished = liveStatus ? !OPEN_RUN_STATUSES.includes(liveStatus) : false;
  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [finished, load]);

  const run = live.run ?? detail?.run ?? null;
  const steps = useMemo(() => mergeSteps(detail?.steps ?? [], live.steps), [detail?.steps, live.steps]);
  const outputs = useMemo(() => mergeOutputs(detail?.outputs ?? [], live.outputs), [detail?.outputs, live.outputs]);

  if (missing) {
    return <p className="text-sm text-muted-foreground">This run is not available. It may have been removed, or it is outside what you can see.</p>;
  }
  if (!run) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const agent = AGENTS[run.agentId];
  const open = OPEN_RUN_STATUSES.includes(run.status);
  const tone = RUN_STATUS_TONE[run.status];
  const waiting = detail?.waiting && detail.waiting.status === "pending" ? detail.waiting : null;

  return (
    <div className="space-y-5">
      <header className="flex items-start gap-3">
        <AgentGlyph agentId={run.agentId} size="lg" working={run.status === "working"} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{agent.name}</p>
          <h2 className="text-base font-semibold text-card-foreground">
            {run.subjectHref ? (
              <Link href={run.subjectHref} className="hover:underline">
                {run.subjectLabel}
              </Link>
            ) : (
              run.subjectLabel
            )}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("font-medium", toneText(tone))}>{RUN_STATUS_LABEL[run.status]}</span>
            <span>Started {formatClock(run.startedAt ?? run.createdAt)}</span>
            <span>
              {open ? "Running for " : "Took "}
              <ElapsedSince since={run.startedAt ?? run.createdAt} until={open ? null : run.finishedAt} />
            </span>
            {detail?.leadName && run.leadId ? (
              <Link href={`/app/cases/${run.leadId}`} className="hover:underline">
                {detail.leadName}
              </Link>
            ) : null}
            {run.simulated ? <span className="rounded border border-warning/40 px-1 text-warning">Simulation</span> : null}
          </div>
        </div>
      </header>

      {run.status === "working" && run.currentStepLabel ? (
        <p className="text-sm text-card-foreground" aria-live="polite">
          <span className="live-shimmer-text">
            {agent.name} is {run.currentStepLabel.charAt(0).toLowerCase() + run.currentStepLabel.slice(1)}
          </span>
        </p>
      ) : null}

      {run.plainError ? (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-card-foreground">
          {run.plainError}
        </p>
      ) : null}

      {waiting ? (
        <section aria-label="Needs you">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-warning">Needs you</h3>
          <AgentRequestCard item={waiting} />
        </section>
      ) : run.needsPerson && run.status === "waiting_person" ? (
        <section aria-label="Needs you" className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
          <p className="font-medium text-card-foreground">{run.needsPerson.prompt}</p>
          <p className="text-xs text-muted-foreground">{run.needsPerson.whoCanAct} can act on this.</p>
        </section>
      ) : null}

      <section aria-label="Steps">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Steps</h3>
        <StepList steps={steps} plan={open ? run.plan : []} />
      </section>

      {run.reasonSummary ? (
        <Collapsible>
          <CollapsibleTrigger className="text-sm font-medium text-brand-300 hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            Why {agent.name} decided this
          </CollapsibleTrigger>
          <CollapsiblePanel>
            <p className="pt-2 text-sm text-card-foreground">{run.reasonSummary}</p>
          </CollapsiblePanel>
        </Collapsible>
      ) : null}

      {run.sources.length ? (
        <section aria-label="Sources">
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Looked at</h3>
          <SourceChips sources={run.sources} />
        </section>
      ) : null}

      {outputs.length ? (
        <section aria-label="Outputs" className="space-y-3">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">What it produced</h3>
          {outputs.map((output) => (
            <article key={output.id} className="live-enter space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-medium text-card-foreground">{output.title}</h4>
                <span className="text-xs text-muted-foreground">
                  {OUTPUT_VERB[output.kind] ?? "Made"} by {agent.name} · {formatClock(output.createdAt)}
                </span>
              </div>
              {output.body ? (
                <p className="text-sm text-card-foreground">
                  <Reveal text={output.body} fresh={output.createdAt > openedAt} />
                </p>
              ) : null}
              {output.kind === "change" || output.before != null || output.after != null ? (
                <DiffView before={output.before} after={output.after} />
              ) : null}
            </article>
          ))}
        </section>
      ) : null}

      {staff ? <StaffDetail runId={run.id} configVersion={run.configVersion} steps={steps} detail={detail} /> : null}
    </div>
  );
}

function StaffDetail({
  runId,
  configVersion,
  steps,
  detail,
}: {
  runId: string;
  configVersion: string | null;
  steps: LiveStep[];
  detail: RunDetail | null;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Collapsible>
      <CollapsibleTrigger className="text-xs font-medium text-muted-foreground hover:text-card-foreground focus-visible:ring-2 focus-visible:ring-ring">
        Technical detail (staff only)
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-border p-3 text-xs">
          <dt className="text-muted-foreground">Run</dt>
          <dd className="flex items-center gap-1 font-mono text-card-foreground">
            <span className="truncate">{runId}</span>
            <button
              type="button"
              aria-label="Copy run identifier"
              className="rounded p-0.5 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                void navigator.clipboard?.writeText(runId);
                setCopied(true);
              }}
            >
              <CopyIcon className="size-3" />
            </button>
            {copied ? <span className="text-muted-foreground">Copied</span> : null}
          </dd>
          <dt className="text-muted-foreground">Configuration</dt>
          <dd className="font-mono text-card-foreground">{configVersion ?? "Not recorded"}</dd>
          {steps.map((step) => (
            <div key={step.seq} className="contents">
              <dt className="text-muted-foreground">Step {step.seq}</dt>
              <dd className="text-card-foreground">
                {step.label} · {step.durationMs != null ? `${step.durationMs} ms` : step.status}
              </dd>
            </div>
          ))}
          {detail?.staff?.errorDetail ? (
            <>
              <dt className="text-muted-foreground">Error</dt>
              <dd className="whitespace-pre-wrap font-mono text-destructive">{detail.staff.errorDetail}</dd>
            </>
          ) : null}
          {detail?.staff && Object.keys(detail.staff.detail).length ? (
            <>
              <dt className="text-muted-foreground">Detail</dt>
              <dd className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-card-foreground">
                {JSON.stringify(detail.staff.detail, null, 2)}
              </dd>
            </>
          ) : null}
        </dl>
      </CollapsiblePanel>
    </Collapsible>
  );
}

type ViewerContext = { open: (runId: string) => void };

const RunViewerContext = createContext<ViewerContext>({ open: () => undefined });

export function useRunViewer(): ViewerContext {
  return useContext(RunViewerContext);
}

/** The drawer form of the run viewer, opened from anywhere. */
export function RunViewerProvider({ staff, children }: { staff: boolean; children: ReactNode }) {
  const [runId, setRunId] = useState<string | null>(null);
  const value = useMemo(() => ({ open: (id: string) => setRunId(id) }), []);
  return (
    <RunViewerContext.Provider value={value}>
      {children}
      <Sheet open={runId !== null} onOpenChange={(open) => (open ? null : setRunId(null))}>
        <SheetPopup side="right" className="w-full max-w-lg">
          <SheetPanel className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2 pr-8">
              <SheetTitle className="text-sm font-medium text-muted-foreground">Agent run</SheetTitle>
              {runId ? (
                <Button size="xs" variant="ghost" render={<Link href={`/app/runs/${runId}`} />} onClick={() => setRunId(null)}>
                  Full page <ExternalLinkIcon className="size-3" aria-hidden />
                </Button>
              ) : null}
            </div>
            {runId ? <RunViewer key={runId} runId={runId} staff={staff} /> : null}
          </SheetPanel>
        </SheetPopup>
      </Sheet>
    </RunViewerContext.Provider>
  );
}
