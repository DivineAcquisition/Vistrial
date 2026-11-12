"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LayoutListIcon, MenuIcon } from "@/components/icons";

import { ThemeToggle } from "@/components/app/theme-toggle";
import { AskButton, ChatPanelProvider, LiveChatPanel, useChatPanel } from "@/components/chat/side-panel";
import { JourneySidebar } from "@/components/shell/journey-sidebar";
import { LiveAside } from "@/components/shell/live-aside";
import { StatusBadge } from "@/components/ui/status-badge";
import { agentStateLabel, type RailAgent, type RailDepartment } from "@/lib/shell/rail";
import { cn } from "@/lib/utils";
import { PageEnter } from "@/components/motion/page-enter";
import { BalanceNotice } from "@/components/billing/balance-notice";

// Leads and My day belong to the Sales Conversion agent. Their pages stay, hidden from the nav until it ships.
const tabs = [{ href: "/app", label: "Home", icon: LayoutListIcon }] as const;

function active(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The column on the right: the live stream, or the chat panel in its place while the panel is open. The
 * panel stays open as pages change; on a phone it is a full-height sheet.
 */
function RightColumn() {
  const panel = useChatPanel();
  if (panel?.open) return <LiveChatPanel />;
  return (
    <aside aria-label="Live stream" className="hidden w-72 shrink-0 border-l border-border p-4 lg:block print:hidden">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Live</p>
      <LiveAside />
    </aside>
  );
}

export function ProductShell(props: Parameters<typeof ProductShellInner>[0]) {
  return (
    <ChatPanelProvider>
      <ProductShellInner {...props} />
    </ChatPanelProvider>
  );
}

function ProductShellInner({
  agents,
  children,
}: {
  /** Kept for callers; the sidebar groups agents by journey, not department. */
  departments?: RailDepartment[];
  agents: RailAgent[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh overflow-x-hidden bg-background text-foreground">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="flex min-h-dvh min-w-0">
        <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-border md:flex md:flex-col print:hidden" aria-label="Workspace">
          <JourneySidebar agents={agents} pathname={pathname} />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-border print:hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2" aria-label="Crew">
              {agents
                .filter((agent) => agent.status === "live")
                .map((agent) => (
                  <span key={agent.slug} className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="text-foreground">{agent.name}</span>
                    <StatusBadge label={agentStateLabel(agent)} />
                  </span>
                ))}
              </div>
              <AskButton />
              <ThemeToggle />
            </div>
          </header>
          <div className="flex min-w-0 flex-1">
            <main id="workspace-main" className="min-w-0 flex-1 px-4 py-6 pb-28 md:px-8 md:pb-10">
              <BalanceNotice />
              <PageEnter id={pathname}>{children}</PageEnter>
            </main>
            <RightColumn />
          </div>
        </div>
      </div>
      {menuOpen ? (
        <div className="fixed inset-x-0 bottom-16 z-30 flex h-[75dvh] flex-col border-t border-border bg-background md:hidden print:hidden">
          <JourneySidebar agents={agents} pathname={pathname} onNavigate={() => setMenuOpen(false)} />
        </div>
      ) : null}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
      >
        <ul className="grid grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const on = active(pathname, tab.href);
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
                    on ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {tab.label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-label="More"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground"
            >
              <MenuIcon className="size-5" aria-hidden />
              More
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
