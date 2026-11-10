"use client";

import { useState } from "react";

import { CheckCircle2, Circle, ShieldCheck, Target } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { offerBoard, roadmapBoard } from "@/lib/work/board";
import { cn } from "@/lib/utils";
import { GUARANTEE_WORDS } from "../../../convex/lib/offerCards";

import { BoardCanvas, BoardCard } from "./board-canvas";
import type { TryActions } from "./try-this";
import type { ConnectedData, DiagnosisView, GoalView, ItemDecision, OfferAnalysisView, OfferCardFull } from "./types";

const eyebrow = "text-[10px] font-semibold tracking-[0.14em] uppercase";

function stated(value: string) {
  return Boolean(value.trim()) && !/^not stated/i.test(value.trim());
}

/** A step or change's decision in a few words. */
function statusOf(decision: ItemDecision | undefined) {
  if (!decision) return null;
  if (decision.outcome) return `Recorded ${shortDate(decision.outcome.recordedAt)}`;
  return decision.due ? "Trying · check-in due" : `Trying · check-in ${shortDate(decision.checkInAt)}`;
}

/** "We'll try this" on a board card: the same outcome loop as the Cards view, with the phase's usual check-in. */
function TryButton({ index, days, actions }: { index: number; days: number; actions: TryActions }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  return (
    <span className="mt-auto grid gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setProblem("");
          void actions.plan(index, days).then(
            () => setBusy(false),
            (error: unknown) => {
              setBusy(false);
              setProblem(showError(error, "That did not save."));
            },
          );
        }}
      >
        <Target aria-hidden className="size-4" /> We&apos;ll try this
      </Button>
      {problem ? <span className="text-[11px] text-destructive">{problem}</span> : <span className="text-[11px] text-muted-foreground">Check back in {days} days</span>}
    </span>
  );
}

/**
 * An offer on the board: its versions lead into the offer, competitors from approved research branch to the
 * right, and the test plan sits underneath. The same data as the Cards view; nothing here is stored.
 */
export function OffersCanvas({ card, analysis, decisions, tryActions, editor }: { card: OfferCardFull; analysis: OfferAnalysisView | null; decisions: Map<number, ItemDecision>; tryActions: TryActions; editor: boolean }) {
  const versions = card.versions.slice(-4);
  const current = card.versions.find((row) => row.version === card.currentVersion) ?? card.versions[card.versions.length - 1];
  const competitors = analysis?.competitors.slice(0, 4) ?? [];
  const changes = analysis?.changes.slice(0, 3) ?? [];
  const ready = analysis !== null && analysis.status !== "rejected";
  const board = offerBoard({ versions: versions.map((row) => row.version), competitors: competitors.length, changes: changes.length });
  return (
    <BoardCanvas
      board={board}
      label={`Canvas: ${current?.name ?? "offer"}`}
      focus="offer"
      renderNode={(node) => {
        if (node.id === "offer" && current) {
          return (
            <BoardCard tone="current" className="gap-2.5 p-5">
              <span className={cn(eyebrow, "text-muted-foreground")}>Your offer · version {current.version}</span>
              <span className="line-clamp-3 font-heading text-lg leading-snug text-card-foreground">{current.outcome || current.name}</span>
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-heading text-3xl leading-none font-semibold text-card-foreground tabular-nums">{current.price || "No price yet"}</span>
                {current.pricing?.was ? <s className="text-sm text-muted-foreground">{current.pricing.was}</s> : null}
              </span>
              {current.included.length ? <span className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{current.included.join(" · ")}</span> : null}
              <span className="mt-auto flex items-start gap-1.5 rounded-lg bg-success/10 px-2.5 py-2 text-xs leading-snug text-card-foreground">
                <ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0 text-success" />
                <span className="line-clamp-2">{current.guaranteeType === "none" ? "No guarantee offered." : current.guarantee || `${current.guaranteeType ? GUARANTEE_WORDS[current.guaranteeType] : "Guarantee"} not stated`}</span>
              </span>
            </BoardCard>
          );
        }
        if (node.id.startsWith("version-")) {
          const row = versions.find((item) => `version-${item.version}` === node.id);
          if (!row) return null;
          const isCurrent = row.version === card.currentVersion;
          return (
            <BoardCard tone={isCurrent ? "accent" : "plain"} className="gap-0.5 p-3">
              <span className="text-xs font-semibold text-card-foreground">
                v{row.version} · {shortDate(row.createdAt)}
                {isCurrent ? " · current" : ""}
              </span>
              <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">{row.note ?? (row.origin === "chat" ? "From your chat" : row.origin === "analysis" ? "From an offer analysis" : row.price || "You edited")}</span>
            </BoardCard>
          );
        }
        if (node.id.startsWith("competitor-")) {
          const row = competitors[Number(node.id.split("-")[1])];
          if (!row) return null;
          return (
            <BoardCard>
              <span className="truncate text-sm font-semibold text-card-foreground">{row.competitor}</span>
              <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{[stated(row.price) ? row.price : "Price not stated", row.offer].filter(Boolean).join(" · ")}</span>
              <span className={cn("line-clamp-2 text-xs leading-snug", row.gaps.guarantee ? "font-medium text-warning" : "text-muted-foreground")}>{stated(row.guarantee) ? `Guarantee: ${row.guarantee}` : "Guarantee not stated"}</span>
            </BoardCard>
          );
        }
        if (node.id.startsWith("change-")) {
          const row = changes[Number(node.id.split("-")[1])];
          if (!row) return null;
          const status = statusOf(decisions.get(row.index));
          return (
            <BoardCard tone={status ? "accent" : "plain"}>
              <span className={cn(eyebrow, status ? "text-card-foreground" : "text-muted-foreground")}>{status ?? `Test ${row.index + 1}`}</span>
              <span className="line-clamp-2 text-sm leading-snug font-semibold text-card-foreground">{row.title}</span>
              <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{row.validationMethod}</span>
              {!status && editor && ready ? <TryButton index={row.index} days={30} actions={tryActions} /> : null}
            </BoardCard>
          );
        }
        return null;
      }}
    />
  );
}

