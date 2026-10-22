"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bot,
  Ellipsis,
} from "lucide-react";

import { SHELL_ICONS } from "@/components/app/shell-icons";

import { AgentRoster, AddAgentsLink, ReconnectingNote } from "@/components/agents/agent-roster";
import { useAgentSummary } from "@/components/agents/summary-context";
import { NavPendingHint, ShellMoreList } from "@/components/app/shell-nav";
import { watchLocationHash } from "@/hooks/use-location-hash";
import { Sheet, SheetHeader, SheetPopup, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isShellItemActive, type ShellNavItem } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

/** The phone Agents tab: the same live roster as the sidebar, full screen. */
function AgentsTab({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const { summary } = useAgentSummary();
  const waiting = summary?.waitingTotal ?? 0;
  return (
    <li className="min-w-0">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label={waiting ? `${label}, ${waiting} waiting on you` : label}
          className="relative flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold text-silver"
        >
          <Bot className="size-5" aria-hidden />
          <span className="truncate">{label}</span>
          {waiting > 0 ? (
            <span className="absolute right-3 top-0.5 rounded-full bg-warning px-1 text-[10px] leading-4 text-[#07070b]">{waiting > 99 ? "99+" : waiting}</span>
          ) : null}
        </SheetTrigger>
        <SheetPopup side="bottom" className="h-[100svh] max-h-[100svh]">
          <SheetHeader>
            <SheetTitle>{label}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 overflow-y-auto px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            <ReconnectingNote />
            <AgentRoster onNavigate={() => setOpen(false)} />
            <AddAgentsLink onNavigate={() => setOpen(false)} />
          </div>
        </SheetPopup>
      </Sheet>
    </li>
  );
}

/**
 * Phone bar. Four destinations at most, plus More when anything is left over.
 * Hidden from print and from tablet and desktop.
 */
export function MobileDock({
  items,
  more,
  pathname,
  hash,
}: {
  items: ShellNavItem[];
  more: ShellNavItem[];
  pathname: string;
  hash: string;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0 && more.length === 0) return null;
  const columns = items.length + (more.length > 0 ? 1 : 0);

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-overlay/[0.08] bg-ink-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md print:hidden md:hidden"
    >
      <ul
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          if (item.sheet === "agents") return <AgentsTab key={item.id} label={item.label} />;
          const active = isShellItemActive(pathname, hash, item);
          const Icon = SHELL_ICONS[item.icon];
          return (
            <li key={item.id} className="min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={item.label}
                onClick={watchLocationHash}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold",
                  active ? "text-brand-200" : "text-silver",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="max-w-full truncate">{item.label}</span>
                <NavPendingHint />
              </Link>
            </li>
          );
        })}
        {more.length > 0 ? (
          <li className="min-w-0">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                aria-label="More"
                className="flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-semibold text-silver"
              >
                <Ellipsis className="size-5" aria-hidden />
                <span className="truncate">More</span>
              </SheetTrigger>
              <SheetPopup side="bottom">
                <SheetHeader>
                  <SheetTitle>More</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-6">
                  <ShellMoreList
                    items={more}
                    pathname={pathname}
                    hash={hash}
                    onNavigate={() => setOpen(false)}
                  />
                </div>
              </SheetPopup>
            </Sheet>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
