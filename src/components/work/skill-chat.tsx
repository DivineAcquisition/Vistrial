"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { VistrialMark } from "@/components/brand/vistrial-mark";
import { Brain, Rocket, Wallet } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/errors/show-error";
import { money } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

import type { SkillChatData } from "./types";

type PlanData = { name: string; steps: string[]; reads: string; capCents: number; dayLeftCents: number };
type Known = { key: string; value: string }[];

const KNOWN_WORDS: Record<string, string> = { goal: "Your goal", acquisitionChannels: "Where customers find you", offer: "Your offer" };

/**
 * The tab's chat, drawn from its messages: questions with choices, what memory already knew, and the plan
 * with its budget and a Start button. Nothing runs until Start.
 */
export function SkillChatView({
  data,
  editor,
  placeholder,
  initialText,
  onSend,
  onStart,
  onReset,
}: {
  data: SkillChatData | null;
  editor: boolean;
  placeholder: string;
  initialText?: string;
  onSend: (text: string) => Promise<void>;
  onStart: () => Promise<void>;
  onReset: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState("");
  const messages = data?.messages ?? [];
  const ready = data?.intake.status === "ready";
  const last = messages[messages.length - 1];

  return (
    <div className="grid gap-3">
      {messages.length > 0 ? (
        <ol className="grid gap-2" aria-label="Conversation">
          {messages.map((row) => {
            if (row.role === "you") {
              return (
                <li key={row.id} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-primary/15 px-3 py-2 text-sm text-card-foreground">
                  {row.text}
                </li>
              );
            }
            if (row.kind === "known") {
              return (
                <li key={row.id} className="flex max-w-[92%] gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2 text-sm">
                  <Brain aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="grid gap-0.5">
                    <span className="text-muted-foreground">{row.text}</span>
                    {((row.data as Known | null) ?? []).map((item) => (
                      <span key={item.key} className="text-card-foreground">
                        <span className="text-muted-foreground">{KNOWN_WORDS[item.key] ?? item.key}:</span> {item.value}
                      </span>
                    ))}
                  </span>
                </li>
              );
            }
            if (row.kind === "plan") {
              const plan = row.data as PlanData;
              return (
                <li key={row.id} className="grid gap-3 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] to-transparent p-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                    <Rocket aria-hidden className="size-4 text-primary" /> {plan.name}: the plan
                  </p>
                  <ol className="grid gap-1.5 text-sm text-card-foreground">
                    {plan.steps.map((step, i) => (
                      <li key={step} className="flex gap-2">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] text-primary tabular-nums">{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                  <p className="text-xs text-muted-foreground">{plan.reads}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 text-card-foreground">
                      <Wallet aria-hidden className="size-3.5 text-primary" /> Up to {money(plan.capCents)} for this run
                    </span>
                    <span>{money(plan.dayLeftCents)} left in today&apos;s budget for this skill</span>
                  </p>
                  {editor && ready && row.id === last?.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        disabled={starting}
                        onClick={() => {
                          setStarting(true);
                          setProblem("");
                          void onStart().then(
                            () => setStarting(false),
                            (error: unknown) => {
                              setStarting(false);
                              setProblem(showError(error, "It did not start."));
                            },
                          );
                        }}
                      >
                        {starting ? "Starting…" : "Start"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={onReset}>
                        Start over
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            }
            return (
              <li key={row.id} className="flex max-w-[92%] gap-2">
                <VistrialMark size="sm" />
                <span className="grid gap-2">
                  <span className="rounded-2xl rounded-tl-md border border-border bg-card px-3 py-2 text-sm text-card-foreground">{row.text}</span>
                  {row.id === last?.id && row.chips.length > 0 && editor ? (
                    <span className="flex flex-wrap gap-1.5">
                      {row.chips.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          className="rounded-full border border-border bg-background px-3 py-1 text-xs text-card-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
                          onClick={() => void onSend(chip).catch((error: unknown) => setProblem(showError(error, "That was not sent.")))}
                        >
                          {chip}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
      {data?.intake.status === "started" ? null : (
        <div className={cn(ready && "opacity-90")}>
          <ChatComposer
            size="compact"
            placeholder={!editor ? "Owners and Managers start work." : ready ? "Change an answer…" : messages.length ? "Answer, or tap a choice…" : placeholder}
            disabled={!editor}
            initialText={initialText}
            onSubmit={async (text) => {
              setProblem("");
              try {
                await onSend(text);
              } catch (error) {
                setProblem(showError(error, "That was not sent."));
                throw error;
              }
            }}
            footnote={messages.length === 0 ? "It asks only what it needs, then shows the plan and its budget. Nothing runs until you press Start." : undefined}
          />
        </div>
      )}
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
    </div>
  );
}

/** The chat fed by Convex, for Offers and Diagnostics. Picks up an unfinished conversation. */
export function SkillChat({
  workspaceId,
  skillSlug,
  editor,
  placeholder,
  initialText,
  onStarted,
}: {
  workspaceId: Id<"workspaces">;
  skillSlug: "offer-intelligence" | "growth-diagnostics";
  editor: boolean;
  placeholder: string;
  initialText?: string;
  onStarted?: (result: { runId: Id<"agentRuns">; projectId: Id<"researchProjects"> | null }) => void;
}) {
  const open = useQuery(api.skillIntake.open, { workspaceId, skillSlug });
  const create = useMutation(api.skillIntake.create);
  const reply = useMutation(api.skillIntake.reply);
  const start = useMutation(api.skillIntake.start);
  const abandon = useMutation(api.skillIntake.abandon);
  const [startedNote, setStartedNote] = useState(false);
  if (open === undefined) return <p className="text-sm text-muted-foreground">Loading the conversation.</p>;
  const intakeId = open?.intake.id ?? null;
  return (
    <div className="grid gap-2">
      {startedNote && !open ? <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-card-foreground">Started. Follow it under Running now; the result lands in Results for you to review.</p> : null}
      <SkillChatView
        key={intakeId ?? "new"}
        data={open}
        editor={editor}
        placeholder={placeholder}
        initialText={intakeId ? "" : initialText}
        onSend={async (text) => {
          setStartedNote(false);
          if (intakeId) await reply({ workspaceId, intakeId, text });
          else await create({ workspaceId, skillSlug, text });
        }}
        onStart={async () => {
          if (!intakeId) return;
          const result = await start({ workspaceId, intakeId });
          setStartedNote(true);
          onStarted?.(result);
        }}
        onReset={() => {
          if (intakeId) void abandon({ workspaceId, intakeId });
        }}
      />
    </div>
  );
}
