"use client";

import Link from "next/link";

import { ArrowRight, FileSearch, FileText, Gauge, Hourglass, MessageCircleQuestion, MessagesSquare, Rocket, Sparkles, Store, type LucideIcon } from "@/components/icons";
import { AssetStatusBadge } from "@/components/runs/run-parts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { SectionTitle } from "@/components/work/work-shell";
import type { TabData } from "@/components/work/types";
import { shortDate } from "@/lib/research/words";
import type { RailSkill } from "@/lib/shell/rail";
import { cn } from "@/lib/utils";
import { SKILL_TAB, type WorkTab } from "../../../convex/lib/workTabs";
import { workLabel } from "../../../convex/lib/workWords";

const TAB_LOOK: Record<WorkTab, { label: string; icon: LucideIcon }> = {
  research: { label: "Research", icon: FileSearch },
  offers: { label: "Offers", icon: Store },
  diagnostics: { label: "Diagnostics", icon: Gauge },
};

export type OverviewWaiting = { id: string; kind: "review" | "answer" | "plan"; title: string; detail: string; href: string };
export type OverviewResult = { id: string; title: string; status: TabData["results"][number]["status"]; createdAt: number; tab: WorkTab; href: string };
export type OverviewChat = { id: string; title: string; status: string };

export type AgentOverviewData = {
  running: number;
  waiting: OverviewWaiting[];
  results: OverviewResult[];
};

/** Where a result opens: in its own tab. */
export function resultHref(base: string, tab: WorkTab, row: { id: string; projectId: string | null }) {
  if (tab === "offers") return `${base}/work/offers?analysis=${row.id}`;
  return row.projectId ? `${base}/work/${tab}/${row.projectId}` : `/app/assets/${row.id}`;
}

/**
 * The agent's home, built from what each work tab already reads: what is running, what waits on a person
 * (answers first, then plans ready to start, then drafts to review) and the newest results across tabs.
 */
export function overviewFrom(base: string, tabs: TabData[], chats: OverviewChat[] = []): AgentOverviewData {
  const waiting: OverviewWaiting[] = [];
  const results: OverviewResult[] = [];
  let running = 0;
  for (const data of tabs) {
    const tab = SKILL_TAB[data.skillSlug];
    for (const run of data.running) {
      if (run.status === "waiting" || run.status === "needsInput") {
        waiting.push({
          id: `run-${run.id}`,
          kind: "answer",
          title: run.question ?? "It has a question for you",
          detail: `${TAB_LOOK[tab].label} · it is paused until you answer`,
          href: run.projectId && tab !== "offers" ? `${base}/work/${tab}/${run.projectId}` : `/app/runs/${run.id}`,
        });
      } else running += 1;
    }
    for (const row of data.results) results.push({ id: row.id, title: row.title, status: row.status, createdAt: row.createdAt, tab, href: resultHref(base, tab, row) });
  }
  for (const chat of chats) {
    if (chat.status === "ready") waiting.push({ id: `chat-${chat.id}`, kind: "plan", title: chat.title, detail: "Chat · the plan is ready. Nothing runs until you press Start", href: `${base}/work/chat?c=${chat.id}` });
  }
  for (const row of results) {
    if (row.status === "draft" || row.status === "needsReview") waiting.push({ id: `asset-${row.tab}-${row.id}`, kind: "review", title: row.title, detail: `${TAB_LOOK[row.tab].label} · ${row.status === "needsReview" ? "needs a closer look before you approve" : "ready for you to review"}`, href: row.href });
  }
  results.sort((a, b) => b.createdAt - a.createdAt);
  return { running, waiting, results: results.slice(0, 6) };
}

