"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type ReactNode } from "react";

import { Check, Eye, Hand, Info, Lock, MousePointerClick, Plug, ShieldCheck, TriangleAlert, Unplug, X } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type BrowserOverview = FunctionReturnType<typeof api.browserAccess.overview>;
export type BrowserTrail = FunctionReturnType<typeof api.browserAccess.trail>;
type TrailStep = BrowserTrail["steps"][number];

export type BrowserActions = {
  connect: (site: string) => Promise<void>;
  completeSignIn: (sessionId: string) => Promise<void>;
  revoke: (sessionId: string) => Promise<void>;
  startTask: (sessionId: string, goalKey: string) => Promise<void>;
  decide: (stepId: string, approve: boolean, confirmWord?: string) => Promise<void>;
  stop: (browserTaskId: string) => Promise<void>;
};

export type BrowserAccessProps = {
  overview: BrowserOverview;
  /** The audit trail of the task that is open. Null for a Rep, or while nothing is open. */
  trail: BrowserTrail | null;
  onOpenTask: (browserTaskId: string) => void;
  actions: BrowserActions;
};

const SESSION_WORDS: Record<string, { label: string; tone: "good" | "warning" | "neutral" | "critical" }> = {
  pendingSignIn: { label: "Waiting for you to sign in", tone: "warning" },
  active: { label: "Signed in", tone: "good" },
  expired: { label: "Expired", tone: "neutral" },
  revoked: { label: "Ended", tone: "neutral" },
};
const TASK_WORDS: Record<string, { label: string; tone: "good" | "warning" | "neutral" | "brand" }> = {
  running: { label: "Working", tone: "brand" },
  waitingApproval: { label: "Waiting for approval", tone: "warning" },
  done: { label: "Finished", tone: "good" },
  stopped: { label: "Stopped", tone: "neutral" },
};
const KIND_WORDS: Record<string, { label: string; tone: "good" | "brand" | "critical" }> = {
  read: { label: "Read only", tone: "good" },
  change: { label: "Changes something", tone: "brand" },
  restricted: { label: "Restricted", tone: "critical" },
};
const STATUS_WORDS: Record<string, string> = { proposed: "Waiting for a decision", done: "Done", declined: "Declined", blocked: "Blocked", expired: "Not approved in time" };
const VERB_WORDS: Record<string, string> = { open: "Open", read: "Read", click: "Click", type: "Type into", select: "Choose in", upload: "Upload to" };
const MODE_WORDS: Record<string, { label: string; tone: "good" | "neutral" | "critical" | "warning" | "brand" }> = {
  api: { label: "Official API instead", tone: "good" },
  never: { label: "Not automated", tone: "critical" },
  browser: { label: "Browser, not available yet", tone: "neutral" },
  demo: { label: "Practice site", tone: "brand" },
};

function useBusy() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const run = (work: () => Promise<void>) => {
    setBusy(true);
    setProblem("");
    void work().then(
      () => setBusy(false),
      (error: unknown) => {
        setBusy(false);
        setProblem(showError(error, "That did not work."));
      },
    );
  };
  return { busy, problem, run };
}

function Heading({ icon: Icon, children }: { icon: typeof Lock; children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-heading text-base text-foreground">
      <Icon aria-hidden className="size-4 text-primary" />
      {children}
    </h2>
  );
}

