"use client";

import { agentSlugForName } from "@/lib/agents/avatars";
import { AgentAvatar } from "@/components/live/agent-avatar";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { ChatComposer } from "@/components/chat/chat-composer";
import { useChatExtras } from "@/components/chat/use-chat-extras";
import { ArrowRight, CheckCircle2, ChevronDown, FileSearch, Gauge, Lightbulb, LoaderCircle, MessageCircleQuestion, MessagesSquare, Paperclip, Plus, Square, Store, X, type LucideIcon } from "@/components/icons";
import { IntakeChat } from "@/components/sessions/intake-chat";
import { useWorkspaceShell, useClientScope } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import { SkillChatView, SkillConversation } from "@/components/work/skill-chat";
import type { SkillChatData } from "@/components/work/types";
import { showError } from "@/lib/errors/show-error";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CHAT_ROUTES, isChatRoute, type ChatRoute } from "../../../convex/lib/chatRouting";
import { agentWork } from "../../../convex/lib/workWords";

export type ChatRow = FunctionReturnType<typeof api.agentChat.list>[number];
export type ChatDetail = FunctionReturnType<typeof api.agentChat.get>;
export type ChatContext = { kind: "asset" | "offer" | "task" | "project"; id: string; title: string };

/** How an attached or open record is named beside its title. */
export const CONTEXT_LABEL: Record<ChatContext["kind"], string> = { offer: "Offer attached:", asset: "Result attached:", task: "About this task:", project: "About this session:" };

/** Where a conversation's work goes. `work` is the agent and what it does ("Strategist · Research"), never a skill's name. */
export const ROUTE_LOOK: Record<ChatRoute, { tab: string; work: string; icon: LucideIcon; hint: string }> = {
  "market-intelligence": { tab: "Research", work: agentWork(null, "market-intelligence"), icon: FileSearch, hint: "What do you want to find out about your market?" },
  "offer-intelligence": { tab: "Offers", work: agentWork(null, "offer-intelligence"), icon: Store, hint: "What should we look at in your offer?" },
  "growth-diagnostics": { tab: "Diagnostics", work: agentWork(null, "growth-diagnostics"), icon: Gauge, hint: "What is holding your growth back?" },
};

const STARTERS = ["What do other lead-gen agencies charge home-service brands?", "Is our $2,500/mo lead generation retainer strong enough?", "Why did we stop adding retained clients this quarter?"];

/** What a conversation is doing, in a few words, for the list. */
export function chatStatus(row: Pick<ChatDetail, "route" | "status" | "result">): { label: string; tone: "neutral" | "warning" | "good" | "primary" } {
  if (row.status === "started") {
    if (row.result?.state === "done") return { label: "Finished", tone: "good" };
    if (row.result?.state === "waiting") return { label: "Has a question", tone: "warning" };
    if (row.result?.state === "stopped") return { label: "Stopped", tone: "neutral" };
    return { label: "Working", tone: "primary" };
  }
  if (row.status === "abandoned") return { label: "Set aside", tone: "neutral" };
  if (row.route === null) return { label: "Choosing what to do", tone: "warning" };
  if (row.status === "ready") return { label: "Plan ready", tone: "warning" };
  return { label: "Answering questions", tone: "neutral" };
}

const TONE: Record<string, string> = { neutral: "text-muted-foreground", warning: "text-warning", good: "text-success", primary: "text-primary" };

