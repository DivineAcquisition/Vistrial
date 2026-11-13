"use client";

/**
 * Library > Chats: every chat started in this organization that you may see, whatever screen it started
 * from. The sidebar shows the newest few in a dropdown; the page lists them all. A chat opens as the full
 * conversation in the Chat tab. Views hold no data; the Live components feed them from Convex.
 */
import { useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

import { ROUTE_LOOK, chatStatus } from "@/components/chat/agent-chat";
import { useChatPanel, type LibraryRow } from "@/components/chat/side-panel";
import { MessageCircleQuestion, MessagesSquare, Plus } from "@/components/icons";
import { useClientScope, useWorkspaceShell } from "@/components/shell/shell-context";
import { Button } from "@/components/ui/button";
import { canWork } from "@/lib/roles";
import { shortDate } from "@/lib/research/words";
import { cn } from "@/lib/utils";

import { api } from "../../../convex/_generated/api";

const BASE = "/app/agents/growth-architect";
export const chatHrefOf = (id: string) => `${BASE}/work/chat?c=${id}`;
const TONE: Record<string, string> = { neutral: "text-muted-foreground", warning: "text-warning", good: "text-success", primary: "text-primary" };

/** The newest chats, for the sidebar's dropdown under Library > Chats. */
export function ChatListView({ rows, onNavigate }: { rows: Pick<LibraryRow, "id" | "title" | "client">[] | undefined; onNavigate?: () => void }) {
  if (rows === undefined) return <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading.</p>;
  return (
    <ul className="grid gap-0.5">
      {rows.length === 0 ? <li className="px-2 py-1.5 text-xs text-muted-foreground">No chats yet. Start one from Home or Ask Vistrial.</li> : null}
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={chatHrefOf(row.id)} onClick={onNavigate} className="grid min-w-0 gap-0.5 rounded-md px-2 py-1.5 text-[13px] text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
            <span className="truncate">{row.title}</span>
            {row.client ? <span className="truncate text-[11px] text-muted-foreground">{row.client}</span> : null}
          </Link>
        </li>
      ))}
      <li>
        <Link href="/app/chats" onClick={onNavigate} className="block rounded-md px-2 py-1.5 text-xs text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          All chats
        </Link>
      </li>
    </ul>
  );
}

export function LiveChatList({ onNavigate }: { onNavigate?: () => void }) {
  const shell = useWorkspaceShell();
  const { scope } = useClientScope();
  const chats = useQuery(api.agentChat.library, shell ? { workspaceId: shell.workspaceId, scope, limit: 8 } : "skip");
  return <ChatListView rows={chats?.items} onNavigate={onNavigate} />;
}

const filter = "inline-flex h-8 items-center rounded-full border px-3 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

/** The page: every chat, newest first, with who it is for, which agent it went to and where it stands. */
export function ChatLibraryView({
  rows,
  more,
  mine,
  closed,
  onMine,
  onClosed,
  canStart,
  onNew,
}: {
  rows: LibraryRow[] | undefined;
  more: boolean;
  mine: boolean;
  closed: boolean;
  onMine: (on: boolean) => void;
  onClosed: (on: boolean) => void;
  canStart: boolean;
  /** Opens the side panel on a new chat. Missing where there is no panel. */
  onNew?: () => void;
}) {
  return (
    <div className="mx-auto grid w-full max-w-4xl min-w-0 gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <h1 className="font-heading text-2xl text-foreground">Chats</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">Every chat started here, from Home, Ask Vistrial or the Chat tab. Each one appears once. The client picker narrows the list.</p>
        </div>
        {canStart && onNew ? (
          <Button size="sm" onClick={onNew}>
            <Plus aria-hidden className="size-4" /> New chat
          </Button>
        ) : null}
      </header>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Which chats">
        <button type="button" aria-pressed={!mine} onClick={() => onMine(false)} className={cn(filter, !mine ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
          Everyone&apos;s
        </button>
        <button type="button" aria-pressed={mine} onClick={() => onMine(true)} className={cn(filter, mine ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
          Mine
        </button>
        <button type="button" aria-pressed={closed} onClick={() => onClosed(!closed)} className={cn(filter, closed ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
          Include set aside
        </button>
      </div>
      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading the chats.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          {mine ? "You have not started a chat here yet." : "No chats yet."} Start one from Home, or from Ask Vistrial at the top right of any page.
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row) => {
            const look = row.route ? ROUTE_LOOK[row.route] : null;
            const Icon = look?.icon ?? MessageCircleQuestion;
            const status = chatStatus(row);
            return (
              <li key={row.id}>
                <Link href={chatHrefOf(row.id)} className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-overlay/[0.06]">
                    <Icon aria-hidden className={cn("size-4", look ? "text-primary" : "text-warning")} />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="text-sm break-words text-card-foreground">{row.title}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                      {row.client ? <span className="rounded-md border border-primary/30 px-1.5 text-primary">{row.client}</span> : null}
                      <span>{look ? `Strategist · ${look.skill}` : "Not handed to an agent yet"}</span>
                      <span aria-hidden>·</span>
                      <span className={TONE[status.tone]}>{status.label}</span>
                      {row.page ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>started on {row.page}</span>
                        </>
                      ) : null}
                      <span aria-hidden>·</span>
                      <span>{shortDate(row.updatedAt)}</span>
                      {row.mine ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>yours</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {more ? <p className="text-xs text-muted-foreground">Showing the newest 100. Older chats are still kept; narrow the list with the client picker or Mine to find them.</p> : null}
    </div>
  );
}

export function ChatLibrary() {
  const shell = useWorkspaceShell();
  const panel = useChatPanel();
  const { scope } = useClientScope();
  const [mine, setMine] = useState(false);
  const [closed, setClosed] = useState(false);
  const chats = useQuery(api.agentChat.library, shell ? { workspaceId: shell.workspaceId, scope, limit: 100, mine, closed } : "skip");
  if (!shell) return null;
  return (
    <ChatLibraryView
      rows={chats?.items}
      more={chats?.more ?? false}
      mine={mine}
      closed={closed}
      onMine={setMine}
      onClosed={setClosed}
      canStart={canWork(shell.role)}
      onNew={
        panel
          ? () => {
              panel.setChatId(null);
              panel.setOpen(true);
            }
          : undefined
      }
    />
  );
}

/** The icon the sidebar uses for Library > Chats. */
export const ChatsIcon = MessagesSquare;
