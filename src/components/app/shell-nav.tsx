"use client";

import Link from "next/link";
import {
  Activity,
  Building2,
  CalendarCheck,
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

import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  countFor,
  isShellItemActive,
  type AttentionCounts,
  type ShellIcon,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell/nav";

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
};

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge size="sm" variant="secondary" className="ml-auto group-data-[collapsible=icon]:hidden">
      {count > 99 ? "99+" : count}
    </Badge>
  );
}

function ItemLink({
  item,
  pathname,
  hash,
  counts,
  onNavigate,
}: {
  item: ShellNavItem;
  pathname: string;
  hash: string;
  counts: AttentionCounts;
  onNavigate?: () => void;
}) {
  const active = isShellItemActive(pathname, hash, item);
  const Icon = ICONS[item.icon];
  const count = countFor(item, counts);
  return (
    <SidebarMenuButton
      isActive={active}
      tooltip={item.label}
      className="h-9 min-w-0 data-[active=true]:bg-brand-500/12 data-[active=true]:font-medium data-[active=true]:text-brand-200 data-[active=true]:shadow-[inset_2px_0_0_#9a88fc]"
      render={
        <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined} title={item.label} />
      }
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      <CountBadge count={count} />
    </SidebarMenuButton>
  );
}

function NavItem({
  item,
  pathname,
  hash,
  counts,
  onNavigate,
}: {
  item: ShellNavItem;
  pathname: string;
  hash: string;
  counts: AttentionCounts;
  onNavigate?: () => void;
}) {
  const children = item.children ?? [];
  return (
    <SidebarMenuItem>
      <ItemLink item={item} pathname={pathname} hash={hash} counts={counts} onNavigate={onNavigate} />
      {children.length > 0 ? (
        <SidebarMenuSub>
          {children.map((child) => {
            const active = isShellItemActive(pathname, hash, child);
            const Icon = ICONS[child.icon];
            return (
              <SidebarMenuSubItem key={child.id}>
                <SidebarMenuSubButton
                  isActive={active}
                  render={
                    <Link
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      title={child.label}
                    />
                  }
                >
                  <Icon aria-hidden="true" />
                  <span className="truncate">{child.label}</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            );
          })}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  );
}

export function ShellNav({
  groups,
  pathname,
  hash,
  counts,
  onNavigate,
}: {
  groups: ShellNavGroup[];
  pathname: string;
  hash: string;
  counts: AttentionCounts;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main">
      {groups.map((group) => (
        <SidebarGroup key={group.id}>
          <SidebarGroupLabel className="truncate">{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  pathname={pathname}
                  hash={hash}
                  counts={counts}
                  onNavigate={onNavigate}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}

/** Phone "More" list. Large targets, same labels as the sidebar. */
export function ShellMoreList({
  items,
  pathname,
  hash,
  onNavigate,
}: {
  items: ShellNavItem[];
  pathname: string;
  hash: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className="grid gap-1">
      {items.map((item) => {
        const active = isShellItemActive(pathname, hash, item);
        const Icon = ICONS[item.icon];
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              onClick={onNavigate}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-card-foreground hover:bg-accent"
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
