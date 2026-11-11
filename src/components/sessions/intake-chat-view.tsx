"use client";

import {
  ArrowUp,
  Brain,
  Building2,
  Compass,
  Globe,
  Lightbulb,
  MapPin,
  Plus,
  Rocket,
  Target,
  Wallet,
  X,
} from "@/components/icons";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { useFillViewport } from "@/components/chat/use-fill-viewport";
import { VistrialMark } from "@/components/brand/vistrial-mark";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { SourceIcon } from "@/components/research/source-icon";
import { Banner } from "@/components/ui/banner";
import { showError } from "@/lib/errors/show-error";

export type IntakeSlots = {
  objective: string;
  market: string;
  geography: string;
  competitors: { name: string; url?: string; origin: string }[];
  competitorsUnknown: boolean;
  platforms: string[];
  links: string[];
  origins: Record<string, string | undefined>;
};

export type IntakeMessage = { id: string; role: "you" | "agent"; kind: string; text: string; chips: string[]; data: unknown; at: number };

export type IntakeView = {
  intake: {
    id: string;
    status: "chatting" | "thinking" | "ready" | "started" | "abandoned";
    slots: IntakeSlots;
    questionsAsked: number;
    maxQuestions: number;
    asking: string | null;
    costCents: number;
    capCents: number;
    pendingRemember: { factKey: string; label: string; value: string }[];
    platformNote: string | null;
    projectId: string | null;
    mode?: "thorough" | "fast";
    researchCapCents?: number;
  };
  messages: IntakeMessage[];
};

export type IntakeActions = {
  send: (text: string) => Promise<void>;
  remember: (factKey: string, yes: boolean) => Promise<void>;
  removeCompetitor: (name: string) => Promise<void>;
  addCompetitor: (name: string) => Promise<void>;
  setPlatforms: (platforms: string[]) => Promise<void>;
  start: () => Promise<void>;
};

const PLATFORMS: { value: string; label: string }[] = [
  { value: "web", label: "Web" },
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "metaAdLibrary", label: "Meta Ad Library" },
];

const ORIGIN_WORDS: Record<string, string> = { memory: "from memory", you: "you said", found: "found", assumed: "assumed" };

const SUGGESTIONS = [
  "What do my local competitors lead with, and where can we stand out?",
  "What do competitors' video ads promise in the first three seconds?",
  "Who shows prices, and how do they frame them?",
];

function Avatar() {
  return <VistrialMark className="mt-0.5" />;
}

function Agent({ children, name }: { children: React.ReactNode; name?: string }) {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex min-w-0 gap-3">
      <Avatar />
      <div className="grid min-w-0 flex-1 gap-2">
        {name ? <span className="text-xs font-medium text-muted-foreground">{name}</span> : null}
        {children}
      </div>
    </motion.li>
  );
}

function You({ text }: { text: string }) {
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
      <p className="max-w-[min(34rem,85%)] rounded-2xl rounded-tr-md bg-primary/10 px-4 py-2.5 text-sm break-words text-card-foreground ring-1 ring-primary/20">{text}</p>
    </motion.li>
  );
}

function Chips({ chips, onPick, disabled }: { chips: string[]; onPick: (chip: string) => void; disabled?: boolean }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          disabled={disabled}
          onClick={() => onPick(chip)}
          className="rounded-full border border-primary/30 bg-card px-3 py-1.5 text-sm text-primary transition-colors hover:bg-primary/10 disabled:cursor-default disabled:opacity-50"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}

function Thinking() {
  return (
    <Agent>
      <span className="flex h-9 w-16 items-center justify-center gap-1 rounded-2xl rounded-tl-md bg-muted px-3" aria-label="Thinking">
        {[0, 1, 2].map((dot) => (
          <motion.span
            key={dot}
            className="size-1.5 rounded-full bg-muted-foreground"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, delay: dot * 0.15 }}
          />
        ))}
      </span>
    </Agent>
  );
}

