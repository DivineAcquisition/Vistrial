"use client";

import { type CSSProperties, type ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";

import { AppSidebar } from "@/components/app/app-sidebar";
import { BriefPrefetcher } from "@/components/app/brief-prefetcher";
import { ConnectionStatus } from "@/components/app/connection-status";
import { LastLeadTracker } from "@/components/app/last-lead-tracker";
import { MobileDock } from "@/components/app/mobile-dock";
import { NotificationBell } from "@/components/app/notification-bell";
import { AppJumpPalette } from "@/components/app/jump-palette";
import { NotificationRuntime } from "@/components/app/notification-runtime";
import { OutcomeSyncRuntime } from "@/components/app/outcome-sync-runtime";
import { MobileWalkthroughNotice } from "@/components/app/mobile-walkthrough";
import { CoachingDisclosureNotice } from "@/components/app/coaching-disclosure";
import { FirstRunExplainer } from "@/components/app/first-run";
import { PageMotion } from "@/components/app/page-motion";
import { PushPrompt } from "@/components/app/push-prompt";
import { UserMenu } from "@/components/app/user-menu";
import Logo from "@/components/brand/logo";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { isProductScopeEnabled } from "@/lib/product-scope";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";
import { cn } from "@/lib/utils";

const SIDEBAR_SIZE = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3.5rem",
} as CSSProperties;

export function AppShell({
  children,
  needsMobileOutcomeTraining = false,
  needsCoachingAck = false,
}: {
  children: ReactNode;
  needsMobileOutcomeTraining?: boolean;
  needsCoachingAck?: boolean;
}) {
  const { collapsed, setCollapsed } = useSidebarCollapsed();
  const pathname = usePathname();
  const wizard = pathname.startsWith("/app/onboarding");

  return (
    <div className="relative isolate min-h-svh bg-background text-card-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-[22%] left-1/2 h-[520px] w-[820px] -translate-x-1/2"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(154,136,252,0.18) 0%, transparent 70%)",
            filter: "blur(64px)",
            animation: "app-breathe 9s ease-in-out infinite",
          }}
        />
        <div
          className="absolute right-[-12%] bottom-[-18%] h-[380px] w-[380px]"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(154,136,252,0.1) 0%, transparent 70%)",
            filter: "blur(56px)",
            animation: "app-breathe 11s ease-in-out infinite",
            animationDelay: "1.6s",
          }}
        />
      </div>

      {wizard ? (
        <div className="relative z-10 flex min-h-svh flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl print:hidden sm:px-6">
            <Logo markOnly tone="on-light" className="h-8 w-auto" />
            <p className="text-sm font-medium tracking-wide text-muted-foreground">Setup</p>
            <div className="ml-auto">
              <UserMenu placement="header" />
            </div>
          </header>
          <div className="min-w-0 flex-1 overflow-x-hidden px-5 py-8 sm:px-8 lg:px-10">
            <div className="mx-auto w-full max-w-3xl overflow-x-hidden">
              <PageMotion>{children}</PageMotion>
            </div>
          </div>
        </div>
      ) : (
        <SidebarProvider
          className="relative z-10"
          open={!collapsed}
          onOpenChange={(open) => setCollapsed(!open)}
          style={SIDEBAR_SIZE}
        >
          <AppSidebar />
          <SidebarInset className="min-w-0 overflow-x-hidden bg-transparent">
            <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl print:hidden sm:px-6">
              <SidebarTrigger />
              <Logo markOnly tone="on-light" className="h-8 w-auto md:hidden" />
              <div className="ml-auto flex items-center gap-1">
                <NotificationBell />
                <AppJumpPalette />
              </div>
            </header>

            <Suspense fallback={null}>
              <NotificationRuntime />
            </Suspense>
            <OutcomeSyncRuntime />
            <LastLeadTracker />
            <BriefPrefetcher />

            <div
              className={cn(
                "min-w-0 flex-1 overflow-x-hidden px-5 py-8 sm:px-8 lg:px-10",
                "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8",
              )}
            >
              <div className="mx-auto w-full max-w-[1400px] overflow-x-hidden">
                <ConnectionStatus />
                <FirstRunExplainer />
                {isProductScopeEnabled("coaching") ? (
                  <CoachingDisclosureNotice needed={needsCoachingAck} />
                ) : null}
                <MobileWalkthroughNotice needed={needsMobileOutcomeTraining} />
                <PushPrompt />
                <PageMotion>{children}</PageMotion>
              </div>
            </div>
            <MobileDock />
          </SidebarInset>
        </SidebarProvider>
      )}
    </div>
  );
}
