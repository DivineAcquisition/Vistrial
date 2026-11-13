"use client";

/**
 * The side chat panel (step 3): one assistant on every page. It is told the screen you are on, the client
 * chosen in the picker and the record that is open, hands the work to the right agent, and says which
 * agent and skill it used. It never starts work that spends credits: when a plan is ready it links to the
 * full conversation, where the plan and its cost are shown before Start.
 *
 * A chat started here is the same record as one started on Home or in the Chat tab, so it appears once in
 * Library > Chats. The view (`ChatPanelView`) holds no data; `LiveChatPanel` feeds it from Convex.
 */
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { CONTEXT_LABEL, ROUTE_LOOK, chatStatus, type ChatDetail } from "@/components/chat/agent-chat";
import { ChatComposer } from "@/components/chat/chat-composer";
import type { ModelSwitchProps } from "@/components/models/model-switch";
import { useConversationModel, useModelChoice } from "@/components/models/use-model-choice";
import { ArrowRight, MapPin, MessagesSquare, Paperclip, Plus, Users, X } from "@/components/icons";
import { useClientScope, useWorkspaceShell } from "@/components/shell/shell-context";
import { showError } from "@/lib/errors/show-error";
import { canWork } from "@/lib/roles";
import { RECORD_WORDS, chatPageOf, type OpenRecord } from "@/lib/shell/chat-page";
import { cn } from "@/lib/utils";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CHAT_PAGES, type ChatPage } from "../../../convex/lib/chatContext";

export type LibraryRow = FunctionReturnType<typeof api.agentChat.library>["items"][number];

type PanelState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** The conversation shown, or null for a new one. */
  chatId: string | null;
  setChatId: (id: string | null) => void;
  /** A record a screen asked the panel to be about ("Ask about this task"). It wins over the address. */
  record: OpenRecord | null;
  /** Opens the panel on a new chat about one record. */
  openAbout: (record: OpenRecord) => void;
};

const PanelContext = createContext<PanelState | null>(null);
const STORE_KEY = "vistrial.chatPanel.v1";

/** Null outside the app shell (a story, a public page): callers render nothing. */
export function useChatPanel() {
  return useContext(PanelContext);
}

type Saved = { open: boolean; chatId: string | null };
const CLOSED: Saved = { open: false, chatId: null };
const CHANGED = "vistrial:chat-panel";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGED, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGED, listener);
  };
}

function readStore(): string | null {
  try {
    return window.localStorage.getItem(STORE_KEY);
  } catch {
    // A blocked store only means the panel starts closed.
    return null;
  }
}

function parse(raw: string | null): Saved {
  try {
    const saved = JSON.parse(raw ?? "null") as Partial<Saved> | null;
    return { open: saved?.open === true, chatId: typeof saved?.chatId === "string" ? saved.chatId : null };
  } catch {
    return CLOSED;
  }
}

/**
 * Holds whether the panel is open and which conversation it shows. Both are kept per browser, so the panel
 * stays as it was while you move between pages and when you come back. `initial` is for stories: it keeps
 * the state in memory and never touches the browser's store.
 */
export function ChatPanelProvider({ children, initial }: { children: ReactNode; initial?: Partial<Saved> }) {
  const raw = useSyncExternalStore(subscribe, readStore, () => null);
  const [local, setLocal] = useState<Saved | null>(initial ? { ...CLOSED, ...initial } : null);
  const [record, setRecord] = useState<OpenRecord | null>(null);
  const stored = useMemo(() => parse(raw), [raw]);
  const { open, chatId } = local ?? stored;

  const save = useCallback(
    (next: Saved) => {
      if (local) return setLocal(next);
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
      } catch {
        // Nothing to do: without a store the panel cannot stay open across pages.
      }
      window.dispatchEvent(new Event(CHANGED));
    },
    [local],
  );

  const value = useMemo<PanelState>(
    () => ({
      open,
      chatId,
      record,
      setOpen: (next) => {
        if (!next) setRecord(null);
        save({ open: next, chatId });
      },
      setChatId: (id) => {
        setRecord(null);
        save({ open, chatId: id });
      },
      openAbout: (about) => {
        setRecord(about);
        save({ open: true, chatId: null });
      },
    }),
    [open, chatId, record, save],
  );
  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