/** The plan: what will be researched, with what is known, found and assumed, and the costs. */
function PlanCard({ view, actions, editor }: { view: IntakeView; actions: IntakeActions; editor: boolean }) {
  const { intake } = view;
  const slots = intake.slots;
  const [adding, setAdding] = useState("");
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState("");
  const plan = [...view.messages].reverse().find((row) => row.kind === "plan");
  const assumptions = ((plan?.data as { assumptions?: string[] } | null)?.assumptions ?? []).filter(Boolean);
  const locked = intake.status !== "ready" || !editor;
  const row = (icon: typeof Target, label: string, value: React.ReactNode, origin?: string) => {
    const Icon = icon;
    return (
      <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:gap-3">
        <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          <Icon aria-hidden className="size-3.5" /> {label}
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-card-foreground">
          {value}
          {origin ? <span className="text-xs text-muted-foreground">({ORIGIN_WORDS[origin] ?? origin})</span> : null}
        </span>
      </div>
    );
  };
  return (
    <Panel className="relative grid gap-1 overflow-hidden p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <h3 className="flex items-center gap-2 font-heading text-base text-card-foreground">
          <Compass aria-hidden className="size-4 text-primary" /> Research plan
        </h3>
        <StatusBadge label={intake.status === "started" ? "Started" : "Waiting for you"} tone={intake.status === "started" ? "good" : "brand"} className="[&_span]:normal-case" />
      </div>
      {row(Target, "Goal", <span className="break-words">{slots.objective || "Not set"}</span>, slots.objective ? slots.origins.objective ?? "you" : undefined)}
      {row(Building2, "You sell", slots.market || <span className="text-warning">Not set</span>, slots.market ? slots.origins.market : undefined)}
      {row(MapPin, "Area", slots.geography || <span className="text-warning">Not set</span>, slots.geography ? slots.origins.geography : undefined)}
      {row(
        Globe,
        "Competitors",
        <>
          {slots.competitors.length === 0 ? <span className="text-muted-foreground">None yet</span> : null}
          {slots.competitors.map((entry) => (
            <span key={entry.name} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
              {entry.name}
              <span className="text-muted-foreground">· {ORIGIN_WORDS[entry.origin] ?? entry.origin}</span>
              {!locked ? (
                <button type="button" aria-label={`Remove ${entry.name}`} onClick={() => void actions.removeCompetitor(entry.name)} className="ml-0.5 text-muted-foreground hover:text-foreground">
                  <X aria-hidden className="size-3" />
                </button>
              ) : null}
            </span>
          ))}
          {!locked ? (
            <form
              className="inline-flex items-center gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                if (adding.trim()) void actions.addCompetitor(adding.trim()).then(() => setAdding(""));
              }}
            >
              <label className="sr-only" htmlFor="plan-add-competitor">
                Add a competitor
              </label>
              <input
                id="plan-add-competitor"
                value={adding}
                onChange={(event) => setAdding(event.target.value)}
                placeholder="Add one"
                className="h-7 w-28 rounded-full border border-border bg-background px-2.5 text-xs outline-none focus:border-primary/50"
              />
              <button type="submit" aria-label="Add competitor" className="flex size-7 items-center justify-center rounded-full text-primary hover:bg-primary/10">
                <Plus aria-hidden className="size-3.5" />
              </button>
            </form>
          ) : null}
        </>,
      )}
      {row(
        Compass,
        "Where to look",
        <span className="grid gap-2">
          <span className="flex flex-wrap gap-1.5">
            {PLATFORMS.map((platform) => {
              const on = slots.platforms.includes(platform.value);
              return (
                <button
                  key={platform.value}
                  type="button"
                  disabled={locked}
                  aria-pressed={on}
                  onClick={() => {
                    const next = on ? slots.platforms.filter((value) => value !== platform.value) : [...slots.platforms, platform.value];
                    if (next.length) void actions.setPlatforms(next);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 transition-colors",
                    on ? "bg-primary/10 text-primary ring-primary/30" : "bg-background text-muted-foreground ring-border",
                    !locked && "hover:ring-primary/50",
                  )}
                >
                  <SourceIcon platform={platform.value} size={12} />
                  {platform.label}
                </button>
              );
            })}
          </span>
          {intake.platformNote ? (
            <span className="flex gap-1.5 text-xs text-muted-foreground">
              <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" /> {intake.platformNote}
            </span>
          ) : null}
        </span>,
        slots.origins.platforms === "memory" ? "memory" : undefined,
      )}
      {assumptions.length ? (
        <Banner compact tone="warning" role="note" title="Assumed" className="mt-2">
          <ul className="grid gap-0.5">
            {assumptions.map((line) => (
              <li key={line} className="text-xs">
                {line}
              </li>
            ))}
          </ul>
        </Banner>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
        <span className="flex items-start gap-2 text-xs text-muted-foreground">
          <Wallet aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {intake.mode === "fast" ? "Fast (Sonnet 5.5)" : "Thorough (Opus 5.5)"}. This conversation: {money(intake.costCents)} of {money(intake.capCents)}. Research: up to{" "}
            {money(intake.researchCapCents ?? 300)}, with 50¢ held back to check and fix the report once.
          </span>
        </span>
        {intake.status === "ready" && editor ? (
          <Button
            variant="gradient"
            loading={starting}
            onClick={() => {
              setStarting(true);
              setProblem("");
              void actions.start().catch((error: unknown) => {
                setStarting(false);
                setProblem(showError(error, "It did not start."));
              });
            }}
          >
            <Rocket aria-hidden className="size-4" /> Start research
          </Button>
        ) : null}
      </div>
      {problem ? <p className="text-sm text-destructive">{problem}</p> : null}
    </Panel>
  );
}

