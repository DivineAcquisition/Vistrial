"use client";

import { CompassIcon, ExternalLinkIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { panelStateAction, type PanelState } from "@/app/(workspace)/app/compass/actions";
import { CompassChatProvider } from "@/components/compass/chat";
import { CompassThread } from "@/components/compass/thread";
import { CompassWelcome } from "@/components/compass/welcome";
import { Button } from "@/components/ui/button";
import { Sheet, SheetPopup, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { useIsMobile } from "@/hooks/use-media-query";
import type { CompassContext } from "@/lib/compass/types";

/** Other screens can open the panel with a question ready: dispatch this event. */
export const COMPASS_OPEN_EVENT = "compass:open";
export type CompassOpenDetail = { question?: string; send?: boolean };

type Session = { chatKey: string; conversationId: string | null; context: CompassContext; messageCount: number };

function newKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k${Date.now()}${Math.random()}`;
}

function sameContext(a: CompassContext, b: CompassContext): boolean {
  return JSON.stringify({ ...a, label: undefined }) === JSON.stringify({ ...b, label: undefined });
}

/**
 * Ask Compass, from the top bar on any workspace page. It starts from what
 * the person is looking at (a case file, a lead list, Home, Results) and
 * shares conversations with the full Compass page.
 */
export function CompassPanelButton({ hideTrigger = false }: { hideTrigger?: boolean } = {}) {
  const pathname = usePathname();
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PanelState | null>(null);
  const [session, setSession] = useState<Session>(() => ({ chatKey: newKey(), conversationId: null, context: { kind: "none" }, messageCount: 0 }));
  const [prefill, setPrefill] = useState<string | null>(null);
  const [autoSend, setAutoSend] = useState(false);
  const load = useCallback(async () => {
    const next = await panelStateAction(pathname, window.location.search);
    setState(next);
    // A fresh page gets a fresh conversation once the last one has started; an empty one just takes the new context.
    setSession((current) => {
      if (current.messageCount === 0) return { ...current, context: next.context };
      if (!sameContext(current.context, next.context)) return { chatKey: newKey(), conversationId: null, context: next.context, messageCount: 0 };
      return current;
    });
  }, [pathname]);

  const show = useCallback(
    (question?: string, send = false) => {
      setPrefill(question ?? null);
      setAutoSend(Boolean(question) && send);
      // A new question from the command bar starts its own conversation.
      if (question && send) setSession((prev) => ({ chatKey: newKey(), conversationId: null, context: prev.context, messageCount: 0 }));
      setOpen(true);
      void load();
    },
    [load]
  );

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<CompassOpenDetail>).detail;
      show(detail?.question, detail?.send === true);
    };
    window.addEventListener(COMPASS_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COMPASS_OPEN_EVENT, onOpen);
  }, [show]);

  if (pathname === "/app/compass" || pathname.startsWith("/app/compass/")) return null;

  const contextLabel = session.context.kind === "none" ? null : (session.context.label ?? null);
  const fullPage = session.conversationId ? `/app/compass?c=${session.conversationId}` : "/app/compass";

  return (
    <>
      {hideTrigger ? null : (
        <Button variant="ghost" size="sm" onClick={() => show()} aria-label="Ask Compass" aria-haspopup="dialog" className="text-muted-foreground hover:text-card-foreground">
          <CompassIcon aria-hidden />
          <span className="hidden sm:inline">Ask Compass</span>
        </Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetPopup side={mobile ? "bottom" : "right"} className={mobile ? "h-[85svh]" : "sm:max-w-lg"}>
          <div className="flex items-center gap-2 border-b border-border py-2 ps-4 pe-12">
            <SheetTitle className="flex flex-1 items-center gap-2 text-base">
              <CompassIcon className="size-4 text-brand-300" aria-hidden />
              Compass
            </SheetTitle>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSession({ chatKey: newKey(), conversationId: null, context: state?.context ?? { kind: "none" }, messageCount: 0 })}
            >
              <PlusIcon aria-hidden />
              New
            </Button>
            <Button variant="ghost" size="xs" render={<Link href={fullPage} onClick={() => setOpen(false)} />}>
              <ExternalLinkIcon aria-hidden />
              Open in full page
            </Button>
          </div>
          <div className="min-h-0 flex-1">
            {!state ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
                <Spinner className="size-4" />
                Opening Compass
              </div>
            ) : !state.available ? (
              <p className="px-4 py-6 text-sm text-muted-foreground" role="status">
                {state.message}
              </p>
            ) : (
              <CompassChatProvider
                key={session.chatKey}
                chatKey={session.chatKey}
                conversationId={session.conversationId}
                initialMessages={[]}
                origin="panel"
                context={session.context}
                onConversation={(id) => setSession((prev) => ({ ...prev, conversationId: id }))}
                onSettled={(count) => setSession((prev) => ({ ...prev, messageCount: count }))}
              >
                <CompassThread
                  compact
                  autoFocus={!mobile}
                  prefill={prefill}
                  sendPrefill={autoSend}
                  welcome={<CompassWelcome compact starters={state.starters} pins={state.pins} staffNote={state.staffNote} />}
                  contextChip={contextLabel ? { label: contextLabel, onRemove: () => setSession((prev) => ({ ...prev, context: { kind: "none" } })) } : null}
                />
              </CompassChatProvider>
            )}
          </div>
        </SheetPopup>
      </Sheet>
    </>
  );
}
