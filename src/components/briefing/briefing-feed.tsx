"use client";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { BellRing, Check, CheckCircle2, ExternalLink, FileSearch, Newspaper, ShieldCheck, TrendingUp, type LucideIcon } from "@/components/icons";
import { useClientScope, useWorkspaceShell } from "@/components/shell/shell-context";
import { Detail, LongText, ModelMark, StatusChip } from "@/components/readable";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { creditWords } from "@/lib/credits";
import { showError } from "@/lib/errors/show-error";
import { splitPost } from "@/lib/readable/post";
import { selectClass } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type Feed = FunctionReturnType<typeof api.briefing.feed>;
export type Post = Feed["items"][number];
export type Kind = Post["kind"];

const KINDS: { kind: Kind; label: string; icon: LucideIcon; tone: string }[] = [
  { kind: "approval", label: "Approvals", icon: ShieldCheck, tone: "bg-warning/15 text-warning" },
  { kind: "draft", label: "Drafts", icon: FileSearch, tone: "bg-warning/15 text-warning" },
  { kind: "weeklyReport", label: "Weekly report", icon: Newspaper, tone: "bg-primary/12 text-primary" },
  { kind: "finished", label: "Finished", icon: CheckCircle2, tone: "bg-success/15 text-success" },
  { kind: "alert", label: "Alerts", icon: BellRing, tone: "bg-destructive/12 text-destructive" },
  { kind: "trend", label: "Trends", icon: TrendingUp, tone: "bg-overlay/[0.06] text-muted-foreground" },
];
const KIND = Object.fromEntries(KINDS.map((row) => [row.kind, row])) as Record<Kind, (typeof KINDS)[number]>;

