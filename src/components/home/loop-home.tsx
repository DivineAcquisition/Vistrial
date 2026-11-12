"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";

import { AssetRow } from "@/components/assets/asset-row";
import { StartChat } from "@/components/chat/start-chat";
import { CheckInRow, QuestionRow } from "@/components/home/waiting-rows";
import { ArrowRight, Check, FileSearch, X } from "@/components/icons";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { MeasuredChanges, RESULT_WORDS } from "@/components/research/outcome-loop";
import { useWorkspaceShell, scopeOf } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import { MEMORY_HREF } from "@/lib/shell/journey";

export type HomeOverview = FunctionReturnType<typeof api.home.overview>;
export type WaitingItem = FunctionReturnType<typeof api.home.waiting>[number];
export type ProvenItem = FunctionReturnType<typeof api.home.proven>[number];

export const HOME_HEADING = "What does the business need to figure out next?";

/** The five steps every piece of work moves through, each with a live count and where to act on it. */
export function loopSteps(overview: HomeOverview | undefined) {
  const loop = overview?.loop;
  return [
    { key: "understand", name: "Understand", value: loop ? `${loop.understand}%` : "…", caption: "known about the business", href: MEMORY_HREF },
    { key: "research", name: "Research", value: loop?.research ?? "…", caption: loop?.research === 1 ? "run going" : "runs going", href: "/app/runs" },
    { key: "decide", name: "Decide", value: loop?.decide ?? "…", caption: loop?.decide === 1 ? "report to approve" : "reports to approve", href: "#waiting" },
    { key: "try", name: "Try", value: loop?.try ?? "…", caption: "being tried", href: "/app/research" },
    { key: "measure", name: "Measure", value: loop?.measure ?? "…", caption: loop?.measure === 1 ? "check-in due" : "check-ins due", href: "#waiting" },
  ];
}