const PHASE_WORDS: Record<string, { name: string; weeks: string; tone: string; days: number }> = {
  fix: { name: "Fix", weeks: "Weeks 1–4", tone: "bg-[#0b0a11] text-white dark:bg-white dark:text-[#0b0a11]", days: 30 },
  build: { name: "Build", weeks: "Weeks 5–8", tone: "bg-primary text-primary-foreground", days: 60 },
  scale: { name: "Scale", weeks: "Weeks 9–12", tone: "bg-success text-white", days: 90 },
};

const STAGE_WORDS: Record<string, string> = { reach: "Reach", clicks: "Clicks", leads: "Leads or booked calls", revenue: "Revenue", unknown: "Not enough data" };

/**
 * The roadmap on the board: the goal leads to where growth stalls, which branches into Fix, Build and
 * Scale, each followed by its steps. The connected-data checklist sits beside it.
 */
export function RoadmapCanvas({ goal, diagnosis, data, decisions, tryActions, editor }: { goal: GoalView; diagnosis: DiagnosisView; data: ConnectedData; decisions: Map<number, ItemDecision>; tryActions: TryActions; editor: boolean }) {
  const canTry = diagnosis.status !== "rejected" && diagnosis.status !== "archived";
  const phases = (["fix", "build", "scale"] as const).map((key) => ({ key, steps: diagnosis.roadmap.filter((row) => row.phase === key).map((row) => row.index) }));
  const board = roadmapBoard({ goal: goal !== null, phases });
  const figure = diagnosis.stageFigures[0];
  const rows = [
    { done: data.meta, label: data.meta ? "Meta ads: connected" : "Meta ads: not connected" },
    { done: data.resultsFiles > 0, label: data.resultsFiles > 0 ? `Results files: ${data.resultsFiles} ready` : "Results files: none yet" },
    { done: data.outcomes > 0, label: data.outcomes > 0 ? `Outcomes: ${data.outcomes} recorded` : "Outcomes: none recorded yet" },
  ];
  return (
    <BoardCanvas
      board={board}
      label="Canvas: 90-day roadmap"
      focus="stall"
      renderNode={(node) => {
        if (node.id === "goal" && goal) {
          return (
            <BoardCard tone="dark" className="p-4">
              <span className={cn(eyebrow, "opacity-70")}>Your 90-day goal</span>
              <span className="line-clamp-3 font-heading text-lg leading-snug">{goal.text}</span>
            </BoardCard>
          );
        }
        if (node.id === "stall") {
          return (
            <BoardCard tone="warning" className="border-2 p-4">
              <span className={cn(eyebrow, "text-card-foreground")}>Where growth stalls</span>
              <span className="font-heading text-base leading-snug text-card-foreground">{diagnosis.hasData ? (STAGE_WORDS[diagnosis.stage] ?? diagnosis.stage) : "Not enough data"}</span>
              {figure ? <span className="font-heading text-3xl leading-none font-semibold text-card-foreground tabular-nums">{figure.display}</span> : null}
              <span className="line-clamp-3 text-xs leading-snug text-muted-foreground">{diagnosis.hasData ? diagnosis.stageReason : "Connect Meta or upload a results file, then run the diagnosis again."}</span>
            </BoardCard>
          );
        }
        if (node.id === "data") {
          return (
            <BoardCard className="gap-1.5">
              <span className={cn(eyebrow, "text-muted-foreground")}>Your data · {rows.filter((row) => row.done).length} of 3 connected</span>
              {rows.map((row) => (
                <span key={row.label} className={cn("flex items-center gap-1.5 text-xs", row.done ? "text-card-foreground" : "text-muted-foreground")}>
                  {row.done ? <CheckCircle2 aria-hidden className="size-3.5 shrink-0 text-success" /> : <Circle aria-hidden className="size-3.5 shrink-0" />}
                  {row.label}
                </span>
              ))}
            </BoardCard>
          );
        }
        if (node.id.startsWith("phase-")) {
          const words = PHASE_WORDS[node.id.slice(6)];
          if (!words) return null;
          return (
            <div className={cn("grid h-full w-full content-center gap-0.5 rounded-xl px-3.5", words.tone)}>
              <span className="font-heading text-base font-semibold">{words.name}</span>
              <span className="text-xs opacity-80">{words.weeks}</span>
            </div>
          );
        }
        if (node.id.startsWith("step-")) {
          const step = diagnosis.roadmap.find((row) => `step-${row.index}` === node.id);
          if (!step) return null;
          const thin = step.figures.length === 0;
          const status = statusOf(decisions.get(step.index));
          return (
            <BoardCard tone={thin ? "warning" : status ? "accent" : "plain"}>
              {thin || status ? <span className={cn(eyebrow, "text-card-foreground")}>{thin ? "Not enough data" : status}</span> : null}
              <span className="line-clamp-2 text-sm leading-snug font-semibold text-card-foreground">{step.action}</span>
              <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                {step.targetMetric}: {step.target}
              </span>
              {!status && editor && canTry ? <TryButton index={step.index} days={PHASE_WORDS[step.phase]?.days ?? 30} actions={tryActions} /> : null}
            </BoardCard>
          );
        }
        return null;
      }}
    />
  );
}
