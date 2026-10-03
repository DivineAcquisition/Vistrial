"use client";

import { BookOpenIcon, HistoryIcon, Settings2Icon } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";

import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui";
import { Opening } from "@/components/sales-os/opening";
import { SalesOsRuntimeProvider } from "@/components/sales-os/runtime";
import { PlainToolFallback, SalesOsToolUIs } from "@/components/sales-os/tool-uis";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { OpeningState } from "@/lib/sales-os/context-types";

export function SalesOsWorkspace({
  opening,
  initialThreadId,
  canManage,
}: {
  opening: OpeningState;
  initialThreadId?: string;
  canManage: boolean;
}) {
  const Welcome = useMemo(
    () =>
      function Welcome() {
        return <Opening state={opening} />;
      },
    [opening]
  );
  const onThreadIdChange = useCallback((id: string | undefined) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", id);
    else url.searchParams.delete("c");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return (
    <TooltipProvider delay={0}>
      <SalesOsRuntimeProvider threadId={initialThreadId} onThreadIdChange={onThreadIdChange}>
        <SalesOsToolUIs />
        <div className="flex h-[calc(100svh-9rem)] min-h-[32rem] gap-6">
          <aside className="hidden w-64 shrink-0 flex-col gap-3 lg:flex" aria-label="Conversations">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ThreadList />
            </div>
            <nav className="flex flex-col gap-0.5 border-t border-border pt-3" aria-label="Vistrial records">
              <Button variant="ghost" size="sm" className="justify-start" render={<Link href="/app/ask/assets" />}>
                <BookOpenIcon aria-hidden /> Scripts and assets
              </Button>
              <Button variant="ghost" size="sm" className="justify-start" render={<Link href="/app/ask/history" />}>
                <HistoryIcon aria-hidden /> What Vistrial did
              </Button>
              {canManage ? (
                <Button variant="ghost" size="sm" className="justify-start" render={<Link href="/app/settings/vistrial" />}>
                  <Settings2Icon aria-hidden /> Posting and approvals
                </Button>
              ) : null}
            </nav>
          </aside>
          <section className="min-w-0 flex-1" aria-label="Conversation with Vistrial">
            <Thread components={{ Welcome, ToolFallback: PlainToolFallback }} />
          </section>
        </div>
      </SalesOsRuntimeProvider>
    </TooltipProvider>
  );
}