/** The button at the top right of every page. It says whether the panel is open. */
export function AskButton({ className }: { className?: string }) {
  const panel = useChatPanel();
  if (!panel) return null;
  return (
    <button
      type="button"
      aria-expanded={panel.open}
      aria-controls="chat-panel"
      onClick={() => panel.setOpen(!panel.open)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        panel.open ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-foreground hover:bg-accent",
        className,
      )}
    >
      <MessagesSquare aria-hidden className="size-4 text-primary" />
      Ask Vistrial
    </button>
  );
}

export type PanelChips = {
  /** The screen, in words: "Tasks". Null when the screen is not one the panel names. */
  page: string | null;
  /** Who a new chat is for: a client's name, or null for the organization itself. */
  client: string | null;
  record: { label: string; title: string } | null;
};

const chip = "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border py-1 pr-1.5 pl-2.5 text-xs text-card-foreground";
const remove = "flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-overlay/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";
const quiet = "text-xs leading-relaxed text-muted-foreground";

/** What a new chat will be told, as chips. The page and the record can be removed before sending; the client follows the picker. */
function Chips({ chips, onRemovePage, onRemoveRecord }: { chips: PanelChips; onRemovePage?: () => void; onRemoveRecord?: () => void }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
      <p className={quiet}>This chat will be told:</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="What this chat will be told">
        {chips.page ? (
          <li className={chip}>
            <MapPin aria-hidden className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">
              <span className="text-muted-foreground">You are on:</span> {chips.page}
            </span>
            {onRemovePage ? (
              <button type="button" aria-label="Do not tell it which page I am on" onClick={onRemovePage} className={remove}>
                <X aria-hidden className="size-3" />
              </button>
            ) : null}
          </li>
        ) : null}
        <li className={cn(chip, "pr-2.5")}>
          <Users aria-hidden className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">
            <span className="text-muted-foreground">For:</span> {chips.client ?? "your organization itself"}
          </span>
        </li>
        {chips.record ? (
          <li className={chip}>
            <Paperclip aria-hidden className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">
              <span className="text-muted-foreground">{chips.record.label}</span> {chips.record.title}
            </span>
            {onRemoveRecord ? (
              <button type="button" aria-label="Do not attach what is open" onClick={onRemoveRecord} className={remove}>
                <X aria-hidden className="size-3" />
              </button>
            ) : null}
          </li>
        ) : null}
      </ul>
      <p className={quiet}>Change who it is for in the client picker.</p>
    </div>
  );
}

type PanelMessage = ChatDetail["messages"][number];

/** One conversation, compact: what was said, which agent it went to, and where the work stands. */
function Conversation({ chat, base, canSend, onSend }: { chat: ChatDetail; base: string; canSend: boolean; onSend: (text: string) => Promise<void> }) {
  const look = chat.route ? ROUTE_LOOK[chat.route] : null;
  const status = chatStatus(chat);
  const last = chat.messages[chat.messages.length - 1] as PanelMessage | undefined;
  const full = `${base}/work/chat?c=${chat.id}`;
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat.messages.length]);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-3">
      <div className="grid gap-1 rounded-xl border border-border bg-overlay/[0.03] px-3 py-2.5 text-xs text-muted-foreground">
        {look ? (
          <p className="flex items-center gap-1.5 text-card-foreground">
            <look.icon aria-hidden className="size-3.5 shrink-0 text-primary" />
            <span>
              Handed to Strategist · {look.skill}
            </span>
          </p>
        ) : (
          <p className="text-card-foreground">Not handed to an agent yet: it is asking which you want.</p>
        )}
        <p>
          {status.label}
          {look ? ` · results go to ${look.tab}` : ""}
          {chat.page ? ` · started on ${chat.page}` : ""}
        </p>
        {chat.context ? (
          <p className="truncate">
            {CONTEXT_LABEL[chat.context.kind]} <span className="text-card-foreground">{chat.context.title}</span>
          </p>
        ) : null}
      </div>

      <ol className="grid gap-2" aria-label="Messages">
        {chat.messages.map((message) =>
          message.role === "you" ? (
            <li key={message.id} className="ml-6 justify-self-end rounded-2xl rounded-br-md bg-primary/10 px-3 py-2 text-sm break-words text-card-foreground">
              {message.text}
            </li>
          ) : (
            <li key={message.id} className="mr-6 grid gap-1.5 text-sm break-words text-card-foreground">
              <p className="whitespace-pre-wrap">{message.kind === "plan" ? "The plan and its budget are ready." : message.text}</p>
              {message.id === last?.id && message.chips.length > 0 && canSend && chat.status !== "started" ? (
                <div className="flex flex-wrap gap-1.5">
                  {message.chips.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => void onSend(text).catch(() => undefined)}
                      className="rounded-full border border-border px-2.5 py-1 text-xs text-card-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              ) : null}
            </li>
          ),
        )}
      </ol>
      <div ref={end} />

      {chat.status === "ready" ? (
        <Link href={full} className="flex items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/[0.07] px-3 py-2.5 text-sm text-card-foreground outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring">
          <span>
            Review the plan and its cost, then start
            <span className="block text-xs text-muted-foreground">Nothing runs or spends until you press Start there.</span>
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-primary" />
        </Link>
      ) : null}
      {chat.result ? (
        <Link href={`${base}${chat.result.path}`} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-card-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
          <span>
            {chat.result.state === "done" ? (chat.result.title ?? "Open the result") : chat.result.state === "waiting" ? "The agent has a question" : chat.result.state === "stopped" ? "The work stopped. Open it to see why." : "The agent is working. Open it."}
            <span className="block text-xs text-muted-foreground">In {look?.tab ?? "its tab"}</span>
          </span>
          <ArrowRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        </Link>
      ) : null}
      <Link href={full} className="justify-self-start text-xs text-primary underline-offset-2 hover:underline">
        Open the full conversation
      </Link>
    </div>
  );
}

