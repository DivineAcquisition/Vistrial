"use client";

import { useAuiState } from "@assistant-ui/react";
import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Thread } from "@/components/assistant-ui/elements/thread.aui";
import { ThreadList } from "@/components/assistant-ui/elements/thread-list.aui";
import { AgentStatePanel } from "@/components/sales-os/agent-state";
import { Opening } from "@/components/sales-os/opening";
import { SalesOsRuntimeProvider } from "@/components/sales-os/runtime";
import { PlainToolFallback, SalesOsToolUIs } from "@/components/sales-os/tool-uis";
import { WorkPane, WorkPaneProvider, useWorkPane } from "@/components/sales-os/work-pane";
import { NotificationBell } from "@/components/app/notification-bell";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { UserMenu } from "@/components/app/user-menu";
import { useOrg } from "@/components/app/org-provider";
import Logo from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetPopup, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { OpeningState } from "@/lib/sales-os/context-types";
import type { PendingApproval } from "@/lib/sales-os/executions/types";
import { navVisibleTo, PRIMARY_NAV } from "@/lib/navigation";
import type { ToolCallRecord } from "@/lib/sales-os/persist";
import { captionText } from "@/lib/ui";

function RailBody({
  pending,
  opening,
  recent,
}: {
  pending: PendingApproval[];
  opening: OpeningState;
  recent: ToolCallRecord[];
}) {
  const { role, isStaff } = useOrg();
  const links = PRIMARY_NAV.filter((item) => item.href !== "/app/ask" && navVisibleTo(item, role, isStaff));
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-3">
      <Link href="/app/ask" className="flex items-center gap-2 px-1" aria-label="Vistrial">
        <Logo markOnly className="size-7" />
        <span className="font-heading text-sm text-card-foreground">Vistrial</span>
      </Link>
      <OrgSwitcher />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ThreadList />
        {pending.length ? (
          <div className="mt-3 space-y-1 border-t border-border pt-3">
            <p className={captionText}>Waiting for your OK</p>
            {pending.map((item) => (
              <Link key={item.id} href={`/app/ask?c=${item.conversationId}`} className="block rounded-lg px-2 py-1.5 text-sm text-card-foreground hover:bg-muted">
                <span className="block">{item.plainSummary}</span>
                {item.conversationTitle ? <span className={captionText}>{item.conversationTitle}</span> : null}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <AgentStatePanel opening={opening} pending={pending} recent={recent} />
      <nav className="space-y-0.5 border-t border-border pt-2" aria-label="The rest of Vistrial">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-card-foreground">
            {item.label}
          </Link>
        ))}
        <Link href="/app/ask/history" className="block rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-card-foreground">
          What Vistrial did
        </Link>
      </nav>
      <div className="flex items-center gap-1">
        <NotificationBell />
        <UserMenu />
      </div>
    </div>
  );
}

function artifactLabel(kind: NonNullable<ReturnType<typeof useWorkPane>["artifact"]>["kind"]) {
  if (kind === "finding") return "The finding";
  if (kind === "execution") return "The preview";
  return "The asset";
}

function MobileChrome({ rail }: { rail: React.ReactNode }) {
  const artifact = useWorkPane().artifact;
  const [railOpen, setRailOpen] = useState(false);
  const [paneOpen, setPaneOpen] = useState(false);
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const running = useAuiState((s) => s.thread.isRunning);
  const seenThread = useRef(remoteId);
  useEffect(() => {
    if (seenThread.current === remoteId) return;
    seenThread.current = remoteId;
    setRailOpen(false);
  }, [remoteId]);
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5 md:hidden">
        <Sheet open={railOpen} onOpenChange={setRailOpen}>
          <SheetTrigger aria-label="Open conversations" nativeButton className="inline-flex size-9 items-center justify-center rounded-lg hover:bg-muted">
            <MenuIcon className="size-4" />
          </SheetTrigger>
          <SheetPopup side="left" className="w-[min(100%,18rem)]">
            {rail}
          </SheetPopup>
        </Sheet>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{running ? "Working on it" : "Vistrial"}</span>
        {artifact ? (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setPaneOpen(true)}>
            {artifactLabel(artifact.kind)}
          </Button>
        ) : null}
      </div>
      <Sheet open={paneOpen && Boolean(artifact)} onOpenChange={setPaneOpen}>
        <SheetPopup side="bottom" className="h-[92svh] max-w-none">
          <WorkPane className="flex h-full min-h-0 flex-col" />
        </SheetPopup>
      </Sheet>
    </>
  );
}

/** The pane belongs to the conversation that is open. Switching threads closes it. */
function ConversationReset() {
  const remoteId = useAuiState((s) => s.threadListItem.remoteId ?? null);
  const { close } = useWorkPane();
  const previous = useRef(remoteId);
  useEffect(() => {
    if (previous.current === remoteId) return;
    previous.current = remoteId;
    close();
  }, [remoteId, close]);
  return null;
}

export function SalesOsWorkspace({
  opening,
  initialThreadId,
  canEditAssets,
  pending,
  recent,
}: {
  opening: OpeningState;
  initialThreadId?: string;
  canEditAssets: boolean;
  pending: PendingApproval[];
  recent: ToolCallRecord[];
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
  const rail = <RailBody pending={pending} opening={opening} recent={recent} />;

  return (
    <TooltipProvider delay={0}>
      <SalesOsRuntimeProvider threadId={initialThreadId} onThreadIdChange={onThreadIdChange}>
        <SalesOsToolUIs />
        <WorkPaneProvider canEditAssets={canEditAssets}>
          <ConversationReset />
          <div className="flex h-svh overflow-hidden bg-background text-card-foreground">
            <aside className="hidden h-svh w-[220px] shrink-0 border-r border-border md:block">{rail}</aside>
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileChrome rail={rail} />
              <div className="flex min-h-0 flex-1">
                <section className="min-w-0 flex-1" aria-label="Conversation with Vistrial">
                  <Thread components={{ Welcome, ToolFallback: PlainToolFallback }} />
                </section>
                <WorkPane className="hidden h-full w-[45%] min-w-0 flex-col border-l border-border md:flex" />
              </div>
            </div>
          </div>
        </WorkPaneProvider>
      </SalesOsRuntimeProvider>
    </TooltipProvider>
  );
}
