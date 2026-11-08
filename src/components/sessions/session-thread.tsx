"use client";

import { useMutation, useQuery } from "convex/react";
import {
  BookOpenCheck,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  FileText,
  Footprints,
  Loader,
  Brain,
  MessagesSquare,
  LayoutGrid,
  ListChecks,
  MapPin,
  MessageSquareText,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { VistrialMark } from "@/components/brand/vistrial-mark";
import { ChatComposer } from "@/components/chat/chat-composer";
import { useFillViewport } from "@/components/chat/use-fill-viewport";
import { useChatExtras } from "@/components/chat/use-chat-extras";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { ApprovalCard, ChecksList, FindingsView, type SourceLite } from "@/components/research/findings";
import { LiveActivity } from "@/components/research/live-activity";
import { BriefCard, QuestionCard, SourceStatusList, StageProgress, type Studio } from "@/components/research/studio-parts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tone } from "@/components/ui/tone";
import { errorWords, money, PLATFORM_LABEL } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { SourceIcon } from "@/components/research/source-icon";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type ThreadData = {
  studio: Studio;
  steps: { phase?: string | null; status: string; kind: string; resultCode: string; webSearches?: number; webFetches?: number; at?: number }[];
  open: boolean;
  meta: { label: string; tone: Tone } | null;
  statuses: { platform: string; state: string; reasonCode: string; found: number }[];
  sources: Map<string, SourceLite>;
  counts: Map<string, number>;
  reportAsset: { id: string; title: string; status: string; currentVersion: number } | null;
  assetStatus: string | null;
  capCents: number;
};

function when(time: number) {
  return new Date(time).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A turn from the person: right-aligned, in the brand tint. */
function YouSaid({ children, at }: { children: React.ReactNode; at?: number }) {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end gap-3">
      <div className="grid max-w-[min(36rem,85%)] gap-1">
        <div className="rounded-2xl rounded-tr-md bg-primary/10 px-4 py-3 text-sm text-card-foreground ring-1 ring-primary/20">{children}</div>
        {at ? (
          <span className="text-right text-[11px] text-muted-foreground" suppressHydrationWarning>
            You · {when(at)}
          </span>
        ) : null}
      </div>
    </motion.li>
  );
}

/** A turn from the agent: its mark, a short line in its voice, and the working card under it. */
function AgentSaid({ name, line, icon: Icon = Sparkles, children, id }: { name: string; line: React.ReactNode; icon?: typeof Sparkles; children?: React.ReactNode; id?: string }) {
  return (
    <motion.li id={id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex min-w-0 gap-3">
      <VistrialMark className="mt-0.5" />
      <div className="grid min-w-0 flex-1 gap-2">
        <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-card-foreground">
          <Icon aria-hidden className="size-3.5 text-primary" />
          <span className="font-medium">{name}</span> <span className="text-muted-foreground">{line}</span>
        </p>
        {children ? <div className="min-w-0">{children}</div> : null}
      </div>
    </motion.li>
  );
}

/** A card that starts folded to a one-line summary, so the thread stays readable. */
function Fold({ summary, children, defaultOpen = false }: { summary: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm hover:border-primary/40"
      >
        <span className="min-w-0 text-muted-foreground">{summary}</span>
        <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? children : null}
    </div>
  );
}

/**
 * After research: where competitor material actually showed up, with an offer to remember it so later
 * sessions start there. The person decides; nothing is saved without the tap.
 */
function AudienceTurn({ workspaceId, counts, agentName, editor }: { workspaceId: Id<"workspaces">; counts: Map<string, number>; agentName: string; editor: boolean }) {
  const record = useMutation(api.facts.record);
  const facts = useQuery(api.facts.list, { workspaceId });
  const [saved, setSaved] = useState<string | null>(null);
  const ranked = [...counts.entries()].filter(([platform, n]) => platform !== "customerData" && n > 0).sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  const top = ranked.filter(([, n]) => n >= 3).slice(0, 3).map(([platform]) => platform);
  const value = (top.length ? top : ranked.slice(0, 1).map(([platform]) => platform)).join(", ");
  const current = facts?.find((row) => row.factKey === "audienceChannels")?.value ?? null;
  const already = saved === value || current === value;
  return (
    <AgentSaid name={agentName} icon={Brain} line="noted where the material showed up.">
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {ranked.map(([platform, n]) => (
            <span key={platform} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1", top.includes(platform) ? "bg-primary/10 text-primary ring-primary/30" : "bg-background text-muted-foreground ring-border")}>
              <SourceIcon platform={platform} size={12} />
              {PLATFORM_LABEL[platform] ?? platform} · {n}
            </span>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          {already
            ? "Remembered. Your next sessions start with these sources, and you can still add others on the plan."
            : "Should I remember these as where to look first? Next sessions would start there; you can still add others on the plan."}
        </p>
        {!already && editor ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void record({ workspaceId, factKey: "audienceChannels", value }).then(() => setSaved(value))}>
              Yes, remember
            </Button>
          </div>
        ) : null}
      </div>
    </AgentSaid>
  );
}

/** What the person can do next, from where the session stands. */
function Composer({
  workspaceId,
  data,
  editor,
  base,
}: {
  workspaceId: Id<"workspaces">;
  data: ThreadData;
  editor: boolean;
  base: string;
}) {
  const stop = useMutation(api.runs.stop);
  const [notice, setNotice] = useState("");
  const { studio } = data;
  const runStatus = studio.run?.status ?? null;
  const waitingAnswer = Boolean(studio.run?.waitingFor);
  const busy = runStatus === "running" || runStatus === "queued";

  if (!editor) return <p className="text-center text-xs text-muted-foreground">You can follow this session. Owners and Managers decide on it.</p>;

  if (busy) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-primary">
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Working. It asks you if it needs anything, and spends nothing while it waits.
        </span>
        {studio.run ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              void stop({ workspaceId, runId: studio.run!.id as Id<"agentRuns"> }).catch((problem: unknown) => setNotice(errorWords(problem, "It did not stop.")))
            }
          >
            <Square aria-hidden className="size-3.5" /> Stop
          </Button>
        ) : null}
        {notice ? <p className="w-full text-xs text-muted-foreground">{notice}</p> : null}
      </div>
    );
  }

  if (waitingAnswer) {
    return (
      <a href="#question" className="block rounded-2xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
        Waiting for your answer to its question above. Nothing runs or spends until you answer.
      </a>
    );
  }

  return <FollowUpComposer workspaceId={workspaceId} projectId={studio.project.id as Id<"researchProjects">} base={base} hasReport={Boolean(studio.report)} />;
}

