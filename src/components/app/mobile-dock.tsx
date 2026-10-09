"use client";

import Link from "next/link";
import { useState } from "react";
import {
  HeartPulse,
  Bot,
  Activity,
  Building2,
  CalendarCheck,
  Ellipsis,
  FolderOpen,
  Gauge,
  House,
  LayoutTemplate,
  ListChecks,
  PanelsTopLeft,
  Settings2,
  SlidersHorizontal,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { NavPendingHint, ShellMoreList } from "@/components/app/shell-nav";
import { watchLocationHash } from "@/hooks/use-location-hash";
import { Sheet, SheetHeader, SheetPopup, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { isShellItemActive, type ShellIcon, type ShellNavItem } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<ShellIcon, LucideIcon> = {
  overview: House,
  cases: FolderOpen,
  results: Activity,
  settings: Settings2,
  leads: ListChecks,
  today: CalendarCheck,
  profile: UserRound,
  roster: Building2,
  templates: LayoutTemplate,
  configuration: SlidersHorizontal,
  activity: Activity,
  defaults: SlidersHorizontal,
  layouts: PanelsTopLeft,
  forsight: Gauge,
  agents: Bot,
  health: HeartPulse,
};

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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md print:hidden md:hidden"
    >
      <ul
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isShellItemActive(pathname, hash, item);
          const Icon = ICONS[item.icon];
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