export type ChatPanelViewProps = {
  /** Recent chats for the dropdown. Undefined while loading. */
  chats: LibraryRow[] | undefined;
  /** The open conversation: undefined while loading, null for a new chat. */
  chat: ChatDetail | null | undefined;
  chatId: string | null;
  /** Owners, Admins and Members send. A Viewer reads. */
  canSend: boolean;
  chips: PanelChips;
  onRemovePage?: () => void;
  onRemoveRecord?: () => void;
  onSelect: (id: string | null) => void;
  onSend: (text: string) => Promise<void>;
  onClose: () => void;
  /** The Strategist's pages, for links to the full conversation and results. */
  base: string;
  /** The model switch for the chat shown. Left out where no model can be chosen. */
  model?: ModelSwitchProps | null;
  problem?: string;
};

/**
 * The panel. On a wide screen it is a column on the right that stays while pages change; on a phone or
 * tablet it is a full-height sheet over the page. Escape closes the sheet.
 */
export function ChatPanelView({ chats, chat, chatId, canSend, chips, onRemovePage, onRemoveRecord, onSelect, onSend, onClose, base, problem, model }: ChatPanelViewProps) {
  const isNew = chatId === null;
  const ended = chat?.status === "abandoned";
  const started = chat?.status === "started";
  return (
    <aside
      id="chat-panel"
      aria-label="Ask Vistrial"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-50 flex w-full min-w-0 flex-col overflow-hidden bg-background lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:h-dvh lg:w-[24rem] lg:shrink-0 lg:border-l lg:border-border print:hidden"
    >
      <header className="grid grid-cols-[minmax(0,1fr)] gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-heading text-base text-foreground">
            <MessagesSquare aria-hidden className="size-4 text-primary" /> Ask Vistrial
          </h2>
          <button type="button" aria-label="Close the chat panel" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor="chat-panel-pick" className="sr-only">
            Chat shown
          </label>
          <select
            id="chat-panel-pick"
            value={chatId ?? ""}
            onChange={(event) => onSelect(event.target.value || null)}
            className="h-9 w-0 min-w-0 flex-1 truncate rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">New chat</option>
            {chatId && !(chats ?? []).some((row) => row.id === chatId) ? <option value={chatId}>{chat?.title ?? "This chat"}</option> : null}
            {(chats ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.title.slice(0, 70)}
                {row.client ? ` · ${row.client}` : ""}
              </option>
            ))}
          </select>
          {!isNew ? (
            <button type="button" onClick={() => onSelect(null)} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2.5 text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
              <Plus aria-hidden className="size-4" /> New
            </button>
          ) : null}
        </div>
        <Link href="/app/chats" className="justify-self-start text-xs text-primary underline-offset-2 hover:underline">
          All chats
        </Link>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {isNew ? (
          <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4">
            <div className="grid gap-1.5">
              <p className="font-heading text-lg text-foreground">What do you want to work on?</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                One assistant on every page. It hands your question to the right agent and tells you which. It asks what it needs, then shows a plan and its cost. Nothing runs or spends until you press Start.
              </p>
            </div>
            <Chips chips={chips} onRemovePage={onRemovePage} onRemoveRecord={onRemoveRecord} />
            {!canSend ? <p className={quiet}>Owners, Admins and Members start chats. You can read every chat you have access to from the list above.</p> : null}
          </div>
        ) : chat === undefined ? (
          <p className="text-sm text-muted-foreground">Loading the chat.</p>
        ) : chat === null ? (
          <p className="text-sm text-muted-foreground">That chat is not here any more. Choose another, or start a new one.</p>
        ) : (
          <Conversation chat={chat} base={base} canSend={canSend} onSend={onSend} />
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-1 border-t border-border px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {ended ? (
          <p className={cn(quiet, "px-1")}>This chat was set aside. Start a new one.</p>
        ) : started ? (
          <p className={cn(quiet, "px-1")}>The work has started. Follow it from the link above, or start a new chat.</p>
        ) : (
          <ChatComposer
            key={chatId ?? "new"}
            size="compact"
            placeholder={!canSend ? "Owners, Admins and Members start chats." : isNew ? "Ask about your market, your offer or your growth…" : "Answer, or tap a choice…"}
            disabled={!canSend || (!isNew && !chat)}
            model={canSend ? model : null}
            onSubmit={onSend}
          />
        )}
        {problem ? <p className="px-1 text-xs text-destructive">{problem}</p> : null}
      </div>
    </aside>
  );
}