/** The chat box inside a session: follow-up questions about the report, with the quality mode and files. */
function FollowUpComposer({ workspaceId, projectId, base, hasReport }: { workspaceId: Id<"workspaces">; projectId: Id<"researchProjects">; base: string; hasReport: boolean }) {
  const router = useRouter();
  const ask = useMutation(api.followups.ask);
  const followups = useQuery(api.followups.list, { workspaceId, projectId });
  const shell = useWorkspaceShell();
  const extras = useChatExtras(workspaceId, shell?.role !== "rep", shell?.role === "owner");
  const [notice, setNotice] = useState("");
  const busy = followups?.messages.some((row) => row.status === "thinking" || row.status === "running") ?? false;
  return (
    <div className="grid gap-1">
      <ChatComposer
        placeholder={hasReport ? "Ask about this report, or ask for more research…" : "Ask a follow-up, or start a new session…"}
        disabled={busy}
        mode={extras.composer.mode}
        files={extras.composer.files}
        connect={extras.composer.connect}
        footnote={
          notice ||
          `Answers come from this session's sources and cost a few cents. New research is proposed first, with an estimate, and runs only when you tap Run.${
            followups && followups.spentCents > 0 ? ` Follow-ups so far: ${money(followups.spentCents)}.` : ""
          }`
        }
        onSubmit={async (text) => {
          setNotice("");
          if (!hasReport) {
            router.push(`${base}/sessions/new?objective=${encodeURIComponent(text)}`);
            return;
          }
          try {
            await extras.attachTo({ projectId });
            extras.reset();
            await ask({ workspaceId, projectId, text, mode: extras.mode });
          } catch (problem) {
            setNotice(errorWords(problem, "That question was not sent."));
            throw problem;
          }
        }}
      />
    </div>
  );
}

