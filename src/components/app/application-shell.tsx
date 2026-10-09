"use client";

import { type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp } from "lucide-react";

import { AppSidebar } from "@/components/app/app-sidebar";
import { MobileDock } from "@/components/app/mobile-dock";
import { useShellSwitch } from "@/components/app/shell-switch";
import Logo from "@/components/brand/logo";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocationHash } from "@/hooks/use-location-hash";
import { useMediaQuery } from "@/hooks/use-media-query";
import { APP_NAME } from "@/lib/constants";
import {
  layoutFrameClass,
  layoutKindForPath,
  shellChrome,
  type AttentionCounts,
  type ShellNavGroup,
  type ShellNavItem,
} from "@/lib/shell/nav";
import { useSidebarCollapsed } from "@/lib/use-sidebar-collapsed";
import { captionText } from "@/lib/ui";
import { cn } from "@/lib/utils";

const SIDEBAR_SIZE = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3.5rem",
} as CSSProperties;

const EMPTY_COUNTS: AttentionCounts = { approvals: 0, dueToday: 0, escalations: 0 };

export function ApplicationShell({
  children,
  groups,
  phone,
  more,
  counts = EMPTY_COUNTS,
  homeHref,
  leading,
  tools,
  renderAccount,
  title,
  crumbs,
  cue,
  strip,
  banner,
  version,
  chat = false,
}: {
  children: ReactNode;
  groups: ShellNavGroup[];
  phone: ShellNavItem[];
  more: ShellNavItem[];
  counts?: AttentionCounts;
  homeHref: string;
  leading?: ReactNode;
  tools?: ReactNode;
  renderAccount: (placement: "sidebar" | "header", collapsed: boolean) => ReactNode;
  title: string;
  crumbs: Crumb[];
  cue?: ReactNode;
  /** Live line under the header, on every width. */
  strip?: ReactNode;
  banner?: ReactNode;
  version: string;
  chat?: boolean;
}) {
  const pathname = usePathname();
  const { preference, setCollapsed } = useSidebarCollapsed();
  const tablet = useMediaQuery({ min: "md", max: "lg" });
  const collapsed = preference === null ? tablet : preference;
  const { switching } = useShellSwitch();
  const hash = useLocationHash();

  const kind = layoutKindForPath(pathname);
  const frame = layoutFrameClass(chat ? "chat" : kind);

  return (
    <div className="relative isolate min-h-svh overflow-x-hidden bg-background text-card-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden print:hidden">
        <div
          className="absolute -top-[22%] left-1/2 h-[520px] w-[820px] -translate-x-1/2"
          style={{
            background: "radial-gradient(ellipse at center, rgba(154,136,252,0.18) 0%, transparent 70%)",
            filter: "blur(64px)",
            animation: "app-breathe 9s ease-in-out infinite",
          }}
        />
        <div
          className="absolute right-[-12%] bottom-[-18%] h-[380px] w-[380px]"
          style={{
            background: "radial-gradient(ellipse at center, rgba(154,136,252,0.1) 0%, transparent 70%)",
            filter: "blur(56px)",
            animation: "app-breathe 11s ease-in-out infinite",
            animationDelay: "1.6s",
          }}
        />
      </div>

      <SidebarProvider
        className="relative z-10 min-h-svh"
        open={!collapsed}
        onOpenChange={(open) => setCollapsed(!open)}
        style={SIDEBAR_SIZE}
      >
        <AppSidebar
          homeHref={homeHref}
          groups={groups}
          pathname={pathname}
          hash={hash}
          counts={counts}
          account={renderAccount("sidebar", collapsed)}
        />
        <SidebarInset className={cn("min-w-0 overflow-x-hidden bg-transparent", chat && "h-svh max-h-svh")}>
          {cue}
          <header className="sticky top-0 z-30 flex h-16 min-w-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-xl print:hidden sm:px-6">
            <SidebarTrigger />
            <Logo markOnly className="h-8 w-auto md:hidden" />
            <div className="min-w-0 flex-1">
              {crumbs.length > 1 ? <Breadcrumbs items={crumbs} className="mb-0.5" /> : null}
              <p className="truncate text-sm font-medium text-card-foreground" title={title}>
                {title}
              </p>
            </div>
            <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2">
              {leading}
              {tools}
              <Link
                href="/contact"
                aria-label="Help"
                title="Help"
                className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-card-foreground"
              >
                <CircleHelp className="size-4" aria-hidden />
              </Link>
              {renderAccount("header", false)}
            </div>
          </header>
          {strip}

          {chat ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
              {banner ? <div className="px-5 pt-4 sm:px-8">{banner}</div> : null}
              {switching ? <SwitchSkeleton /> : children}
            </div>
          ) : (
            <div
              className={cn(
                "min-w-0 flex-1 overflow-x-hidden px-5 py-8 sm:px-8 lg:px-10",
                "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-8",
              )}
            >
              <div className={frame}>
                {banner}
                {switching ? (
                  <SwitchSkeleton />
                ) : (
                  <>
                    {children}
                    <footer className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4 print:hidden">
                      <Link href="/privacy" className={cn(captionText, "hover:text-card-foreground")}>
                        Privacy
                      </Link>
                      <Link href="/terms" className={cn(captionText, "hover:text-card-foreground")}>
                        Terms
                      </Link>
                      <Link href="/disclaimer" className={cn(captionText, "hover:text-card-foreground")}>
                        Disclaimer
                      </Link>
                      <span className={cn(captionText, "ml-auto")}>
                        {APP_NAME} {version}
                      </span>
                    </footer>
                  </>
                )}
              </div>
            </div>
          )}
          <MobileDock items={phone} more={more} pathname={pathname} hash={hash} />
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

function SwitchSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading the workspace.</span>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function shellTitle(pathname: string, activeLabel?: string | null): { title: string; crumbs: Crumb[] } {
  const chrome = shellChrome(pathname);
  return { title: activeLabel || chrome.title, crumbs: chrome.crumbs };
}