/**
 * The research intake as a chat. Vistrial says what it knows, asks one thing at a time with tap answers,
 * offers to remember lasting answers, and ends with a plan you can change before pressing Start.
 */
export function IntakeChatView({
  view,
  actions,
  editor,
  agentName,
  initialText = "",
  onFirstMessage,
  composer,
}: {
  view: IntakeView | null;
  actions: IntakeActions;
  editor: boolean;
  agentName: string;
  initialText?: string;
  onFirstMessage?: (text: string) => Promise<void>;
  /** The shared chat box, used in place of the plain one. */
  composer?: React.ReactNode;
}) {
  const [text, setText] = useState(initialText);
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const column = useFillViewport<HTMLDivElement>();
  const status = view?.intake.status ?? "new";
  const lastId = view?.messages.at(-1)?.id;

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastId, status]);

  const send = async (value: string) => {
    const clean = value.trim();
    if (!clean || sending) return;
    setSending(true);
    try {
      if (!view && onFirstMessage) await onFirstMessage(clean);
      else await actions.send(clean);
      setText("");
    } finally {
      setSending(false);
    }
  };

  const busy = status === "thinking" || sending;
  const placeholder =
    status === "new" ? "What do you want to find out?" : status === "ready" ? "Ask to change anything in the plan…" : status === "started" ? "This session has started." : "Answer, or tap a choice…";
  const lastQuestion = view ? [...view.messages].reverse().find((row) => row.kind === "question") : null;

  return (
    <div ref={column} className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
      <ol className="grid gap-4" aria-label="Conversation" aria-live="polite">
        <Agent name={agentName}>
          <p className="text-sm text-card-foreground">
            What should I find out? I&apos;ll start from what I know about your business, ask only what&apos;s missing, and show you a plan with its budget before anything runs.
          </p>
          {!view ? (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((line) => (
                <button
                  key={line}
                  type="button"
                  onClick={() => setText(line)}
                  className="flex items-start gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground"
                >
                  <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {line}
                </button>
              ))}
            </div>
          ) : null}
        </Agent>

        <AnimatePresence initial={false}>
          {(view?.messages ?? []).map((message) => {
            if (message.role === "you") return <You key={message.id} text={message.text} />;
            if (message.kind === "known") {
              const items = (message.data as { items?: { label: string; value: string }[] } | null)?.items ?? [];
              return (
                <Agent key={message.id}>
                  <p className="text-sm text-card-foreground">{message.text}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((item) => (
                      <span key={item.label} className="grid gap-0.5 rounded-xl border border-border bg-card px-3 py-2">
                        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Brain aria-hidden className="size-3" /> {item.label} · from memory
                        </span>
                        <span className="text-sm break-words text-card-foreground">{item.value}</span>
                      </span>
                    ))}
                  </div>
                </Agent>
              );
            }
            if (message.kind === "question") {
              const current = message.id === lastQuestion?.id && status === "chatting";
              return (
                <Agent key={message.id}>
                  <p className="rounded-2xl rounded-tl-md bg-muted px-4 py-2.5 text-sm text-card-foreground">{message.text}</p>
                  {current && editor ? <Chips chips={message.chips} onPick={(chip) => void send(chip)} disabled={busy} /> : null}
                </Agent>
              );
            }
            if (message.kind === "remember") {
              const factKey = (message.data as { factKey?: string } | null)?.factKey ?? "";
              const open = view?.intake.pendingRemember.some((row) => row.factKey === factKey) ?? false;
              return (
                <Agent key={message.id}>
                  <div className="grid gap-2 rounded-xl border border-border bg-card p-3">
                    <p className="flex items-center gap-2 text-sm text-card-foreground">
                      <Brain aria-hidden className="size-4 text-primary" /> {message.text}
                    </p>
                    {open && editor ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => void actions.remember(factKey, true)}>
                          Yes, remember
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void actions.remember(factKey, false)}>
                          Just this session
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </Agent>
              );
            }
            if (message.kind === "found") {
              const found = (message.data as { competitors?: { name: string; url?: string }[] } | null)?.competitors ?? [];
              return (
                <Agent key={message.id}>
                  <p className="text-sm text-card-foreground">{message.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {found.map((row) => (
                      <span key={row.name} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-card-foreground">
                        <Globe aria-hidden className="size-3 text-muted-foreground" /> {row.name}
                      </span>
                    ))}
                  </div>
                </Agent>
              );
            }
            if (message.kind === "plan") {
              const latestPlan = [...(view?.messages ?? [])].reverse().find((row) => row.kind === "plan")?.id === message.id;
              return (
                <Agent key={message.id}>
                  <p className="text-sm text-card-foreground">{message.text}</p>
                  {latestPlan && view ? <PlanCard view={view} actions={actions} editor={editor} /> : null}
                </Agent>
              );
            }
            return (
              <Agent key={message.id}>
                <p className="text-sm text-card-foreground">{message.text}</p>
              </Agent>
            );
          })}
          {status === "thinking" || (sending && !view) ? <Thinking key="thinking" /> : null}
        </AnimatePresence>
        <div ref={end} />
      </ol>

      {composer && editor && status !== "started" ? (
        <div className="sticky bottom-20 z-10 mt-auto bg-gradient-to-t from-background via-background to-transparent pt-3 md:bottom-4">{composer}</div>
      ) : editor && status !== "started" ? (
        <form
          className="sticky bottom-20 z-10 mt-auto grid gap-1.5 bg-gradient-to-t from-background via-background to-transparent pt-3 md:bottom-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send(text);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm focus-within:border-primary/50">
            <label className="sr-only" htmlFor="intake-composer">
              {placeholder}
            </label>
            <Textarea
              id="intake-composer"
              rows={1}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send(text);
                }
              }}
              placeholder={placeholder}
              className="min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
            <Button type="submit" size="icon" aria-label="Send" loading={sending} disabled={!text.trim() || busy}>
              <ArrowUp aria-hidden className="size-4" />
            </Button>
          </div>
          <p className="px-1 text-[11px] text-muted-foreground">
            {view
              ? `Question ${Math.min(view.intake.questionsAsked, view.intake.maxQuestions)} of up to ${view.intake.maxQuestions} · this conversation ${money(view.intake.costCents)} of ${money(view.intake.capCents)}`
              : "Nothing runs or spends until you press Start research on the plan."}
          </p>
        </form>
      ) : !editor ? (
        <p className="sticky bottom-20 z-10 mt-auto rounded-2xl border border-border bg-card px-4 py-3 text-center text-sm text-muted-foreground md:bottom-4">
          Owners, Admins and Members start sessions. You can follow the ones they run.
        </p>
      ) : null}
    </div>
  );
}
