"use client";

import { useState, type ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import Logo from "@/components/brand/logo";
import { AppNavLinks } from "@/components/app/app-nav-links";
import { BriefPrefetcher } from "@/components/app/brief-prefetcher";
import { ConnectionStatus } from "@/components/app/connection-status";
import { LastLeadTracker } from "@/components/app/last-lead-tracker";
import { MobileDock } from "@/components/app/mobile-dock";
import { NotificationInbox } from "@/components/app/notification-inbox";
import { AppJumpPalette } from "@/components/app/jump-palette";
import { OperatorCommandBar } from "@/components/operator/command-bar";
import { NotificationRuntime } from "@/components/app/notification-runtime";
import { OutcomeSyncRuntime } from "@/components/app/outcome-sync-runtime";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { MobileWalkthroughNotice } from "@/components/app/mobile-walkthrough";
import { CoachingDisclosureNotice } from "@/components/app/coaching-disclosure";
import { FirstRunExplainer } from "@/components/app/first-run";
import { PushPrompt } from "@/components/app/push-prompt";
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
import { PRODUCT_SCOPE } from "@/lib/product-scope";
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
        <Logo markOnly className={cn("w-auto", collapsed ? "h-9" : "h-10")} />
      </div>
      {collapsed ? null : (
        <div className="px-2 pb-4">
          <OrgSwitcher />
        </div>
      )}
      <div className={cn("flex-1 overflow-y-auto", collapsed ? "px-2" : "px-2")}>
        <AppNavLinks onNavigate={onNavigate} collapsed={collapsed} />
      </div>
      <div className="border-t border-border p-2">
        <UserMenu collapsed={collapsed} />
      </div>
    </>
  );
}

export function AppShell({
  children,
  needsMobileOutcomeTraining = false,
  needsCoachingAck = false,
}: {
  children: ReactNode;
  needsMobileOutcomeTraining?: boolean;
  needsCoachingAck?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const pathname = usePathname();
  const wizard = pathname.startsWith("/app/onboarding");

  return (
    <div className="relative flex min-h-screen bg-ink-950 text-card-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[22%] left-1/2 h-[520px] w-[820px] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(154,136,252,0.16) 0%, transparent 70%)",
            filter: "blur(64px)",
          }}
        />
      </div>
      {wizard ? null : (
      <aside
        className={cn(
          "relative z-10 sticky top-0 hidden h-svh shrink-0 flex-col border-r border-white/[0.07] bg-ink-900/90 backdrop-blur-xl transition-[width] duration-200 ease-out print:hidden md:flex",
          collapsed ? "w-16" : "w-60"
        )}
      >
        <SidebarBody collapsed={collapsed} />
      </aside>
      )}

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/[0.07] bg-ink-950/80 px-4 backdrop-blur-xl print:hidden sm:px-6">
          {wizard ? null : (
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  className="md:hidden"
                  aria-label="Open navigation"
                />
              }
            >
              <Menu className="size-5" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-ink-900 p-0 text-card-foreground" showCloseButton>
              <SheetHeader className="sr-only">
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex h-full flex-col">
                <SidebarBody collapsed={false} onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
          )}

          {wizard ? null : (
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
          )}

          <Logo markOnly className={cn("h-8 w-auto", wizard ? "" : "md:hidden")} />
          {wizard ? (
            <p className="text-sm font-medium tracking-wide text-muted-foreground">Setup</p>
          ) : null}
          <div className="ml-auto flex items-center gap-1">
            {wizard ? (
              <UserMenu placement="header" />
            ) : (
              <>
                <NotificationInbox />
                <AppJumpPalette />
                <OperatorCommandBar />
              </>
            )}
          </div>
        </header>

        {wizard ? null : (
          <>
            <Suspense fallback={null}>
              <NotificationRuntime />
            </Suspense>
            <OutcomeSyncRuntime />
            <LastLeadTracker />
            <BriefPrefetcher />
          </>
        )}

        <main
          className={cn(
            "min-w-0 flex-1 overflow-x-hidden px-5 py-8 sm:px-8",
            wizard ? "pb-8" : "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8"
          )}
        >
          <div className={cn("mx-auto w-full overflow-x-hidden", wizard ? "max-w-3xl" : "max-w-[1400px]")}>
            {wizard ? null : (
              <>
                <ConnectionStatus />
                <FirstRunExplainer />
                {PRODUCT_SCOPE.coaching ? (
                  <CoachingDisclosureNotice needed={needsCoachingAck} />
                ) : null}
                <MobileWalkthroughNotice needed={needsMobileOutcomeTraining} />
                <PushPrompt />
              </>
            )}
            {children}
          </div>
        </main>
        {wizard ? null : <MobileDock />}
      </div>
    </div>
  );
}
