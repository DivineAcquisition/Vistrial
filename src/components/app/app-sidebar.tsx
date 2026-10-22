"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

import { AddAgentsLink, ReconnectingNote } from "@/components/agents/agent-roster";
import { useOrg } from "@/components/app/org-provider";
import { ShellNav } from "@/components/app/shell-nav";
import Logo from "@/components/brand/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/lib/constants";
import type { AttentionCounts, ShellNavGroup } from "@/lib/shell/nav";
import { cn } from "@/lib/utils";

/** One word for the workspace under its name. */
const WORKSPACE_STATUS: Record<string, string> = {
  active: "Live",
  onboarding: "Setting up",
  paused: "Paused",
  closed: "Closed",
};

export function AppSidebar({
  homeHref,
  groups,
  pathname,
  hash,
  counts,
  account,
  roster = false,
}: {
  roster?: boolean;
  homeHref: string;
  groups: ShellNavGroup[];
  pathname: string;
  hash: string;
  counts: AttentionCounts;
  account: ReactNode;
}) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const { org } = useOrg();
  const collapsed = !isMobile && state === "collapsed";

  function closeMobile() {
    setOpenMobile(false);
  }

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader className="gap-3 border-b border-sidebar-border">
        <div className="flex items-center gap-1">
          <Link
            href={homeHref}
            aria-label={APP_NAME}
            title={APP_NAME}
            onClick={closeMobile}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 outline-none ring-sidebar-ring focus-visible:ring-2",
              collapsed && "justify-center px-0",
            )}
          >
            <Logo markOnly className="size-8 shrink-0 object-contain" />
            <span className="min-w-0 truncate font-heading text-sm tracking-tight text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">
              {APP_NAME}
            </span>
          </Link>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
        {roster ? (
          <div className="min-w-0 px-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium text-sidebar-accent-foreground" title={org.name}>
              {org.name}
            </p>
            <p className="text-xs text-muted-foreground">{WORKSPACE_STATUS[org.status] ?? "Live"}</p>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        <ShellNav
          groups={groups}
          pathname={pathname}
          hash={hash}
          counts={counts}
          onNavigate={closeMobile}
        />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        {roster ? (
          <div className="space-y-1 group-data-[collapsible=icon]:hidden">
            <ReconnectingNote />
            <AddAgentsLink onNavigate={closeMobile} />
          </div>
        ) : null}
        <SidebarGroup className="p-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Help"
                className="h-9"
                render={<Link href="/contact" onClick={closeMobile} title="Help" />}
              >
                <CircleHelp aria-hidden="true" />
                <span className="truncate">Help</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {account}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
