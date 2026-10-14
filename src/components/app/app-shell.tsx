"use client";

import { type ReactNode, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
import { CompassPanelButton } from "@/components/compass/panel";
import { useOrg } from "@/components/app/org-provider";
import { LiveStatusStrip } from "@/components/live/agent-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { PaymentProblem } from "@/lib/billing/labels";
import { exitWorkspace } from "@/app/(workspace)/app/team/staff-actions";
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
  paymentProblem = null,
  version,
  staffSessionEndsAt = null,
  mfaGraceUntil = null,
}: {
  children: ReactNode;
  counts: AttentionCounts;
  lostWorkspace?: boolean;
  paymentProblem?: PaymentProblem | null;
  version: string;
  staffSessionEndsAt?: string | null;
  mfaGraceUntil?: string | null;
}) {
  const pathname = usePathname();
  if (pathname.startsWith("/app/layouts/preview")) return children;

  return (
    <ShellSwitchProvider>
      <ConnectedShell
        counts={counts}
        lostWorkspace={lostWorkspace}
        paymentProblem={paymentProblem}
        version={version}
        staffSessionEndsAt={staffSessionEndsAt}
        mfaGraceUntil={mfaGraceUntil}
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
  paymentProblem,
  version,
  staffSessionEndsAt,
  mfaGraceUntil,
}: {
  children: ReactNode;
  counts: AttentionCounts;
  lostWorkspace: boolean;
  paymentProblem: PaymentProblem | null;
  version: string;
  staffSessionEndsAt: string | null;
  mfaGraceUntil: string | null;
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
  const chat = pathname === "/app/compass" || pathname === "/app/ask" || pathname.startsWith("/app/ask/");
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
          {onPlatformPage ? null : <CompassPanelButton />}
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
      cue={showCue ? <StaffCue endsAt={staffSessionEndsAt} /> : null}
      strip={<LiveStatusStrip />}
      banner={
        <>
          {lostWorkspace ? (
            <Alert variant="warning" className="mb-6">
              <AlertTitle>That workspace is no longer open to you</AlertTitle>
              <AlertDescription>You are in {org.org.name}.</AlertDescription>
            </Alert>
          ) : null}
          <WorkspaceStatusBanner />
          {mfaGraceUntil ? (
            <Alert variant="warning" className="mb-6">
              <AlertTitle>Set up your authenticator app</AlertTitle>
              <AlertDescription>
                The Vistrial team will need an authenticator app after {new Date(mfaGraceUntil).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}.{" "}
                <Link href="/security/setup?next=/app/team" className="underline">
                  Set it up now
                </Link>
                . Recovery codes are shown once.
              </AlertDescription>
            </Alert>
          ) : null}
          {paymentProblem && !pathname.startsWith("/app/settings/billing") ? (
            <Alert variant="warning" className="mb-6">
              <AlertTitle>The last payment to Vistrial did not go through</AlertTitle>
              <AlertDescription>
                Everything keeps working.{" "}
                <Link href="/app/settings/billing" className="underline">
                  Open Billing
                </Link>{" "}
                to sort it out.
              </AlertDescription>
            </Alert>
          ) : null}
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

function StaffCue({ endsAt }: { endsAt: string | null }) {
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
        {endsAt ? <SessionClock endsAt={endsAt} /> : null}
        {endsAt ? (
          <form action={exitWorkspace} className="ml-auto shrink-0">
            <button type="submit" className="font-medium text-brand-300 underline">
              Exit
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function SessionClock({ endsAt }: { endsAt: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  const minutes = now === null ? null : Math.max(0, Math.round((Date.parse(endsAt) - now) / 60_000));
  useEffect(() => {
    if (minutes === 0) router.refresh();
  }, [minutes, router]);
  if (minutes === null) return null;
  return <span className="shrink-0 text-muted-foreground">{minutes} min left</span>;
}