const WAITING_ICON: Record<OverviewWaiting["kind"], LucideIcon> = { answer: MessageCircleQuestion, plan: Rocket, review: FileText };

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warning" | "primary" }) {
  return (
    <div className="grid rounded-xl border border-border bg-card px-3 py-2">
      <span className={cn("font-heading text-xl tabular-nums", tone === "warning" && value ? "text-warning" : tone === "primary" && value ? "text-primary" : "text-card-foreground")}>{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

/**
 * The agent's home: its status, what is waiting on a person, recent results across its tabs, and its
 * skills. No chat box here: every "ask" opens the Chat tab.
 */
export function AgentOverviewView({
  base,
  promise,
  stateLabel,
  on,
  editor,
  data,
  skills,
}: {
  base: string;
  promise: string;
  stateLabel: string;
  on: boolean;
  editor: boolean;
  data: AgentOverviewData | undefined;
  skills: RailSkill[];
}) {
  const waiting = data?.waiting ?? [];
  const results = data?.results ?? [];
  return (
    <div className="grid gap-5">
      <Panel className="relative grid gap-4 overflow-hidden p-4 sm:p-6">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="grid min-w-0 gap-1">
            <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Status <StatusBadge label={stateLabel} tone={on ? "good" : "neutral"} />
            </p>
            <p className="max-w-2xl text-sm text-card-foreground">{promise}</p>
          </div>
          {editor ? (
            <Button render={<Link href={`${base}/work/chat`} />}>
              <MessagesSquare aria-hidden className="size-4" /> Open chat
            </Button>
          ) : null}
        </div>
        <div className="relative grid grid-cols-3 gap-2 sm:max-w-md">
          <Stat label="Running now" value={data?.running ?? 0} tone="primary" />
          <Stat label="Waiting on you" value={waiting.length} tone="warning" />
          <Stat label="Recent results" value={results.length} />
        </div>
      </Panel>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <section className="grid content-start gap-3" aria-label="Waiting on you">
          <SectionTitle icon={Hourglass} aside={waiting.length ? <StatusBadge label={`${waiting.length} waiting`} tone="warning" className="[&_span]:normal-case" /> : null}>
            Waiting on you
          </SectionTitle>
          {data === undefined ? (
            <p className="text-sm text-muted-foreground">Loading.</p>
          ) : waiting.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Nothing is waiting on you. Questions, plans ready to start and drafts to review show here.</p>
          ) : (
            <ul className="grid gap-2">
              {waiting.map((row) => {
                const Icon = WAITING_ICON[row.kind];
                return (
                  <li key={row.id}>
                    <Link href={row.href} className="group flex items-start gap-3 rounded-xl border border-warning/30 bg-warning/[0.05] p-3 transition-colors hover:border-warning/60">
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="line-clamp-2 text-sm font-medium text-card-foreground">{row.title}</span>
                        <span className="text-xs text-muted-foreground">{row.detail}</span>
                      </span>
                      <ArrowRight aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="grid content-start gap-3" aria-label="Recent results">
          <SectionTitle icon={FileText}>Recent results</SectionTitle>
          {data === undefined ? (
            <p className="text-sm text-muted-foreground">Loading.</p>
          ) : results.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">Reports, offer analyses and diagnoses show here as they finish, newest first.</p>
          ) : (
            <ul className="grid gap-2">
              {results.map((row) => {
                const look = TAB_LOOK[row.tab];
                return (
                  <li key={`${row.tab}-${row.id}`}>
                    <Link href={row.href} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40">
                      <look.icon aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="truncate text-sm font-medium text-card-foreground">{row.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {look.label} · {shortDate(row.createdAt)}
                        </span>
                      </span>
                      <AssetStatusBadge status={row.status as "draft"} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {skills.length > 0 ? (
        <section className="grid gap-3" aria-label="What it does">
          <SectionTitle icon={Sparkles}>What it does</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => {
              const tab = skill.status === "available" ? SKILL_TAB[skill.slug] : undefined;
              const look = tab ? TAB_LOOK[tab] : null;
              return (
                <li key={skill.slug} className="grid content-start gap-2 rounded-xl border border-border bg-card p-4">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-card-foreground">{workLabel(skill.slug)}</span>
                    <StatusBadge label={skill.status === "available" ? "Available" : "Coming soon"} tone={skill.status === "available" ? "good" : "neutral"} className="[&_span]:normal-case" />
                  </span>
                  <span className="text-sm text-muted-foreground">{skill.handsBack}</span>
                  {tab && look ? (
                    <span className="mt-1 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" render={<Link href={`${base}/work/${tab}`} />}>
                        <look.icon aria-hidden className="size-4" /> Open {look.label}
                      </Button>
                      {editor ? (
                        <Button size="sm" variant="ghost" render={<Link href={`${base}/work/chat?skill=${skill.slug}`} />}>
                          <MessagesSquare aria-hidden className="size-4" /> Ask in chat
                        </Button>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