/** Past conversations, newest first, with the open one marked. */
export function ConversationList({ rows, activeId, base, canStart }: { rows: ChatRow[] | undefined; activeId: string | null; base: string; canStart: boolean }) {
  return (
    <nav aria-label="Conversations" className="grid content-start gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm text-foreground">Conversations</h2>
        {canStart ? (
          <Button size="sm" variant={activeId ? "outline" : "ghost"} render={<Link href={`${base}/work/chat`} />}>
            <Plus aria-hidden className="size-4" /> New chat
          </Button>
        ) : null}
      </div>
      {rows === undefined ? (
        <p className="px-1 text-sm text-muted-foreground">Loading.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Your conversations with the Strategist are kept here.</p>
      ) : (
        <ul className="grid gap-1">
          {rows.map((row) => {
            const look = row.route ? ROUTE_LOOK[row.route] : null;
            const Icon = look?.icon ?? MessageCircleQuestion;
            const status = chatStatus(row);
            const active = row.id === activeId;
            return (
              <li key={row.id}>
                <Link
                  href={`${base}/work/chat?c=${row.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors", active ? "border-primary/40 bg-primary/[0.07]" : "border-transparent hover:border-border hover:bg-accent")}
                >
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", look ? "text-primary" : "text-warning")} />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="line-clamp-2 text-sm text-card-foreground">{row.title}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                      <span>{look?.tab ?? "Not routed yet"}</span>
                      <span aria-hidden>·</span>
                      <span className={TONE[status.tone]}>{status.label}</span>
                      <span aria-hidden>·</span>
                      <span>{shortDate(row.updatedAt)}</span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}

/** The item attached with "Refine in chat". */
export function ContextChip({ context, onClear }: { context: ChatContext; onClear?: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.08] py-1 pr-1.5 pl-2.5 text-xs text-card-foreground">
      <Paperclip aria-hidden className="size-3.5 shrink-0 text-primary" />
      <span className="truncate">
        <span className="text-muted-foreground">{CONTEXT_LABEL[context.kind]}</span> {context.title}
      </span>
      {onClear ? (
        <button type="button" aria-label="Remove the attached item" onClick={onClear} className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-overlay/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <X aria-hidden className="size-3" />
        </button>
      ) : (
        <span className="w-1" />
      )}
    </span>
  );
}

/**
 * A new conversation: say it in your own words and the chat works out which skill it is for, or choose one.
 * `preset` is the person's own choice ("New research" arrives with Research chosen).
 */
export function NewChatView({
  agentName,
  editor,
  preset,
  onPreset,
  context,
  onClearContext,
  composer,
}: {
  agentName: string;
  editor: boolean;
  preset: ChatRoute | null;
  onPreset: (route: ChatRoute | null) => void;
  context: ChatContext | null;
  onClearContext: () => void;
  /** The chat box. Given the starter a person tapped, so it can fill itself in. */
  composer: (starter: string) => ReactNode;
}) {
  const [starter, setStarter] = useState("");
  const choice = (route: ChatRoute | null, label: string, Icon?: LucideIcon) => (
    <button
      key={label}
      type="button"
      aria-pressed={preset === route}
      disabled={!editor}
      onClick={() => onPreset(route)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        preset === route ? "border-primary bg-primary/10 text-card-foreground" : "border-border text-muted-foreground hover:text-card-foreground",
      )}
    >
      {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
      {label}
    </button>
  );
  return (
    <Panel className="relative grid gap-4 overflow-hidden p-4 sm:p-6">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex items-start gap-3">
        {agentSlugForName(agentName) ? (
          <AgentAvatar name={agentName} size="lg" className="size-11" />
        ) : (
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/25">
            <MessagesSquare aria-hidden className="size-5" />
          </span>
        )}
        <div className="grid min-w-0 gap-0.5">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{agentName} · Chat</p>
          <h1 className="font-heading text-lg text-card-foreground">What do you want to work on?</h1>
          <p className="text-sm text-muted-foreground">
            Ask in your own words. It researches your market, works on your offer or finds why growth stalls, whichever you need, asks what it needs, then shows the plan and budget. If it can&apos;t tell which you mean, it asks.
          </p>
        </div>
      </div>
      <div className="relative grid gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Send this to">
          <span className="mr-1 text-xs text-muted-foreground">Send this to</span>
          {choice(null, "Let it decide")}
          {CHAT_ROUTES.map((route) => choice(route, ROUTE_LOOK[route].tab, ROUTE_LOOK[route].icon))}
        </div>
        {context ? (
          <div>
            <ContextChip context={context} onClear={editor ? onClearContext : undefined} />
          </div>
        ) : null}
      </div>
      <div className="relative min-w-0">{composer(starter)}</div>
      {editor && !context ? (
        <div className="relative flex flex-wrap gap-2">
          {STARTERS.map((line) => (
            <button
              key={line}
              type="button"
              onClick={() => setStarter(line)}
              className="flex items-start gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {line}
            </button>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

const RESULT_LOOK: Record<NonNullable<ChatDetail["result"]>["state"], { icon: LucideIcon; tone: string; spin?: boolean }> = {
  running: { icon: LoaderCircle, tone: "border-primary/30 bg-primary/[0.06] text-primary", spin: true },
  waiting: { icon: MessageCircleQuestion, tone: "border-warning/40 bg-warning/[0.07] text-warning" },
  done: { icon: CheckCircle2, tone: "border-success/40 bg-success/[0.07] text-success" },
  stopped: { icon: Square, tone: "border-border bg-muted/40 text-muted-foreground" },
};

/** Where the work a conversation started stands, with a link to its result in the tab it belongs to. */
export function ResultLink({ result, base }: { result: NonNullable<ChatDetail["result"]>; base: string }) {
  const look = RESULT_LOOK[result.state];
  const tab = { research: "Research", offers: "Offers", diagnostics: "Diagnostics" }[result.tab];
  const words =
    result.state === "done"
      ? { title: `Finished: ${result.title ?? "your result"}`, detail: result.assetStatus === "approved" ? `Approved. It is in ${tab}.` : `It is in ${tab}, waiting for your review.`, action: `Open in ${tab}` }
      : result.state === "waiting"
        ? { title: "It has a question for you", detail: `The work is paused in ${tab} until you answer.`, action: "Answer it" }
        : result.state === "running"
          ? { title: "Working on it", detail: `Follow each step in ${tab}. The result lands there for you to review.`, action: `Follow in ${tab}` }
          : { title: "This run stopped before it finished", detail: `See what happened in ${tab}.`, action: `Open ${tab}` };
  return (
    <Link href={`${base}${result.path}`} className={cn("group flex items-start gap-3 rounded-2xl border p-3 transition-colors hover:border-primary/50 sm:p-4", look.tone)}>
      <look.icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", look.spin && "animate-spin motion-reduce:animate-none")} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-sm font-medium break-words text-card-foreground">{words.title}</span>
        <span className="text-xs text-muted-foreground">{words.detail}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-card-foreground">
        {words.action} <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** The open conversation: what it is about, the conversation itself, and the link to its result. */
export function ConversationFrame({ chat, base, children }: { chat: Pick<ChatDetail, "route" | "title" | "status" | "context" | "result">; base: string; children: ReactNode }) {
  const look = chat.route ? ROUTE_LOOK[chat.route] : null;
  const status = chatStatus(chat);
  return (
    <section aria-label="Conversation" className="grid min-w-0 content-start gap-4">
      <header className="grid gap-2 border-b border-border pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="min-w-0 font-heading text-lg break-words text-foreground">{chat.title}</h1>
          <StatusBadge label={status.label} tone={status.tone === "primary" ? "neutral" : status.tone} className="[&_span]:normal-case" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {look ? (
            <span className="inline-flex items-center gap-1.5">
              <look.icon aria-hidden className="size-3.5 text-primary" /> {look.work} · results go to {look.tab}
            </span>
          ) : (
            <span>Not routed yet: it is asking what you want it to do.</span>
          )}
          {chat.context ? <ContextChip context={chat.context} /> : null}
        </div>
      </header>
      {chat.result ? <ResultLink result={chat.result} base={base} /> : null}
      {children}
    </section>
  );
}

/**
 * The Chat tab: where a new session starts, with every previous chat in a dropdown above it. The open
 * conversation, or the box for a new one, has the full width.
 */
export function ChatLayout({ list, count, children }: { list: ReactNode; count?: number; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4">
      <details className="group min-w-0 rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm text-card-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <MessagesSquare aria-hidden className="size-4 text-primary" />
            Previous chats
            {count !== undefined ? <span className="rounded-md bg-overlay/[0.06] px-1.5 text-xs text-muted-foreground tabular-nums">{count}</span> : null}
          </span>
          <ChevronDown aria-hidden className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="max-h-[60dvh] overflow-y-auto border-t border-border p-3">{list}</div>
      </details>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function asData(chat: ChatDetail): SkillChatData {
  return { intake: { id: chat.id, skillSlug: null, status: chat.status, asking: "skill", answers: {}, runId: null, projectId: null, questions: [] }, messages: chat.messages };
}

function LiveNewChat({ workspaceId, base, agentName, editor, preset, ask, context }: { workspaceId: Id<"workspaces">; base: string; agentName: string; editor: boolean; preset: ChatRoute | null; ask?: string; context: ChatContext | null }) {
  const router = useRouter();
  const shell = useWorkspaceShell();
  const send = useMutation(api.agentChat.send);
  const { clientId } = useClientScope();
  const [route, setRoute] = useState<ChatRoute | null>(preset);
  // The switch offers only models that can run the skill this chat is set to.
  const extras = useChatExtras(workspaceId, editor, shell?.role === "owner", route ?? undefined);
  const [attached, setAttached] = useState<ChatContext | null>(context);
  const [problem, setProblem] = useState("");
  const research = route === "market-intelligence";
  return (
    <div className="grid gap-1">
      <NewChatView
        agentName={agentName}
        editor={editor}
        preset={route}
        onPreset={setRoute}
        context={attached}
        onClearContext={() => setAttached(null)}
        composer={(starter) => (
          <ChatComposer
            key={starter}
            size="hero"
            autoFocus={editor}
            placeholder={!editor ? "Owners, Admins and Members start work. You can read every conversation." : route ? ROUTE_LOOK[route].hint : "Ask about your market, your offer or your growth…"}
            initialText={starter || ask}
            disabled={!editor}
            {...(research ? extras.composer : { model: extras.composer.model })}
            footnote="It asks only what it needs, then shows a plan with its budget. Nothing runs or spends until you press Start."
            onSubmit={async (text) => {
              setProblem("");
              try {
                const result = await send({
                  workspaceId,
                  ...(clientId ? { clientId } : {}),
                  text,
                  ...(route ? { skill: route } : {}),
                  ...(extras.model ? { model: extras.model } : {}),
                  ...(attached ? { context: { kind: attached.kind, id: attached.id } } : {}),
                  ...(research ? { mode: extras.mode, ...(extras.sources ? { platforms: extras.sources } : {}), ...(extras.links.length ? { links: extras.links } : {}) } : {}),
                });
                if (result.route === "market-intelligence") await extras.attachTo({ intakeId: result.intakeId });
                extras.reset();
                router.push(`${base}/work/chat?c=${result.intakeId}`);
              } catch (error) {
                setProblem(showError(error, "That was not sent."));
                throw error;
              }
            }}
          />
        )}
      />
      {problem || extras.problem ? <p className="px-1 text-xs text-destructive">{problem || extras.problem}</p> : null}
    </div>
  );
}

function LiveConversation({ workspaceId, base, slug, agentName, intakeId, editor }: { workspaceId: Id<"workspaces">; base: string; slug: string; agentName: string; intakeId: Id<"intakes">; editor: boolean }) {
  const router = useRouter();
  const chat = useQuery(api.agentChat.get, { workspaceId, intakeId });
  const send = useMutation(api.agentChat.send);
  const close = useMutation(api.agentChat.close);
  if (chat === undefined) return <p className="text-sm text-muted-foreground">Loading the conversation.</p>;
  const leave = () => router.push(`${base}/work/chat`);
  return (
    <ConversationFrame chat={chat} base={base}>
      {chat.route === "market-intelligence" ? (
        <IntakeChat key={intakeId} workspaceId={workspaceId} agentSlug={slug} agentName={agentName} intakeId={intakeId} editor={editor} />
      ) : chat.checklist ? (
        <SkillConversation key={intakeId} workspaceId={workspaceId} intakeId={intakeId} editor={editor} onClosed={leave} />
      ) : (
        <SkillChatView
          key={intakeId}
          data={asData(chat)}
          editor={editor}
          placeholder="Say which, or tap a choice…"
          onSend={async (text) => {
            await send({ workspaceId, intakeId, text });
          }}
          onStart={async () => undefined}
          onReset={() => void close({ workspaceId, intakeId }).then(leave)}
        />
      )}
    </ConversationFrame>
  );
}

/**
 * The Chat tab fed by Convex: the one place to talk to the agent. `c` opens a past conversation; `skill`
 * presets where a new one goes; `ask` fills the box; `context` is an item attached with "Refine in chat".
 */
export function AgentChat({
  workspaceId,
  base,
  slug,
  agentName,
  editor,
  conversationId,
  skill,
  ask,
  context,
}: {
  workspaceId: Id<"workspaces">;
  base: string;
  slug: string;
  agentName: string;
  editor: boolean;
  conversationId: Id<"intakes"> | null;
  skill?: string | null;
  ask?: string;
  context: ChatContext | null;
}) {
  const { scope } = useClientScope();
  const rows = useQuery(api.agentChat.list, { workspaceId, scope });
  const preset = isChatRoute(skill) ? skill : null;
  return (
    <ChatLayout count={rows?.length} list={<ConversationList rows={rows} activeId={conversationId} base={base} canStart={editor} />}>
      {conversationId ? (
        <LiveConversation workspaceId={workspaceId} base={base} slug={slug} agentName={agentName} intakeId={conversationId} editor={editor} />
      ) : (
        <LiveNewChat key={`${preset ?? "any"}:${context?.id ?? ""}:${ask ?? ""}`} workspaceId={workspaceId} base={base} agentName={agentName} editor={editor} preset={preset} ask={ask} context={context} />
      )}
    </ChatLayout>
  );
}

/** A link that opens the Chat tab on one skill, with text filled in or an item attached. Nothing is sent. */
export function chatLink(base: string, input: { skill?: ChatRoute; ask?: string; context?: ChatContext } = {}) {
  const query = new URLSearchParams();
  if (input.skill) query.set("skill", input.skill);
  if (input.ask) query.set("ask", input.ask);
  if (input.context) {
    query.set("ref", `${input.context.kind}:${input.context.id}`);
    query.set("about", input.context.title.slice(0, 120));
  }
  const rest = query.toString();
  return `${base}/work/chat${rest ? `?${rest}` : ""}`;
}

/** Reads the attached item back out of the Chat tab's link. The server checks it again when the message is sent. */
export function contextFromQuery(ref: string | null, about: string | null): ChatContext | null {
  const match = ref?.match(/^(asset|offer):([\w-]{1,64})$/);
  return match ? { kind: match[1] as "asset" | "offer", id: match[2], title: about?.slice(0, 120) || (match[1] === "offer" ? "Your offer" : "A result") } : null;
}
