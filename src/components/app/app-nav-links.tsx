"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  ClipboardList,
  Ellipsis,
  FolderOpen,
  Gauge,
  ListChecks,
  Phone,
  Settings2,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { useOrg } from "@/components/app/org-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isNavActive, navVisibleTo, PRIMARY_NAV, type NavIcon } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<NavIcon, LucideIcon> = {
  queue: ListChecks,
  log: ClipboardList,
  cases: FolderOpen,
  calls: Phone,
  reporting: BarChart3,
  settings: Settings2,
  activity: Activity,
  forsight: Gauge,
  more: Ellipsis,
  coaching: Sparkles,
};

export function AppNavLinks({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const { role, isPlatformAdmin } = useOrg();

  const visible = PRIMARY_NAV.filter((item) => navVisibleTo(item, role, isPlatformAdmin));

  return (
    <nav aria-label="Main">
      <ul className="flex flex-col gap-0.5">
        {visible.map((item) => {
          const active = isNavActive(pathname, item.match);
          const Icon = ICONS[item.icon];

          const link = (
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                "group flex items-center rounded-xl text-sm transition-colors",
                collapsed ? "size-10 justify-center" : "gap-2.5 px-3 py-2",
                active
                  ? "bg-brand-950 text-brand-200"
                  : "text-silver hover:bg-white/[0.05] hover:text-white"
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-brand-300" : "text-dim group-hover:text-silver"
                )}
                aria-hidden
              />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </Link>
          );

          return (
            <li key={item.href}>
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
