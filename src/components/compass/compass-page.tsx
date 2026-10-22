"use client";

import type { UIMessage } from "ai";
import { MenuIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { listConversationsAction, loadLegacyConversationAction, loadMessagesAction } from "@/app/(workspace)/app/compass/actions";
import { CompassChatProvider } from "@/components/compass/chat";
import { ConversationList } from "@/components/compass/conversation-list";
import { CompassThread } from "@/components/compass/thread";
import { COMPASS_OPEN_EVENT, type CompassOpenDetail } from "@/components/compass/panel";
import { CompassWelcome, type PinnedQuestion } from "@/components/compass/welcome";
import { Button } from "@/components/ui/button";
import { Sheet, SheetPopup, SheetTrigger } from "@/components/ui/sheet";
import { toastManager } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ConversationRow } from "@/lib/compass/persist";
import type { Starter } from "@/lib/compass/starters";
import type { AgentIntent } from "@/lib/agent-elements/intent";
import type { CompassContext } from "@/lib/compass/types";

type Active = { chatKey: string; conversationId: string | null; messages: UIMessage[]; legacy: boolean; context: CompassContext; intent: AgentIntent };

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`;
}

function setUrl(id: string | null, legacy = false) {
  const url = new URL(window.location.href);
  url.searchParams.delete("q");
  url.searchParams.delete("c");
  url.searchParams.delete("legacy");
  if (id) url.searchParams.set("c", id);
  if (id && legacy) url.searchParams.set("legacy", "1");
  window.history.replaceState(window.history.state, "", url);
}

export function CompassPage({
  rows: initialRows,
  initial,
  starters,
  pins,
  staffNote,
  prefill,
}: {
  rows: ConversationRow[];
  initial: { conversationId: string | null; messages: UIMessage[]; legacy: boolean; context: CompassContext };
  starters: Starter[];
  pins: PinnedQuestion[];
  staffNote: string | null;
  prefill: string | null;
}) {
  const [rows, setRows] = useState(initialRows);
  const [active, setActive] = useState<Active>(() => ({ chatKey: initial.conversationId ?? newKey(), intent: "lookup", ...initial }));
  const [prefillText, setPrefillText] = useState(prefill);
  const [sendPrefill, setSendPrefill] = useState(false);
  const [railOpen, setRailOpen] = useState(false);

  const refresh = useCallback(async () => {
    setRows(await listConversationsAction());
  }, []);

  const startNew = useCallback(() => {
    setActive({ chatKey: newKey(), conversationId: null, messages: [], legacy: false, context: { kind: "none" }, intent: "lookup" });
    setPrefillText(null);
    setSendPrefill(false);
    setUrl(null);
    setRailOpen(false);
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<CompassOpenDetail>).detail;
      if (!detail?.question || detail.intent === "propose") return;
      setActive({
        chatKey: newKey(),
        conversationId: null,
        messages: [],
        legacy: false,
        context: { kind: "none" },
        intent: detail.intent ?? "lookup",
      });
      setPrefillText(detail.question);
      setSendPrefill(detail.send === true);
      setUrl(null);
    };
    window.addEventListener(COMPASS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COMPASS_OPEN_EVENT, onOpen);
  }, []);

  const select = useCallback(async (row: ConversationRow) => {
    setRailOpen(false);
    setPrefillText(null);
    setSendPrefill(false);
    const messages = row.legacy ? await loadLegacyConversationAction(row.id) : await loadMessagesAction(row.id);
    if (!messages) {
      toastManager.add({ title: "That conversation isn't available.", type: "error" });
      return;
    }
    setActive({ chatKey: row.id, conversationId: row.id, messages, legacy: row.legacy, context: row.context ?? { kind: "none" }, intent: "lookup" });
    setUrl(row.id, row.legacy);
  }, []);

  const list = (
    <ConversationList
      rows={rows}
      activeId={active.conversationId}
      onSelect={select}
      onNew={startNew}
      onChanged={(next, removedId) => {
        setRows(next);
        if (removedId && removedId === active.conversationId) startNew();
      }}
    />
  );

  const contextLabel = active.context.kind === "none" ? null : (active.context.label ?? null);

  return (
    <TooltipProvider>
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-e border-border px-3 py-3 lg:block" aria-label="Your Compass conversations">
          {list}
        </aside>
        <main className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
            <Sheet open={railOpen} onOpenChange={setRailOpen}>
              <SheetTrigger render={<Button variant="ghost" size="sm" />}>
                <MenuIcon aria-hidden />
                Conversations
              </SheetTrigger>
              <SheetPopup side="left" className="px-3 pt-12 pb-3">
                {list}
              </SheetPopup>
            </Sheet>
          </div>
          <div className="min-h-0 flex-1">
            <CompassChatProvider
              key={active.chatKey}
              chatKey={active.chatKey}
              conversationId={active.conversationId}
              initialMessages={active.messages}
              origin="page"
              context={active.context}
              initialIntent={active.intent}
              readOnly={active.legacy}
              onConversation={(id) => {
                setActive((prev) => ({ ...prev, conversationId: id }));
                setUrl(id);
                void refresh();
              }}
              onSettled={() => void refresh()}
            >
              <CompassThread
                welcome={<CompassWelcome starters={starters} pins={pins} staffNote={staffNote} />}
                prefill={prefillText}
                sendPrefill={sendPrefill}
                contextChip={
                  contextLabel && !active.legacy
                    ? { label: contextLabel, onRemove: () => setActive((prev) => ({ ...prev, context: { kind: "none" } })) }
                    : null
                }
              />
            </CompassChatProvider>
          </div>
        </main>
      </div>
    </TooltipProvider>
  );
}
