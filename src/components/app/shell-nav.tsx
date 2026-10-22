"use client";

import Link, { useLinkStatus } from "next/link";

import { SHELL_ICONS } from "@/components/app/shell-icons";

import { AgentRail, AgentRoster } from "@/components/agents/agent-roster";
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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  countFor,
  isShellItemActive,
  type AttentionCounts,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell/nav";
import { watchLocationHash } from "@/hooks/use-location-hash";
import { cn } from "@/lib/utils";

/** Confirms the click while the next page renders. Fixed size so nothing shifts. */
export function NavPendingHint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-brand-300 opacity-0 transition-opacity",
        pending && "animate-pulse opacity-100 delay-100",
        className,
      )}
    />
  );
}

function navigate(onNavigate?: () => void) {
  return () => {
    onNavigate?.();
    watchLocationHash();
  };
}

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
  const Icon = SHELL_ICONS[item.icon];
  const count = countFor(item, counts);
  return (
    <SidebarMenuButton
      isActive={active}
      tooltip={item.label}
      className="h-9 min-w-0 data-[active=true]:bg-brand-500/12 data-[active=true]:font-medium data-[active=true]:text-brand-200 data-[active=true]:shadow-[inset_2px_0_0_#9a88fc]"
      render={
        <Link href={item.href} onClick={navigate(onNavigate)} aria-current={active ? "page" : undefined} title={item.label} />
      }
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{item.label}</span>
      <NavPendingHint className="ml-auto group-data-[collapsible=icon]:hidden" />
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
            const Icon = SHELL_ICONS[child.icon];
            return (
              <SidebarMenuSubItem key={child.id}>
                <SidebarMenuSubButton
                  isActive={active}
                  render={
                    <Link
                      href={child.href}
                      onClick={navigate(onNavigate)}
                      aria-current={active ? "page" : undefined}
                      title={child.label}
                    />
                  }
                >
                  <Icon aria-hidden="true" />
                  <span className="truncate">{child.label}</span>
                  <NavPendingHint className="ml-auto" />
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
      {groups.map((group) =>
        group.roster ? (
          <RosterGroup key={group.id} label={group.label} onNavigate={onNavigate} hideWorkPages={group.hideWorkPages} />
        ) : (
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
        )
      )}
    </nav>
  );
}

/** The generated roster in the sidebar: full rows when open, glyphs with flyouts on the icon rail. */
function RosterGroup({ label, onNavigate, hideWorkPages }: { label: string; onNavigate?: () => void; hideWorkPages?: string[] }) {
  const { state, isMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  return (
    <SidebarGroup aria-label={label}>
      <SidebarGroupLabel className="truncate">{label}</SidebarGroupLabel>
      <SidebarGroupContent>{collapsed ? <AgentRail /> : <AgentRoster onNavigate={onNavigate} hideWorkPages={hideWorkPages} />}</SidebarGroupContent>
    </SidebarGroup>
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
        const Icon = SHELL_ICONS[item.icon];
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              title={item.label}
              onClick={navigate(onNavigate)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-card-foreground hover:bg-accent"
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{item.label}</span>
              <NavPendingHint className="ml-auto" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
