"use client";

import { useState, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import Logo from "@/components/brand/logo";
import { AppNavLinks } from "@/components/app/app-nav-links";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";
import { cn } from "@/lib/utils";

function SidebarBody({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className={cn("flex items-center py-5", collapsed ? "justify-center px-2" : "px-4")}>
        <Logo className={cn("w-auto", collapsed ? "h-6" : "h-6")} />
      </div>
      {collapsed ? null : (
        <div className="px-2 pb-4">
          <OrgSwitcher />
        </div>
      )}
      <div className={cn("flex-1 overflow-y-auto", collapsed ? "px-2" : "px-2")}>
        <AppNavLinks onNavigate={onNavigate} collapsed={collapsed} />
      </div>
      <div className="border-t border-white/[0.07] p-2">
        <UserMenu collapsed={collapsed} />
      </div>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  return (
    <div className="flex min-h-screen bg-ink-950 text-white">
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-white/[0.07] bg-ink-900 transition-[width] duration-200 ease-out print:hidden md:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarBody collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.07] bg-ink-950/85 px-4 backdrop-blur-md print:hidden sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              className="rounded-xl p-2 text-silver transition-colors hover:bg-white/[0.05] hover:text-white md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-ink-900 p-0 text-white" showCloseButton>
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex h-full flex-col">
                <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                onClick={toggleCollapsed}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={collapsed}
                className="hidden md:inline-flex"
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-4" aria-hidden />
                ) : (
                  <PanelLeftClose className="size-4" aria-hidden />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>

          <Logo className="h-5 w-auto md:hidden" />
        </header>

        <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