function when(at: number, now: number) {
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export type Decide = (approvalId: string, approve: boolean, extra: { reason?: string; confirmWord?: string }) => Promise<unknown>;

const DECIDED: Record<string, { label: string; tone: "good" | "neutral" | "warning" }> = {
  approved: { label: "Approved", tone: "good" },
  declined: { label: "Declined", tone: "neutral" },
  expired: { label: "Expired: nobody decided in time", tone: "warning" },
};

/** One decision about one thing, made where it is read. Declining a draft asks why; an Owner-only step asks for its word. */
export function ApprovalBlock({ approval, needsReview = false, decide }: { approval: NonNullable<Post["approval"]>; needsReview?: boolean; decide: Decide }) {
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  if (approval.status !== "waiting") {
    const decided = DECIDED[approval.status];
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <StatusBadge label={decided.label} tone={decided.tone} className="[&_span]:normal-case" />
        {approval.decidedAt ? <span>{new Date(approval.decidedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}
      </div>
    );
  }
  const run = (approve: boolean) => {
    setBusy(true);
    setNotice("");
    void decide(approval.id, approve, { ...(reason.trim() ? { reason } : {}), ...(word.trim() ? { confirmWord: word } : {}) })
      .catch((problem: unknown) => setNotice(showError(problem)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="grid gap-2 rounded-lg border border-warning/30 bg-warning/[0.06] p-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-card-foreground">Needs approval: {approval.kindLabel.toLowerCase()}</span>
        {approval.credits ? <span>Up to {creditWords(approval.credits)}</span> : null}
        {approval.ownerOnly ? <span>Owner only</span> : null}
      </p>
      {needsReview ? <p className="text-xs text-muted-foreground">This draft did not pass its checks. Open it to edit it, or decline it.</p> : null}
      {approval.canDecide ? (
        <>
          {approval.confirm ? (
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>
                {approval.confirm.why} Type <span className="font-medium text-card-foreground">{approval.confirm.word}</span> to approve.
              </span>
              <Input value={word} onChange={(event) => setWord(event.target.value)} aria-label={`Type ${approval.confirm.word}`} className="max-w-48" />
            </label>
          ) : null}
          {declining ? (
            <label className="grid gap-1 text-xs text-muted-foreground">
              <span>{approval.needsReason ? "Say why, in a few words. It is saved as feedback on the draft." : "Why (optional)"}</span>
              <Input autoFocus value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
            </label>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {declining ? (
              <>
                <Button size="sm" variant="outline" disabled={busy || (approval.needsReason && reason.trim().length < 3)} onClick={() => run(false)}>
                  Decline
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeclining(false)}>
                  Back
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="primary" disabled={busy || needsReview || (approval.confirm !== null && word.trim() !== approval.confirm.word)} onClick={() => run(true)}>
                  <Check aria-hidden /> Approve
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setDeclining(true)}>
                  Decline
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">{approval.ownerOnly ? "Only an Owner can decide this one." : "An Owner or Admin decides this."}</p>
      )}
      {notice ? <p className="text-xs text-destructive">{notice}</p> : null}
    </div>
  );
}

/**
 * A post's body at small size. A body written as a summary and titled lists (the weekly growth report) shows
 * the summary, then each list as its title and a count with its lines one step away; "Proposed for next week",
 * the part that says what to do, starts open. Any other body is shown as it is and folds when it is long.
 */
function PostBody({ body }: { body: string }) {
  const parts = splitPost(body);
  if (parts.sections.length === 0) return <LongText text={body} className="text-sm leading-relaxed text-muted-foreground" />;
  return (
    <div className="grid gap-2">
      {parts.lead.map((text) => (
        <p key={text} className="text-sm leading-relaxed break-words text-card-foreground">
          {text}
        </p>
      ))}
      <ul className="grid gap-1.5">
        {parts.sections.map((section) => (
          <li key={section.title} className="rounded-lg border border-border px-3 py-2">
            {section.items.length === 0 ? (
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="text-card-foreground">{section.title}</span>
                <span className="text-xs text-muted-foreground">{section.note}</span>
              </p>
            ) : (
              <Detail summary={<span className="text-card-foreground">{section.title}</span>} aside={<span className="tabular-nums">{section.items.length}</span>} defaultOpen={/^proposed/i.test(section.title)}>
                <ul className="grid list-disc gap-1 pl-5 text-sm leading-relaxed text-muted-foreground">
                  {section.items.map((item) => (
                    <li key={item} className="break-words">
                      {item}
                    </li>
                  ))}
                </ul>
              </Detail>
            )}
          </li>
        ))}
      </ul>
      {parts.tail.map((text) => (
        <p key={text} className="text-xs leading-relaxed break-words text-muted-foreground">
          {text}
        </p>
      ))}
    </div>
  );
}

function PostCard({ post, now, agentName, decide }: { post: Post; now: number; agentName: (slug: string) => string; decide: Decide }) {
  const kind = KIND[post.kind];
  const waiting = post.approval?.status === "waiting";
  return (
    <li className="flex min-w-0 gap-3 rounded-xl border border-border bg-card p-4">
      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", kind.tone)}>
        <kind.icon aria-hidden className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-card-foreground">{post.kindLabel}</span>
          {post.agentSlug ? (
            <span className="inline-flex items-center gap-1.5">
              <AgentAvatar slug={post.agentSlug} size="xs" className="size-5" />
              {agentName(post.agentSlug)}
            </span>
          ) : null}
          {post.client ? <span className="rounded-md border border-primary/30 px-1.5 text-primary">{post.client}</span> : null}
          <span>{when(post.at, now)}</span>
          {post.unread ? <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-medium text-primary-foreground">New</span> : null}
          {waiting ? <StatusChip tone="partly" label={post.approval?.canDecide ? "Needs your decision" : "Waiting for a decision"} /> : null}
          <ModelMark />
        </p>
        <h2 className="text-sm font-medium break-words text-card-foreground">{post.title}</h2>
        {post.body ? <PostBody body={post.body} /> : null}
        {post.draft?.text ? (
          <blockquote className="grid gap-1 border-l-2 border-border pl-3">
            <p className="text-[11px] tracking-wide text-muted-foreground uppercase">The draft, version {post.draft.version}</p>
            <LongText text={post.draft.text} lines={3} more="Read the rest of this preview" className="text-sm leading-relaxed text-card-foreground" />
          </blockquote>
        ) : null}
        {post.sources.length > 0 ? (
          <ul className="grid gap-1 text-xs">
            {post.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noreferrer noopener nofollow" className="break-words text-primary underline-offset-2 hover:underline">
                  {source.title} <ExternalLink aria-hidden className="inline size-3" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
        {post.approval ? <ApprovalBlock approval={post.approval} needsReview={post.draft?.needsReview} decide={decide} /> : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {post.href ? (
            <Link href={post.href} className="font-medium text-primary underline-offset-2 hover:underline">
              {post.kind === "draft" ? "Read the full draft and its sources" : post.kind === "weeklyReport" ? "Open Tasks" : "Open"}
            </Link>
          ) : null}
          {post.credits && !post.approval ? <span>Used {creditWords(post.credits)}</span> : null}
        </p>
      </div>
    </li>
  );
}

/** The feed's answer, counted from the posts shown: how many wait for a decision (and whether it is yours), and how many are new. */
function FeedGlance({ items }: { items: Post[] }) {
  const waiting = items.filter((post) => post.approval?.status === "waiting");
  const mine = waiting.filter((post) => post.approval?.canDecide).length;
  const fresh = items.filter((post) => post.unread).length;
  if (waiting.length === 0 && fresh === 0) return null;
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <span>Of the {items.length} shown:</span>
      {mine > 0 ? <StatusChip tone="partly" label={`${mine} ${mine === 1 ? "needs" : "need"} your decision`} /> : null}
      {waiting.length - mine > 0 ? <StatusChip tone="quiet" label={`${waiting.length - mine} waiting for an Owner or Admin`} /> : null}
      {fresh > 0 ? <StatusChip tone="quiet" label={`${fresh} new`} /> : null}
    </li>
  );
}

/**
 * The Briefing: a feed of what needs a decision, what finished, what changed and what to read, newest
 * first. Approvals and drafts are decided in place. Filters narrow it to one kind or one agent.
 */
export function BriefingView({
  feed,
  kind,
  agent,
  onKind,
  onAgent,
  agentName,
  decide,
  now,
  trendsOn,
}: {
  feed: Feed | undefined;
  kind: Kind | null;
  agent: string | null;
  onKind: (kind: Kind | null) => void;
  onAgent: (agent: string | null) => void;
  agentName: (slug: string) => string;
  decide: Decide;
  now: number;
  /** Whether industry trend posts are switched on here. Null while it is not known. */
  trendsOn: boolean | null;
}) {
  const chip = (active: boolean) =>
    cn("flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", active ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground");
  return (
    <div className="mx-auto grid w-full max-w-3xl min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <PageHeader eyebrow="Briefing" title="Briefing" description="What needs your decision, what your agents finished, what changed, and your weekly growth report. Approve where you read." />
      <div className="grid gap-2">
        <div role="group" aria-label="Show" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <button type="button" aria-pressed={kind === null} onClick={() => onKind(null)} className={chip(kind === null)}>
            All <span className="tabular-nums">{feed?.total ?? 0}</span>
          </button>
          {KINDS.map((row) => (
            <button key={row.kind} type="button" aria-pressed={kind === row.kind} onClick={() => onKind(kind === row.kind ? null : row.kind)} className={chip(kind === row.kind)}>
              {row.label} <span className="tabular-nums">{feed?.counts[row.kind] ?? 0}</span>
            </button>
          ))}
        </div>
        {feed && feed.agents.length > 1 ? (
          <label className="flex w-fit items-center gap-2 text-sm text-muted-foreground">
            Agent
            <select value={agent ?? ""} onChange={(event) => onAgent(event.target.value || null)} className={cn(selectClass, "w-auto")}>
              <option value="">All agents</option>
              {feed.agents.map((slug) => (
                <option key={slug} value={slug}>
                  {agentName(slug)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {feed === undefined ? (
        <p className="text-sm text-muted-foreground">Loading the Briefing.</p>
      ) : feed.items.length === 0 ? (
        kind === "trend" && trendsOn === false ? (
          <EmptyState
            preview="rows"
            title="Industry trend posts are switched off."
            detail="When they are on, Vistrial searches the web once a month for changes in your industry and posts what was reported here, with its sources linked. They use credits, up to a cap shown in Settings. An Owner or Admin switches them on in Settings, Agents."
            action={
              <Link href="/app/settings?section=agents" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
                Open Settings
              </Link>
            }
          />
        ) : (
          <EmptyState preview="rows" title={kind || agent ? "Nothing of this kind yet." : "Nothing here yet."} detail="Posts appear when an agent finishes something, when a draft or an approval is waiting, when something changes, and with each weekly growth report." />
        )
      ) : (
        <ul className="grid gap-3">
          <FeedGlance items={feed.items} />
          {feed.items.map((post) => (
            <PostCard key={post.id} post={post} now={now} agentName={agentName} decide={decide} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** The Briefing fed by Convex, filtered by the client picker. Leaving the page marks it read. */
export function Briefing() {
  const shell = useWorkspaceShell();
  const { scope } = useClientScope();
  const workspaceId = shell?.workspaceId;
  const [kind, setKind] = useState<Kind | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const feed = useQuery(api.briefing.feed, workspaceId ? { workspaceId, scope, ...(kind ? { kind } : {}), ...(agent ? { agentSlug: agent } : {}) } : "skip");
  const settings = useQuery(api.approvals.settings, workspaceId ? { workspaceId } : "skip");
  const decide = useMutation(api.approvals.decide);
  const markSeen = useMutation(api.briefing.markSeen);
  // "New" stays on the posts while they are being read; the mark moves when the person leaves.
  const leave = useRef<() => void>(() => undefined);
  useEffect(() => {
    leave.current = () => {
      if (workspaceId) void markSeen({ workspaceId }).catch(() => undefined);
    };
  }, [workspaceId, markSeen]);
  useEffect(() => () => leave.current(), []);
  if (!shell || !workspaceId) return null;
  return (
    <BriefingView
      feed={feed}
      kind={kind}
      agent={agent}
      onKind={setKind}
      onAgent={setAgent}
      now={now}
      trendsOn={settings ? settings.trendPosts : null}
      agentName={(slug) => shell.agents.find((row) => row.slug === slug)?.name ?? "An agent"}
      decide={(approvalId, approve, extra) => decide({ workspaceId, approvalId: approvalId as Id<"approvals">, approve, ...extra })}
    />
  );
}
