"use client";

import { AgentAvatar } from "@/components/live/agent-avatar";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ApprovalBlock, type Decide } from "@/components/briefing/briefing-feed";
import { StartChat } from "@/components/chat/start-chat";
import { ArrowRight, Building2, CalendarIcon as CalendarClock, ShieldCheck, User, Users, type LucideIcon } from "@/components/icons";
import { OutcomeForm, RESULT_WORDS } from "@/components/research/outcome-loop";
import { useClientScope, useWorkspaceShell, type ScopeChoice } from "@/components/shell/shell-context";
import { showError } from "@/lib/errors/show-error";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export type Dashboard = FunctionReturnType<typeof api.home.dashboard>;
type Need = Dashboard["needs"][number];
type Result = keyof typeof RESULT_WORDS;

const section = "grid gap-3";
const heading = "flex items-baseline gap-2 font-heading text-base text-foreground";
const count = "rounded-full bg-overlay/[0.06] px-1.5 text-[11px] leading-5 font-normal text-muted-foreground tabular-nums";
const card = "rounded-xl border border-border bg-card";
const quiet = "rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground";

const day = (time: number) => new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const dayTime = (time: number) => new Date(time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function number(value: number, unit: string) {
  if (unit === "results" || unit === "calls") return value.toLocaleString("en-US");
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: unit, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${value.toLocaleString("en-US")} ${unit}`;
  }
}

function NeedRow({ need, data, agentName, decide, recordOutcome }: { need: Need; data: Dashboard; agentName: (slug: string) => string; decide: Decide; recordOutcome: (decisionId: string, result: Result, note: string) => Promise<unknown> }) {
  const [recording, setRecording] = useState(false);
  const Icon: LucideIcon = need.kind === "checkIn" ? CalendarClock : need.kind === "approval" ? ShieldCheck : User;
  const label = need.kind === "approval" ? "Approval" : need.kind === "question" ? "A question from an agent" : "Check-in";
  return (
    <li className={cn(card, "flex min-w-0 gap-3 p-4")}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="grid min-w-0 flex-1 gap-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="font-medium text-card-foreground">{label}</span>
          {need.agentSlug ? (
            <span className="inline-flex items-center gap-1.5">
              <AgentAvatar slug={need.agentSlug} size="xs" className="size-5" />
              {agentName(need.agentSlug)}
            </span>
          ) : null}
          {need.client ? <span className="rounded-md border border-primary/30 px-1.5 text-primary">{need.client}</span> : null}
          <span>{need.kind === "checkIn" ? `due ${day(need.at)}` : day(need.at)}</span>
        </p>
        <p className="text-sm font-medium break-words text-card-foreground">{need.title}</p>
        {need.kind !== "approval" && need.detail ? <p className="text-xs text-muted-foreground">{need.detail}</p> : null}
        {need.approval ? <ApprovalBlock approval={need.approval} decide={decide} /> : null}
        {need.kind === "checkIn" && recording && need.decisionId ? (
          <OutcomeForm onSubmit={(result, note) => recordOutcome(need.decisionId!, result, note).then(() => undefined, (problem: unknown) => void showError(problem, "That did not save."))} />
        ) : null}
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {need.kind === "checkIn" && data.canWork && !recording ? (
            <button type="button" onClick={() => setRecording(true)} className="font-medium text-primary underline-offset-2 hover:underline">
              Say what happened
            </button>
          ) : null}
          {need.href ? (
            <Link href={need.href} className={cn("underline-offset-2 hover:underline", need.kind === "question" ? "font-medium text-primary" : "text-muted-foreground")}>
              {need.kind === "question" ? (data.canWork ? "Answer it" : "Open the run") : need.kind === "checkIn" ? "Open where it came from" : "Open"}
            </Link>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function Since({ since }: { since: Dashboard["since"] }) {
  if (since.at === null) {
    return (
      <p className={quiet}>
        {since.figures > 0
          ? `Nothing to compare yet. Vistrial is reading ${since.figures} ${since.figures === 1 ? "number" : "numbers"} from your calendar, ad account and results files; the next time you come back, what changed shows here.`
          : "No numbers to compare yet. Connect a calendar or Meta ads, or upload a results file, and what changed between your visits shows here."}{" "}
        <Link href="/app/settings?section=data" className="text-primary underline-offset-2 hover:underline">
          Open Data in Settings
        </Link>
      </p>
    );
  }
  const also = [since.finished ? `${since.finished} finished` : "", since.outcomes ? `${since.outcomes} ${since.outcomes === 1 ? "result" : "results"} recorded` : "", since.alerts ? `${since.alerts} ${since.alerts === 1 ? "alert" : "alerts"}` : ""].filter(Boolean);
  return (
    <div className="grid gap-3">
      {since.changes.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {since.changes.map((change) => {
            // Spending more or less is not good or bad by itself, so spend carries no colour.
            const money = change.unit !== "results" && change.unit !== "calls";
            const spend = change.label.endsWith("spend");
            const up = change.after > change.before;
            return (
              <li key={`${change.client}-${change.label}`} className={cn(card, "grid gap-1 p-3")}>
                <span className="text-xs text-muted-foreground">
                  {change.label}
                  {change.client ? ` · ${change.client}` : ""}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-2 text-card-foreground">
                  <span className="text-lg font-semibold tabular-nums">{number(change.after, change.unit)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">was {number(change.before, change.unit)}</span>
                </span>
                {change.percent !== null ? (
                  <span className={cn("text-xs tabular-nums", spend ? "text-muted-foreground" : up ? "text-success" : "text-destructive")}>
                    {up ? "+" : ""}
                    {change.percent}%{money && !spend ? "" : ""}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={quiet}>{since.figures > 0 ? `None of the ${since.figures} numbers Vistrial reads has changed.` : "No numbers are connected yet, so nothing can have changed."}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Compared with {dayTime(since.at)}, from your calendar, ad account and results files as they read then and now.
        {also.length > 0 ? (
          <>
            {" "}
            Also since then: {also.join(", ")}.{" "}
            <Link href="/app/briefing" className="text-primary underline-offset-2 hover:underline">
              Open the Briefing
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Home: the chat box, then what needs you, what changed since you were last here, what agents are working
 * on, and each client with what needs you. Everything is for the open organization and the client picker's choice.
 */
export function HomeView({
  chat,
  data,
  agentName,
  decide,
  recordOutcome,
  onPickClient,
  picked,
}: {
  chat: React.ReactNode;
  data: Dashboard | undefined;
  agentName: (slug: string) => string;
  decide: Decide;
  recordOutcome: (decisionId: string, result: Result, note: string) => Promise<unknown>;
  onPickClient: (choice: ScopeChoice) => void;
  /** The client picker's choice, so the chosen client's card is marked. */
  picked: ScopeChoice;
}) {
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      {/* The chat box is the page's centre: it sits in the middle of the first screen, never against the top edge. */}
      <section aria-labelledby="home-heading" className="mx-auto grid w-full max-w-3xl content-center gap-5 py-10 sm:min-h-[46svh] sm:py-16">
        <h1 id="home-heading" className="text-center font-heading text-2xl text-balance text-foreground sm:text-3xl">
          What should Vistrial work on?
        </h1>
        {chat}
      </section>

      <section aria-labelledby="home-needs" className={section}>
        <h2 id="home-needs" className={heading}>
          {data && !data.canWork ? "Waiting on the team" : "Needs you"}
          {data ? <span className={count}>{data.needs.length}</span> : null}
        </h2>
        {data === undefined ? (
          <p className={quiet}>Loading.</p>
        ) : data.needs.length === 0 ? (
          <p className={quiet}>Nothing needs you right now. Approvals, agents&apos; questions and check-ins show here when they come.</p>
        ) : (
          <ul className="grid gap-2">
            {data.needs.map((need) => (
              <NeedRow key={need.key} need={need} data={data} agentName={agentName} decide={decide} recordOutcome={recordOutcome} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="home-since" className={section}>
        <h2 id="home-since" className={heading}>
          Since you were last here
        </h2>
        {data ? <Since since={data.since} /> : <p className={quiet}>Loading.</p>}
      </section>

      <section aria-labelledby="home-motion" className={section}>
        <h2 id="home-motion" className={heading}>
          In motion
          {data ? <span className={count}>{data.moving.length}</span> : null}
        </h2>
        {data === undefined ? (
          <p className={quiet}>Loading.</p>
        ) : data.moving.length === 0 ? (
          <p className={quiet}>No agent is working and nothing is being tried. Ask above, or approve a task on the <Link href="/app/tasks" className="text-primary underline-offset-2 hover:underline">Tasks board</Link>.</p>
        ) : (
          <ul className={cn(card, "divide-y divide-border")}>
            {data.moving.map((row) => (
              <li key={row.key}>
                <Link href={row.href} className="flex min-w-0 items-center gap-3 px-4 py-3 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                  {row.kind === "run" && row.agentSlug ? (
                    <AgentAvatar slug={row.agentSlug} size="xs" working />
                  ) : (
                    <span className={cn("size-2 shrink-0 rounded-full", row.kind === "run" ? "animate-pulse bg-primary motion-reduce:animate-none" : "bg-muted-foreground/50")} aria-hidden />
                  )}
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-sm text-card-foreground">{row.title}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.kind === "run" ? `${row.agentSlug ? agentName(row.agentSlug) : "An agent"} is working, since ${dayTime(row.since)}` : `Being tried. Check-in on ${row.until ? day(row.until) : "a date you set"}`}
                      {row.client ? ` · ${row.client}` : ""}
                    </span>
                  </span>
                  <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="home-clients" className={section}>
        <h2 id="home-clients" className={heading}>
          Clients
          {data ? <span className={count}>{data.clients.length}</span> : null}
        </h2>
        {data === undefined ? (
          <p className={quiet}>Loading.</p>
        ) : data.clients.length === 0 && !data.own ? (
          <p className={quiet}>No clients yet. <Link href="/app/clients" className="text-primary underline-offset-2 hover:underline">Add a client</Link> and its work shows here.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[...(data.own ? [{ id: "own" as const, name: `${data.organization} itself`, type: "own" as const, ...data.own }] : []), ...data.clients].map((client) => {
              const Icon = client.type === "own" ? Building2 : client.type === "person" ? User : Users;
              const chosen = picked === client.id;
              return (
                <li key={client.id}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() => onPickClient(chosen ? "all" : (client.id as ScopeChoice))}
                    className={cn(card, "flex w-full min-w-0 items-center gap-3 p-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring", chosen && "border-primary/50 bg-primary/[0.06]")}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-overlay/[0.06] text-muted-foreground">
                      <Icon aria-hidden className="size-4" />
                    </span>
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm text-card-foreground">{client.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {client.needs > 0 ? <span className="text-warning">{client.needs} {client.needs === 1 ? "needs" : "need"} you</span> : "Nothing needs you"}
                        {client.moving > 0 ? ` · ${client.moving} in motion` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.clients.length > 0 ? <p className="text-xs text-muted-foreground">Choose a client to show only its work everywhere. Choose it again to show everything.</p> : null}
      </section>
    </div>
  );
}

/** Home fed by Convex, filtered by the client picker. Opening it records the visit that "since you were last here" counts from. */
export function Home() {
  const shell = useWorkspaceShell();
  const { scope } = useClientScope();
  const workspaceId = shell?.workspaceId;
  const data = useQuery(api.home.dashboard, workspaceId ? { workspaceId, scope } : "skip");
  const visit = useMutation(api.home.visit);
  const decide = useMutation(api.approvals.decide);
  const recordOutcome = useMutation(api.decisions.recordOutcome);
  useEffect(() => {
    if (workspaceId) void visit({ workspaceId }).catch(() => undefined);
  }, [workspaceId, visit]);
  if (!shell || !workspaceId) return null;
  return (
    <HomeView
      chat={<StartChat size="hero" placeholder="Ask in your own words: who are we losing to, which offer to lead with, why enquiries dropped…" />}
      data={data}
      agentName={(slug) => shell.agents.find((row) => row.slug === slug)?.name ?? "An agent"}
      decide={(approvalId, approve, extra) => decide({ workspaceId, approvalId: approvalId as Id<"approvals">, approve, ...extra })}
      recordOutcome={(decisionId, result, note) => recordOutcome({ workspaceId, decisionId: decisionId as Id<"decisions">, result, note })}
      onPickClient={(choice) => shell.setChoice?.(choice)}
      picked={shell.choice ?? "all"}
    />
  );
}
