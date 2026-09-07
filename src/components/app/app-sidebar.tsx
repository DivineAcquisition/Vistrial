"use client";

import Link from "next/link";

import { AppNavLinks } from "@/components/app/app-nav-links";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { UserMenu } from "@/components/app/user-menu";
import Logo from "@/components/brand/logo";
import { useOrg } from "@/components/app/org-provider";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_NAME } from "@/lib/constants";
import { landingPath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const { state, isMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  const { role, surfaceAccess } = useOrg();
  const home = landingPath(surfaceAccess, role);

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader className="gap-3 border-b border-sidebar-border">
        <div className="flex items-center gap-1">
          <Link
            href={home}
            aria-label={APP_NAME}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-0.5 outline-none ring-sidebar-ring focus-visible:ring-2",
              collapsed && "justify-center px-0",
            )}
          >
            <Logo markOnly tone="on-light" className="size-8 shrink-0 object-contain" />
            <span className="min-w-0 truncate font-heading text-sm tracking-tight text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">
              {APP_NAME}
            </span>
          </Link>
          <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        </div>
        <div className="px-1 group-data-[collapsible=icon]:hidden">
          <OrgSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <AppNavLinks />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserMenu collapsed={collapsed} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