/** The panel fed by Convex. Renders nothing while closed, so a closed panel reads and costs nothing. */
export function LiveChatPanel() {
  const panel = useChatPanel();
  const shell = useWorkspaceShell();
  if (!panel?.open || !shell) return null;
  return <OpenPanel panel={panel} workspaceId={shell.workspaceId} />;
}

function OpenPanel({ panel, workspaceId }: { panel: PanelState; workspaceId: Id<"workspaces"> }) {
  const shell = useWorkspaceShell()!;
  const pathname = usePathname();
  const { scope, clientId } = useClientScope();
  const here = chatPageOf(pathname);
  const [hidePage, setHidePage] = useState<string | null>(null);
  const [hideRecord, setHideRecord] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const chats = useQuery(api.agentChat.library, { workspaceId, scope, limit: 25 });
  const intakeId = panel.chatId as Id<"intakes"> | null;
  const detail = useQuery(api.agentChat.get, intakeId ? { workspaceId, intakeId } : "skip");
  const send = useMutation(api.agentChat.send);
  // A new chat carries the model picked here; a chat that exists keeps its own, changeable until its work starts.
  const fresh = useModelChoice(workspaceId);
  const ongoing = useConversationModel(workspaceId, intakeId && detail ? { id: intakeId, route: detail.route, model: detail.model, started: detail.status === "started", mine: detail.mine } : null);

  // What a new chat is told. Removing a chip lasts until the page or the record changes.
  const page: ChatPage | null = here.page && hidePage !== pathname ? here.page : null;
  const found = panel.record ?? here.record;
  const record = found && hideRecord !== `${found.kind}:${found.id}` ? found : null;
  const client = clientId ? ((shell.clients ?? []).find((row) => row.id === clientId)?.name ?? "The client chosen") : null;

  return (
    <ChatPanelView
      chats={chats?.items}
      chat={intakeId ? detail : null}
      chatId={panel.chatId}
      canSend={canWork(shell.role)}
      chips={{ page: page ? CHAT_PAGES[page] : null, client, record: record ? { label: record.kind === "asset" || record.kind === "offer" ? "Open:" : record.kind === "task" ? "About this task:" : "About this session:", title: record.title ?? RECORD_WORDS[record.kind] } : null }}
      onRemovePage={() => setHidePage(pathname)}
      onRemoveRecord={() => setHideRecord(found ? `${found.kind}:${found.id}` : null)}
      onSelect={(id) => {
        setProblem("");
        panel.setChatId(id);
      }}
      onClose={() => panel.setOpen(false)}
      base="/app/agents/growth-architect"
      model={intakeId ? ongoing : fresh.props}
      problem={problem}
      onSend={async (text) => {
        setProblem("");
        try {
          const result = await send(
            intakeId
              ? { workspaceId, intakeId, text }
              : { workspaceId, text, ...(fresh.picked ? { model: fresh.picked } : {}), ...(clientId ? { clientId } : {}), ...(page ? { page } : {}), ...(record ? { context: { kind: record.kind, id: record.id } } : {}) },
          );
          if (!intakeId) panel.setChatId(result.intakeId);
        } catch (error) {
          setProblem(showError(error, "That was not sent."));
          throw error;
        }
      }}
    />
  );
}