function LoopStrip({ overview }: { overview: HomeOverview | undefined }) {
  const steps = loopSteps(overview);
  return (
    <section aria-labelledby="loop-heading" className="grid gap-3">
      <h2 id="loop-heading" className="sr-only">
        The loop
      </h2>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map((step, index) => {
          const live = typeof step.value === "number" ? step.value > 0 : step.value !== "0%" && step.value !== "…";
          return (
            <li key={step.key} className={cn("min-w-0", index === steps.length - 1 && "col-span-2 sm:col-span-1")}>
              <Link
                href={step.href}
                className="group grid h-full gap-1 rounded-xl border border-border bg-card p-3 outline-none transition-colors hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  <span aria-hidden className="tabular-nums">
                    {index + 1}
                  </span>
                  {step.name}
                  {index < steps.length - 1 ? <ArrowRight aria-hidden className="ml-auto size-3.5 opacity-50 transition-transform group-hover:translate-x-0.5" /> : null}
                </span>
                <span className={cn("font-heading text-2xl tabular-nums", live ? "text-card-foreground" : "text-muted-foreground")}>{step.value}</span>
                <span className="text-xs text-muted-foreground">{step.caption}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WaitingList({ items, actionable }: { items: WaitingItem[] | undefined; actionable: boolean }) {
  return (
    <Panel as="section" className="grid scroll-mt-6 gap-3 p-4 sm:p-6">
      <div id="waiting" className="grid gap-1">
        <h2 className="font-heading text-base text-card-foreground">Waiting on you</h2>
        <p className="text-sm text-muted-foreground">
          {actionable
            ? "Ordered by what frees up the most work: questions first, then what happened, then reports to approve."
            : "An owner or manager answers and approves these. You can read each one."}
        </p>
      </div>
      {items === undefined ? (
        <p className="text-sm text-muted-foreground">Loading.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting. Ask a question above to start the next round.</p>
      ) : (
        <Stagger className="grid gap-3">
          {items.map((item) => (
            <StaggerItem key={item.key}>
              {item.kind === "question" ? (
                <QuestionRow row={item} />
              ) : item.kind === "checkIn" ? (
                <CheckInRow row={{ checkInAt: item.at, proposedAction: item.proposedAction, projectId: item.projectId }} />
              ) : (
                <div className="grid gap-1">
                  <AssetRow asset={item.asset} />
                  <p className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                    <FileSearch aria-hidden className="size-3.5" />
                    {item.sources === 1 ? "Built on 1 source" : `Built on ${item.sources} sources`}
                  </p>
                </div>
              )}
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </Panel>
  );
}

function Knows({ overview }: { overview: HomeOverview | undefined }) {
  const knowledge = overview?.knowledge;
  return (
    <Panel as="section" className="grid gap-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-base text-card-foreground">What Vistrial knows</h2>
        <span className="text-sm text-muted-foreground tabular-nums">{knowledge ? `${knowledge.percent}%` : ""}</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {(knowledge?.items ?? []).map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.done ? "border-success/30 bg-success/10 text-card-foreground" : "border-dashed border-border text-muted-foreground hover:text-card-foreground",
              )}
            >
              {item.done ? <Check aria-hidden className="size-3.5 text-success" /> : <X aria-hidden className="size-3.5" />}
              <span className="sr-only">{item.done ? "Known:" : "Missing:"}</span>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {knowledge?.next ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-overlay/[0.03] p-3">
          <p className="min-w-0 flex-1 text-sm text-card-foreground">
            <span className="text-muted-foreground">Add next: </span>
            {knowledge.next.label}. Each answer makes the next report more specific to you.
          </p>
          <Button size="sm" variant="outline" render={<Link href={knowledge.next.href} />}>
            {knowledge.next.label}
          </Button>
        </div>
      ) : knowledge ? (
        <p className="text-sm text-muted-foreground">Everything Vistrial asks for is in. Keep recording outcomes and it keeps learning.</p>
      ) : null}
    </Panel>
  );
}

function Proven({ items }: { items: ProvenItem[] | undefined }) {
  return (
    <Panel as="section" className="grid gap-3 p-4 sm:p-6">
      <h2 className="font-heading text-base text-card-foreground">Proven for you</h2>
      {items === undefined ? (
        <p className="text-sm text-muted-foreground">Loading.</p>
      ) : items.length === 0 ? (
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p>Nothing proven yet. This fills in as the loop turns:</p>
          <ol className="grid list-decimal gap-1 pl-5">
            <li>Ask a question and approve the report it hands back.</li>
            <li>Pick an opportunity in it and press &ldquo;We&apos;ll try this&rdquo;. Your figures are saved as the starting point.</li>
            <li>When the check-in comes, say what happened. The change from before to after shows here.</li>
          </ol>
        </div>
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li key={item.id} className="grid gap-2 rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge label={RESULT_WORDS[item.result].label} tone={RESULT_WORDS[item.result].tone} className="[&_span]:normal-case" />
                <span className="text-xs text-muted-foreground">Recorded {new Date(item.recordedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
              </div>
              <p className="font-medium break-words text-card-foreground">{item.proposedAction}</p>
              {item.note ? <p className="text-sm break-words text-muted-foreground">&ldquo;{item.note}&rdquo;</p> : null}
              <MeasuredChanges changes={item.changes} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The home page once setup is done: ask, see where the loop stands, act on what waits, and see what worked. */
export function LoopHomeView({
  chat,
  overview,
  waiting,
  proven,
  footer,
}: {
  chat: React.ReactNode;
  overview: HomeOverview | undefined;
  waiting: WaitingItem[] | undefined;
  proven: ProvenItem[] | undefined;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid w-full max-w-5xl min-w-0 gap-6">
      <section aria-labelledby="home-heading" className="grid gap-4 pt-2 sm:pt-6">
        <h1 id="home-heading" className="text-center font-heading text-2xl text-balance text-foreground sm:text-3xl">
          {HOME_HEADING}
        </h1>
        {chat}
      </section>
      <LoopStrip overview={overview} />
      <WaitingList items={waiting} actionable={overview?.actionable ?? true} />
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <Knows overview={overview} />
        <Proven items={proven} />
      </div>
      {footer}
    </div>
  );
}

export function LoopHome() {
  const shell = useWorkspaceShell();
  const args = shell ? { workspaceId: shell.workspaceId, scope: scopeOf(shell).scope } : "skip";
  const overview = useQuery(api.home.overview, args);
  const waiting = useQuery(api.home.waiting, args);
  const proven = useQuery(api.home.proven, args);
  const mark = useMutation(api.workspace.markSetupDone);
  if (!shell) return null;
  return (
    <LoopHomeView
      chat={<StartChat size="hero" placeholder="Ask in your own words: who are we losing to, which offer to lead with, why sign-ups dropped…" />}
      overview={overview}
      waiting={waiting}
      proven={proven}
      footer={
        shell.role === "owner" ? (
          <Button className="w-fit" type="button" variant="ghost" onClick={() => void mark({ workspaceId: shell.workspaceId, setupDone: false })}>
            Show the setup path
          </Button>
        ) : null
      }
    />
  );
}