/** Follow-up turns after the report: answers with their sources, and research waiting for a Run tap. */
function FollowUps({ workspaceId, projectId, agentName, editor }: { workspaceId: Id<"workspaces">; projectId: Id<"researchProjects">; agentName: string; editor: boolean }) {
  const data = useQuery(api.followups.list, { workspaceId, projectId });
  const run = useMutation(api.followups.run);
  const decline = useMutation(api.followups.decline);
  return (
    <FollowUpsView
      messages={data?.messages ?? []}
      agentName={agentName}
      editor={editor}
      onRun={(chatId) => void run({ workspaceId, chatId: chatId as Id<"sessionChats"> })}
      onDecline={(chatId) => void decline({ workspaceId, chatId: chatId as Id<"sessionChats"> })}
    />
  );
}

export type FollowUpMessage = { id: string; role: string; kind: string; text: string; status: string; data?: unknown; costCents: number };

/** The follow-up turns as plain data, so stories can show them without a backend. */
export function FollowUpsView({
  messages,
  agentName,
  editor,
  onRun,
  onDecline,
}: {
  messages: FollowUpMessage[];
  agentName: string;
  editor: boolean;
  onRun: (chatId: string) => void;
  onDecline: (chatId: string) => void;
}) {
  if (messages.length === 0) return null;
  const data = { messages };
  return (
    <>
      {data.messages.map((row) => {
        if (row.role === "you") return <YouSaid key={row.id}>{row.text}</YouSaid>;
        const cited = ((row.data as { cited?: { id: string; title: string; url: string; platform: string }[] } | null)?.cited ?? []).slice(0, 8);
        if (row.status === "thinking" || row.status === "running") {
          return (
            <AgentSaid key={row.id} name={agentName} icon={row.status === "running" ? Search : MessageSquareText} line={row.status === "running" ? "is researching that now." : "is reading this session's sources."}>
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <Loader aria-hidden className="size-4 animate-spin text-primary motion-reduce:animate-none" /> Working…
              </span>
            </AgentSaid>
          );
        }
        if (row.kind === "proposal" && row.status !== "done") {
          const plan = row.data as { searches?: string[]; low?: number; high?: number } | null;
          return (
            <AgentSaid key={row.id} name={agentName} icon={Search} line="needs new research for that.">
              <div className="grid gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm text-card-foreground">{row.text}</p>
                {plan?.searches?.length ? (
                  <ul className="grid gap-1">
                    {plan.searches.map((query) => (
                      <li key={query} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Search aria-hidden className="size-3" /> {query}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Estimate {money(plan?.low ?? 0)}–{money(plan?.high ?? 0)}. New pages it finds join this session as sources.
                </p>
                {row.status === "proposed" && editor ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="gradient" onClick={() => onRun(row.id)}>
                      Run
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDecline(row.id)}>
                      Not now
                    </Button>
                  </div>
                ) : row.status === "declined" ? (
                  <p className="text-xs text-muted-foreground">Not run.</p>
                ) : null}
              </div>
            </AgentSaid>
          );
        }
        return (
          <AgentSaid key={row.id} name={agentName} icon={row.kind === "proposal" ? Search : MessageSquareText} line={row.kind === "proposal" ? "researched it:" : "answered from this session's sources:"}>
            <div className="grid gap-2 rounded-xl border border-border bg-card p-4">
              <p className="text-sm whitespace-pre-line text-card-foreground">{row.text}</p>
              {cited.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {cited.map((source, index) => (
                    <a
                      key={source.id}
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-64 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    >
                      [{index + 1}] <span className="truncate">{source.title}</span>
                    </a>
                  ))}
                </div>
              ) : row.status === "done" ? (
                <p className="text-xs text-muted-foreground">No source in this session answers it directly.</p>
              ) : null}
              {row.costCents > 0 ? <p className="text-[11px] text-muted-foreground">{money(row.costCents)}</p> : null}
            </div>
          </AgentSaid>
        );
      })}
    </>
  );
}

/**
 * One session as a conversation: what you asked, the plan, any question, the work as it happens, what it
 * found, the checks and your decision. Each turn is a real record from the run, not chat kept as memory.
 */
export function SessionThread({
  workspaceId,
  data,
  editor,
  agentName,
  base,
  intakeMessages = [],
}: {
  workspaceId: Id<"workspaces">;
  data: ThreadData;
  editor: boolean;
  agentName: string;
  base: string;
  /** The chat that started this session, if it began as one. */
  intakeMessages?: { id: string; role: "you" | "agent"; kind: string; text: string }[];
}) {
  const column = useFillViewport<HTMLElement>();
  const { studio } = data;
  const project = studio.project;
  const run = studio.run;
  const brief = studio.brief;
  const context = studio.context;
  const knownCount = context?.known.length ?? 0;
  const missingCount = context?.missing.length ?? 0;
  const sourceList = [...data.sources.values()];
  const supplied = sourceList.filter((row) => row.origin === "supplied").length;
  const competitors = (project as { competitors?: { name: string }[] }).competitors ?? [];

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <section ref={column} className="flex min-w-0 flex-col gap-4" aria-label="Session">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="min-w-0">
            <Link href={`${base}/sessions`} className="text-xs text-muted-foreground hover:text-foreground">
              Sessions
            </Link>
            <h2 className="font-heading text-lg break-words text-foreground">{project.title}</h2>
          </div>
          {data.meta ? <StatusBadge label={data.meta.label} tone={data.meta.tone} className="[&_span]:normal-case" /> : null}
        </div>

        <ol className="grid gap-5" aria-label="Conversation">
          {intakeMessages.length ? (
            <li>
              <Fold
                summary={
                  <span className="flex items-center gap-2">
                    <MessagesSquare aria-hidden className="size-4 text-primary" />
                    How this session started: {intakeMessages.filter((row) => row.kind === "question").length} questions, then the plan you started
                  </span>
                }
              >
                <ul className="grid gap-2 rounded-xl border border-border bg-card p-3">
                  {intakeMessages
                    .filter((row) => row.kind === "text" || row.kind === "question" || row.kind === "found")
                    .map((row) => (
                      <li key={row.id} className={cn("text-sm", row.role === "you" ? "text-right text-card-foreground" : "text-muted-foreground")}>
                        <span className="text-xs text-muted-foreground">{row.role === "you" ? "You" : agentName}: </span>
                        {row.text}
                      </li>
                    ))}
                </ul>
              </Fold>
            </li>
          ) : null}
          <YouSaid at={(project as { createdAt?: number }).createdAt}>
            <p className="break-words">{project.objective}</p>
            <span className="mt-2 flex flex-wrap gap-1.5">
              {project.market ? (
                <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border">{project.market}</span>
              ) : null}
              {project.geography ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
                  <MapPin aria-hidden className="size-3" /> {project.geography}
                </span>
              ) : null}
              {competitors.length ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
                  <Users aria-hidden className="size-3" /> {competitors.map((row) => row.name).join(", ")}
                </span>
              ) : null}
              {supplied ? (
                <span className="rounded-full bg-background/70 px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
                  {supplied} {supplied === 1 ? "link" : "links"}
                </span>
              ) : null}
            </span>
          </YouSaid>

          {!run ? (
            <AgentSaid name={agentName} line="has not started this one yet." />
          ) : (
            <AgentSaid
              name={agentName}
              icon={ClipboardList}
              line={
                brief
                  ? "read your business memory and wrote a plan before researching anything."
                  : context
                    ? "read your business memory. The plan comes next."
                    : "is reading your business memory."
              }
            >
              {context || brief ? (
                <Fold
                  summary={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-card-foreground">Task brief</span>
                      <span>{knownCount} known</span>
                      <span className={missingCount ? "text-warning" : ""}>{missingCount} missing</span>
                      <span>Budget {money(data.capCents)}</span>
                      {brief ? <span>{brief.researchQuestions.length} questions</span> : null}
                    </span>
                  }
                >
                  <BriefCard studio={studio} capCents={data.capCents} />
                </Fold>
              ) : null}
            </AgentSaid>
          )}

          {run?.waitingFor ? (
            <AgentSaid id="question" name={agentName} icon={MessageSquareText} line="needs one answer before it can go on.">
              <QuestionCard workspaceId={workspaceId} studio={studio} canAnswer={editor} />
            </AgentSaid>
          ) : null}

          {run && !run.waitingFor ? (
            <AgentSaid name={agentName} icon={Search} line={data.open ? "is working on it now." : "researched it. Here is how that went."}>
              {data.open ? (
                <LiveActivity steps={data.steps} sources={sourceList} status={run.status} startedAt={run.startedAt} finishedAt={run.finishedAt} costCents={run.costCents} />
              ) : (
                <Fold
                  summary={
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-card-foreground">{data.steps.length} steps</span>
                      <span>{data.steps.reduce((sum, step) => sum + (step.webSearches ?? 0), 0)} searches</span>
                      <span>{sourceList.length} sources kept</span>
                      <span>{money(run.costCents)}</span>
                    </span>
                  }
                >
                  <LiveActivity steps={data.steps} sources={sourceList} status={run.status} startedAt={run.startedAt} finishedAt={run.finishedAt} costCents={run.costCents} />
                </Fold>
              )}
            </AgentSaid>
          ) : null}

          {studio.report ? (
            <AgentSaid name={agentName} icon={BookOpenCheck} line="found these. Click any evidence chip to open the sources behind it.">
              <FindingsView
                workspaceId={workspaceId}
                studio={studio}
                sources={data.sources}
                assetStatus={data.assetStatus}
                canDecide={editor}
                boardHref={`/app/research/${project.id}/board`}
                showDecision={false}
              />
            </AgentSaid>
          ) : null}

          {studio.checks ? (
            <AgentSaid
              name={agentName}
              icon={ShieldCheck}
              line={studio.checks.passed ? "checked the report against eight rules in code. All passed." : "checked the report against eight rules in code. Some did not pass."}
            >
              <Fold summary={<span className={studio.checks.passed ? "text-success" : "text-warning"}>{studio.checks.results.filter((row) => row.passed).length} of {studio.checks.results.length} checks passed</span>}>
                <Panel className="p-4">
                  <ChecksList checks={studio.checks} />
                </Panel>
              </Fold>
            </AgentSaid>
          ) : null}

          {run?.status === "completed" && data.counts.size ? <AudienceTurn workspaceId={workspaceId} counts={data.counts} agentName={agentName} editor={editor} /> : null}

          {studio.assetId && data.assetStatus ? (
            <AgentSaid name={agentName} icon={FileText} line={data.assetStatus === "approved" ? "has your approval on this report." : "is waiting for your decision."}>
              <ApprovalCard workspaceId={workspaceId} assetId={studio.assetId as Id<"assets">} status={data.assetStatus} canDecide={editor} />
            </AgentSaid>
          ) : null}

          <FollowUps workspaceId={workspaceId} projectId={project.id as Id<"researchProjects">} agentName={agentName} editor={editor} />
        </ol>

        <div className="sticky bottom-20 z-10 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-4 md:bottom-4">
          <Composer workspaceId={workspaceId} data={data} editor={editor} base={base} />
        </div>
      </section>

      <aside className="grid min-w-0 content-start gap-3 lg:sticky lg:top-4 lg:self-start" aria-label="Session details">
        <Panel className="grid gap-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-card-foreground">
            <Footprints aria-hidden className="size-4 text-primary" /> Progress
          </h3>
          {run ? <StageProgress steps={data.steps} open={data.open} /> : <p className="text-sm text-muted-foreground">Not started.</p>}
          {run ? (
            <p className="text-xs text-muted-foreground">
              Spent {money(run.costCents)} of {money(data.capCents)}
            </p>
          ) : null}
        </Panel>
        <Panel className="grid gap-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium text-card-foreground">
            <ListChecks aria-hidden className="size-4 text-primary" /> Sources
          </h3>
          <SourceStatusList statuses={data.statuses} />
          {data.counts.size ? (
            <p className="text-xs text-muted-foreground">
              Kept: {[...data.counts.entries()].map(([platform, n]) => `${n} ${PLATFORM_LABEL[platform] ?? platform}`).join(", ")}
            </p>
          ) : null}
        </Panel>
        <Panel className="grid gap-1 p-2">
          {[
            { href: `/app/research/${project.id}/board`, label: "Research board", icon: LayoutGrid, show: data.sources.size > 0 },
            { href: data.reportAsset ? `/app/assets/${data.reportAsset.id}` : "", label: data.reportAsset ? `Report, version ${data.reportAsset.currentVersion}` : "", icon: FileText, show: Boolean(data.reportAsset) },
            { href: run ? `/app/runs/${run.id}` : "", label: "Every step", icon: ExternalLink, show: Boolean(run) },
          ]
            .filter((item) => item.show)
            .map((item) => (
              <Link key={item.label} href={item.href} className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-card-foreground hover:bg-accent">
                <item.icon aria-hidden className="size-4 text-muted-foreground" /> {item.label}
              </Link>
            ))}
        </Panel>
      </aside>
    </div>
  );
}
