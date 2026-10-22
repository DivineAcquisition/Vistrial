"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { AgentSummaryContext } from "@/components/agents/summary-context";
import { ApplicationShell } from "@/components/app/application-shell";
import { OrgProvider } from "@/components/app/org-provider";
import { LiveProvider } from "@/components/live/live-provider";
import type { AgentSummary } from "@/lib/agents/summary";
import type { ClientOrgState } from "@/lib/auth/types";
import { withoutRetiredPages } from "@/lib/sales-os/routes";
import { salesOsNavigation } from "@/lib/shell/nav";

const ORG_ID = "00000000-0000-4000-8000-000000000001";

const PREVIEW_ORG = {
  user: { id: "preview", email: "preview@example.com", displayName: "Jordan Reyes" },
  org: { id: ORG_ID, name: "Sample Workspace", slug: "sample", timezone: "America/New_York", ghlLocationId: null, status: "active", isPlatformWorkspace: false },
  role: "owner",
  workspaceRole: "owner",
  isStaff: false,
  isPlatformAdmin: false,
  canApprove: true,
  canSeeMoney: true,
  canExport: false,
  avatarPath: null,
  templateAccess: false,
  lostWorkspace: false,
  memberId: "m-preview",
  surfaceAccess: "operator",
  memberships: [],
  cookieNeedsReset: false,
} as unknown as ClientOrgState;

/** Development previews only: the Sales OS shell with its agent rail, around a labeled fake workspace. */
export function SalesOsPreviewShell({ title, summary, generatedAt, children }: { title: string; summary: AgentSummary; generatedAt: string; children: ReactNode }) {
  const nav = salesOsNavigation({ role: "owner", templateAccess: false, workspaceName: PREVIEW_ORG.org.name, manager: true });
  return (
    <OrgProvider value={PREVIEW_ORG}>
      <LiveProvider orgId={ORG_ID} workspaceStatus="active" initial={{ orgId: ORG_ID, runs: [], events: [], controls: [], waiting: [], loadedAt: generatedAt }} initialCalm={false} offline>
        <AgentSummaryContext.Provider value={{ summary: withoutRetiredPages(summary), refresh: () => undefined, reconnecting: false }}>
          <ApplicationShell
            groups={nav.groups}
            phone={nav.phone}
            more={nav.more}
            roster
            counts={{ approvals: 2, dueToday: 0, escalations: 0, queue: 0 }}
            homeHref="/preview/sales-os"
            title={title}
            crumbs={[{ label: title, href: "/preview/sales-os" }]}
            version="preview"
            renderAccount={() => (
              <Link href="/preview/sales-os" className="rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent">
                Account
              </Link>
            )}
          >
            {children}
          </ApplicationShell>
        </AgentSummaryContext.Provider>
      </LiveProvider>
    </OrgProvider>
  );
}
