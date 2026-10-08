"use client";

import { type ReactNode, Suspense } from "react";
import { usePathname } from "next/navigation";

import { ApplicationShell } from "@/components/app/application-shell";
import { BriefPrefetcher } from "@/components/app/brief-prefetcher";
import { ConnectionStatus } from "@/components/app/connection-status";
import { LastLeadTracker } from "@/components/app/last-lead-tracker";
import { NotificationBell } from "@/components/app/notification-bell";
import { AppJumpPalette } from "@/components/app/jump-palette";
import { NotificationRuntime } from "@/components/app/notification-runtime";
import { OutcomeSyncRuntime } from "@/components/app/outcome-sync-runtime";
import { FirstRunExplainer } from "@/components/app/first-run";
import { PageMotion } from "@/components/app/page-motion";
import { PushPrompt } from "@/components/app/push-prompt";
import { ShellSwitchProvider } from "@/components/app/shell-switch";
import { UserMenu } from "@/components/app/user-menu";
import { ShellLeading } from "@/components/app/shell-leading";
import { WorkspaceStatusBanner } from "@/components/app/workspace-status-banner";
import { useOrg } from "@/components/app/org-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { landingPath } from "@/lib/navigation";
import {
  isPlatformRoute,
  shellChrome,
  shellNavigation,
  type AttentionCounts,
} from "@/lib/shell/nav";

export function AppShell({
  children,
  counts,
  lostWorkspace = false,
  version,
}: {
  children: ReactNode;
  counts: AttentionCounts;
  lostWorkspace?: boolean;
  version: string;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/app/layouts/preview")) return children;

  return (
    <ShellSwitchProvider>
      <ConnectedShell
        counts={counts}
        lostWorkspace={lostWorkspace}
        version={version}
      >
        {children}
      </ConnectedShell>
    </ShellSwitchProvider>
  );
}

function ConnectedShell({
  children,
  counts,
  lostWorkspace,
  version,
}: {
  children: ReactNode;
  counts: AttentionCounts;
  lostWorkspace: boolean;
  version: string;
}) {
  const pathname = usePathname();
  const org = useOrg();

  const onPlatformPage = org.isStaff && isPlatformRoute(pathname);
  const nav = shellNavigation({
    role: org.workspaceRole,
    templateAccess: org.templateAccess,
    workspaceName: org.org.name,
  });
  const chrome = shellChrome(pathname);
  let title = chrome.title;
  if (org.workspaceRole === "operator" && (pathname === "/app/home" || pathname.startsWith("/app/home/"))) {
    title = "Today";
  }
  if (org.workspaceRole === "operator" && pathname.startsWith("/app/settings/profile")) {
    title = "Profile";
  }
  const chat = pathname === "/app/ask" || pathname.startsWith("/app/ask/");
  const home = landingPath(org.surfaceAccess, org.role);
  const showCue = org.isStaff && !onPlatformPage;

  return (
    <ApplicationShell
      groups={nav.groups}
      phone={nav.phone}
      more={nav.more}
      counts={counts}
      homeHref={home}
      title={title}
      crumbs={chrome.crumbs}
      version={version}
      chat={chat}
      leading={<ShellLeading />}
      tools={
        <>
          <AppJumpPalette />
          <NotificationBell />
        </>
      }
      renderAccount={(placement, collapsed) => (
        <UserMenu
          placement={placement === "header" ? "header" : "sidebar"}
          collapsed={placement === "header" ? true : collapsed}
        />
      )}
      cue={showCue ? <StaffCue /> : null}
      banner={
        <>
          {lostWorkspace ? (
            <Alert variant="warning" className="mb-6">
              <AlertTitle>That workspace is no longer open to you</AlertTitle>
              <AlertDescription>You are in {org.org.name}.</AlertDescription>
            </Alert>
          ) : null}
          <WorkspaceStatusBanner />
        </>
      }
    >
      <Suspense fallback={null}>
        <NotificationRuntime />
      </Suspense>
      <OutcomeSyncRuntime />
      <LastLeadTracker />
      <BriefPrefetcher />
      <ConnectionStatus />
      <FirstRunExplainer />
      <PushPrompt />
      {chat ? <div className="min-h-0 flex-1">{children}</div> : <PageMotion>{children}</PageMotion>}
    </ApplicationShell>
  );
}

function StaffCue() {
  const { org, isPlatformAdmin } = useOrg();
  return (
    <div className="print:hidden">
      <div aria-hidden className="h-0.5 bg-brand-500" />
      <div
        role="note"
        className="flex min-w-0 items-center gap-2 border-b border-brand-500/30 bg-brand-500/10 px-4 py-1.5 text-xs text-card-foreground sm:px-6"
      >
        <span className="shrink-0 font-medium text-brand-300">{isPlatformAdmin ? "Admin" : "Service Team"}</span>
        <span aria-hidden>·</span>
        <span className="truncate" title={org.name}>
          {org.isPlatformWorkspace ? "Vistrial's own workspace" : "Working inside"}{" "}
          <span className="font-medium">{org.name}</span>
        </span>
      </div>
    </div>
  );
}