/** The step a task is waiting on: what will be clicked or typed, where, and why, with nothing done until someone says so. */
function ApprovalCard({ step, actions }: { step: TrailStep; actions: BrowserActions }) {
  const [word, setWord] = useState("");
  const { busy, problem, run } = useBusy();
  const restricted = step.restricted;
  const ready = !restricted || word.trim() === restricted.confirm;
  return (
    <div className={cn("grid gap-3 rounded-xl border-2 p-3 sm:p-4", restricted ? "border-destructive/60" : "border-primary/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <Hand aria-hidden className={cn("size-4", restricted ? "text-destructive" : "text-primary")} />
        <p className="font-heading text-sm text-card-foreground">{restricted ? "This step needs a separate approval from an Owner" : "Approve this step?"}</p>
        <StatusBadge label={KIND_WORDS[step.kind].label} tone={KIND_WORDS[step.kind].tone} className="[&_span]:normal-case" />
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <dl className="grid content-start gap-2 text-sm">
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">What</dt>
            <dd className="text-card-foreground">
              {VERB_WORDS[step.verb] ?? step.verb} {step.target}
            </dd>
          </div>
          {step.value ? (
            <div>
              <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{step.verb === "select" ? "Choosing" : "Typing"}</dt>
              <dd className="rounded-md bg-muted/60 px-2 py-1 break-words text-card-foreground">{step.value}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Where</dt>
            <dd className="break-all text-muted-foreground">{step.url}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Why</dt>
            <dd className="text-card-foreground">{step.why}</dd>
          </div>
        </dl>
        {step.screenshot ? (
          // A stored picture of the step. Drawn in the dry run; a real screenshot with a real driver.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={step.screenshot} alt={`The page before this step: ${step.target} is outlined`} className="h-auto w-full rounded-lg border border-border" />
        ) : (
          <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">Picture loading…</div>
        )}
      </div>
      {restricted ? (
        <p className="flex items-start gap-2 text-sm text-card-foreground">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>
            {restricted.words} Agents never do this as part of a task. {step.canDecide ? `To allow it this once, type ${restricted.confirm}.` : "Only an Owner can allow it."}
          </span>
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Approving covers this one step. The next change will ask again.</p>
      )}
      {step.canDecide ? (
        <div className="flex flex-wrap items-center gap-2">
          {restricted ? <Input aria-label={`Type ${restricted.confirm} to approve`} className="w-36" value={word} placeholder={restricted.confirm} autoComplete="off" onChange={(event) => setWord(event.target.value)} /> : null}
          <Button type="button" size="sm" variant={restricted ? "destructive" : "primary"} disabled={busy || !ready} onClick={() => run(() => actions.decide(step.id, true, restricted ? word.trim() : undefined))}>
            <Check aria-hidden className="size-4" /> {restricted ? "Approve this once" : "Approve this step"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => actions.decide(step.id, false))}>
            <X aria-hidden className="size-4" /> Decline and stop
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="outline" className="w-fit" disabled={busy} onClick={() => run(() => actions.decide(step.id, false))}>
          <X aria-hidden className="size-4" /> Decline and stop
        </Button>
      )}
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
    </div>
  );
}

/** Every step of a task in order: what it did, where, who decided, and its picture. */
function Trail({ trail, actions }: { trail: BrowserTrail; actions: BrowserActions }) {
  const waiting = trail.steps.find((step) => step.status === "proposed");
  const { busy, run } = useBusy();
  const open = trail.task.status === "running" || trail.task.status === "waitingApproval";
  return (
    <Panel className="grid min-w-0 gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 className="font-heading text-base break-words text-card-foreground">{trail.task.goal}</h3>
          <p className="text-xs text-muted-foreground">
            {trail.siteName} · started {shortDate(trail.task.createdAt)} · {trail.task.steps} {trail.task.steps === 1 ? "step" : "steps"}
          </p>
        </div>
        <span className="flex items-center gap-2">
          <StatusBadge label={TASK_WORDS[trail.task.status].label} tone={TASK_WORDS[trail.task.status].tone} className="[&_span]:normal-case" />
          {open ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => actions.stop(trail.task.id))}>
              Stop
            </Button>
          ) : null}
        </span>
      </div>
      {trail.task.stopWords ? <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-card-foreground">{trail.task.stopWords}</p> : null}
      {waiting ? <ApprovalCard key={waiting.id} step={waiting} actions={actions} /> : null}
      <div className="grid gap-2">
        <p className="text-sm font-medium text-card-foreground">Audit trail</p>
        <ol className="grid gap-2">
          {trail.steps.map((step) => (
            <li key={step.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-xl border border-border p-2 sm:grid-cols-[7rem_minmax(0,1fr)] sm:p-3">
              {step.screenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={step.screenshot} alt="" className="h-auto w-full rounded-md border border-border" />
              ) : (
                <div className="aspect-[8/5] rounded-md border border-dashed border-border" />
              )}
              <div className="grid min-w-0 content-start gap-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground tabular-nums">{step.index + 1}.</span>
                  {step.kind === "read" ? <Eye aria-hidden className="size-3.5 text-success" /> : step.kind === "restricted" ? <Lock aria-hidden className="size-3.5 text-destructive" /> : <MousePointerClick aria-hidden className="size-3.5 text-primary" />}
                  <span className="min-w-0 text-sm break-words text-card-foreground">
                    {VERB_WORDS[step.verb] ?? step.verb} {step.target}
                  </span>
                </div>
                {step.value ? <p className="text-xs break-words text-muted-foreground">&ldquo;{step.value}&rdquo;</p> : null}
                <p className="text-xs break-all text-muted-foreground">{step.url}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_WORDS[step.kind].label}
                  {step.restricted ? ` (${step.restricted.reason})` : ""} · {STATUS_WORDS[step.status] ?? step.status}
                  {step.decidedBy ? ` by ${step.decidedBy}` : step.kind === "read" && step.status === "done" ? ", no approval needed" : ""}
                  {step.decidedAt ? ` · ${new Date(step.decidedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
                </p>
                {step.blocked ? <p className="text-xs text-destructive">{step.blocked}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}

/** Browser access, drawn from data so the screen and its story are the same component. */
export function BrowserAccessView({ overview, trail, onOpenTask, actions }: BrowserAccessProps) {
  const owner = overview.role === "owner";
  const editor = overview.role !== "rep";
  const [goal, setGoal] = useState(overview.goals[0]?.key ?? "");
  const { busy, problem, run } = useBusy();
  const live = overview.sessions.filter((session) => session.state === "active" || session.state === "pendingSignIn");
  const past = overview.sessions.filter((session) => session.state === "expired" || session.state === "revoked");
  const demo = overview.sites.find((site) => site.mode === "demo");
  return (
    <div className="grid min-w-0 gap-5">
      <Panel className="grid gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck aria-hidden className="size-5 text-primary" />
          <h1 className="font-heading text-lg text-card-foreground">Browser access</h1>
          <StatusBadge label="Dry run only" tone="warning" className="[&_span]:normal-case" />
        </div>
        <p className="text-sm text-muted-foreground">
          How an agent would act inside one of your own accounts: you sign in yourself, every change is shown to you first, and every step is recorded. This is a practice version. No real account is opened and nothing is changed anywhere.
        </p>
        <ul className="grid gap-1.5 text-sm text-card-foreground sm:grid-cols-2">
          <li className="flex items-start gap-2">
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> You sign in yourself. Vistrial never sees or stores your password.
          </li>
          <li className="flex items-start gap-2">
            <Hand aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> Before anything changes, you see what will be clicked or typed and where. Nothing happens until you approve that one step.
          </li>
          <li className="flex items-start gap-2">
            <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> Steps that only look are logged, each with a picture.
          </li>
          <li className="flex items-start gap-2">
            <Unplug aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" /> A session ends after {overview.rules.sessionDays} days, or the moment an Owner ends it here.
          </li>
        </ul>
      </Panel>

      <section className="grid gap-3" aria-label="Sessions">
        <Heading icon={Plug}>Sessions</Heading>
        {live.length === 0 ? (
          <Panel className="grid gap-2 p-4 text-sm">
            <p className="text-card-foreground">No session is open.</p>
            <p className="text-muted-foreground">{demo ? demo.note : ""}</p>
            {owner && demo ? (
              <Button type="button" className="w-fit" disabled={busy} onClick={() => run(() => actions.connect(demo.key))}>
                <Plug aria-hidden className="size-4" /> Try it on the practice site
              </Button>
            ) : (
              <p className="text-muted-foreground">Only an Owner can start a session.</p>
            )}
          </Panel>
        ) : null}
        {live.map((session) => (
          <Panel key={session.id} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="grid min-w-0 gap-0.5">
                <p className="text-sm break-words text-card-foreground">{session.siteName}</p>
                <p className="text-xs text-muted-foreground">
                  {session.state === "active" && session.expiresAt ? `Signed in ${shortDate(session.signedInAt ?? session.createdAt)}. Ends ${shortDate(session.expiresAt)}.` : `Started ${shortDate(session.createdAt)}.`}
                </p>
              </div>
              <span className="flex flex-wrap items-center gap-2">
                <StatusBadge label={SESSION_WORDS[session.state].label} tone={SESSION_WORDS[session.state].tone} className="[&_span]:normal-case" />
                {owner ? (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => actions.revoke(session.id))}>
                    <Unplug aria-hidden className="size-4" /> End session
                  </Button>
                ) : null}
              </span>
            </div>
            {session.state === "pendingSignIn" ? (
              <div className="grid gap-2 rounded-xl border border-dashed border-border p-3">
                <p className="text-sm text-card-foreground">Sign in yourself</p>
                <p className="text-sm text-muted-foreground">
                  With a real site, a browser window hosted by the browser provider opens here and you type your user name and password into the site itself. Vistrial is not in that conversation and receives only &ldquo;signed in&rdquo;. The practice site has no login, so the button below stands in for it.
                </p>
                {owner ? (
                  <Button type="button" size="sm" className="w-fit" disabled={busy} onClick={() => run(() => actions.completeSignIn(session.id))}>
                    <Check aria-hidden className="size-4" /> I have signed in
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Waiting for an Owner to sign in.</p>
                )}
              </div>
            ) : null}
            {session.state === "active" && editor ? (
              <div className="grid gap-2">
                <label className="grid gap-1 text-sm text-card-foreground">
                  A practice task
                  <select value={goal} onChange={(event) => setGoal(event.target.value)} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-card-foreground">
                    {overview.goals.map((row) => (
                      <option key={row.key} value={row.key}>
                        {row.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-xs text-muted-foreground">{overview.goals.find((row) => row.key === goal)?.summary}</p>
                <Button type="button" size="sm" className="w-fit" disabled={busy || !goal} onClick={() => run(() => actions.startTask(session.id, goal))}>
                  Start the task
                </Button>
              </div>
            ) : null}
          </Panel>
        ))}
        {past.length > 0 ? (
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {past.map((session) => (
              <li key={session.id}>
                {session.siteName}: {session.state === "revoked" ? `ended ${shortDate(session.revokedAt ?? session.createdAt)}` : `expired ${shortDate(session.expiresAt ?? session.createdAt)}`}
              </li>
            ))}
          </ul>
        ) : null}
        {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
      </section>

      {overview.tasks.length > 0 ? (
        <section className="grid gap-3" aria-label="Tasks">
          <Heading icon={MousePointerClick}>Tasks</Heading>
          <ul className="grid gap-2 sm:grid-cols-2">
            {overview.tasks.map((task) => (
              <li key={task.id}>
                <button
                  type="button"
                  disabled={!editor}
                  onClick={() => onOpenTask(task.id)}
                  aria-current={trail?.task.id === task.id}
                  className={cn("grid w-full gap-1 rounded-xl border px-3 py-2 text-left transition-colors", trail?.task.id === task.id ? "border-primary bg-primary/5" : "border-border", editor && "hover:border-primary/50")}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-sm break-words text-card-foreground">{task.goal}</span>
                    <StatusBadge label={TASK_WORDS[task.status].label} tone={TASK_WORDS[task.status].tone} className="[&_span]:normal-case" />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {shortDate(task.createdAt)} · {task.steps} {task.steps === 1 ? "step" : "steps"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!editor ? <p className="text-xs text-muted-foreground">The audit trail is for Owners and Managers: it can show what was typed into an account.</p> : null}
        </section>
      ) : null}

      {trail ? <Trail trail={trail} actions={actions} /> : null}

      <section className="grid gap-3" aria-label="Rules">
        <Heading icon={Lock}>What an agent never does on its own</Heading>
        <Panel className="grid gap-3 p-4 text-sm">
          <p className="text-muted-foreground">Each of these needs a separate approval from an Owner, every time, by typing the word shown. They are never part of a task&apos;s ordinary steps.</p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {overview.rules.restricted.map((row) => (
              <li key={row.key} className="flex items-start gap-2 text-card-foreground">
                <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span>
                  {row.words} <span className="text-xs text-muted-foreground">Word: {row.confirm}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">And these are blocked outright. No approval unlocks them:</p>
          <ul className="grid list-disc gap-1 pl-5 text-card-foreground">
            <li>Typing into a password, card or verification code field.</li>
            <li>Leaving the site the session was approved for.</li>
            <li>Opening an address that is not a secure web address.</li>
          </ul>
          <p className="text-xs text-muted-foreground">A step nobody decides within {overview.rules.approvalHours} hours is dropped and its task stops. Silence approves nothing.</p>
        </Panel>
      </section>

      <section className="grid gap-3" aria-label="Sites">
        <Heading icon={Info}>Where a browser is and is not used</Heading>
        <p className="text-sm text-muted-foreground">Where a site has an official API, Vistrial uses that and no browser. Where a site&apos;s terms forbid automated access, Vistrial does not do it, even with your sign-in.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {overview.sites.map((site) => (
            <li key={site.key} className="grid content-start gap-1 rounded-xl border border-border px-3 py-2">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-card-foreground">{site.name}</span>
                <StatusBadge label={MODE_WORDS[site.mode].label} tone={MODE_WORDS[site.mode].tone} className="[&_span]:normal-case" />
              </span>
              <span className="text-xs text-muted-foreground">{site.note}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Browser access with live data. */
export function BrowserAccess({ workspaceId }: { workspaceId: Id<"workspaces"> }) {
  const overview = useQuery(api.browserAccess.overview, { workspaceId });
  const [open, setOpen] = useState<string | null>(null);
  const editor = overview ? overview.role !== "rep" : false;
  const waiting = overview?.tasks.find((task) => task.status === "waitingApproval");
  const browserTaskId = (open ?? waiting?.id ?? overview?.tasks[0]?.id ?? null) as Id<"browserTasks"> | null;
  const trail = useQuery(api.browserAccess.trail, editor && browserTaskId ? { workspaceId, browserTaskId } : "skip");
  const connect = useMutation(api.browserAccess.connect);
  const completeSignIn = useMutation(api.browserAccess.completeSignIn);
  const revoke = useMutation(api.browserAccess.revoke);
  const startTask = useMutation(api.browserAccess.startTask);
  const decide = useMutation(api.browserAccess.decide);
  const stop = useMutation(api.browserAccess.stop);
  if (!overview) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const actions: BrowserActions = {
    connect: async (site) => {
      await connect({ workspaceId, site });
    },
    completeSignIn: async (sessionId) => {
      await completeSignIn({ workspaceId, sessionId: sessionId as Id<"browserSessions"> });
    },
    revoke: async (sessionId) => {
      await revoke({ workspaceId, sessionId: sessionId as Id<"browserSessions"> });
    },
    startTask: async (sessionId, goalKey) => {
      setOpen(await startTask({ workspaceId, sessionId: sessionId as Id<"browserSessions">, goalKey }));
    },
    decide: async (stepId, approve, confirmWord) => {
      await decide({ workspaceId, stepId: stepId as Id<"browserSteps">, approve, ...(confirmWord ? { confirmWord } : {}) });
    },
    stop: async (id) => {
      await stop({ workspaceId, browserTaskId: id as Id<"browserTasks"> });
    },
  };
  return <BrowserAccessView overview={overview} trail={trail ?? null} onOpenTask={setOpen} actions={actions} />;
}
