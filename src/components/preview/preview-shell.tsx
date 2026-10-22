"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ApplicationShell } from "@/components/app/application-shell";
import { OrgProvider } from "@/components/app/org-provider";
import type { ClientOrgState } from "@/lib/auth/types";
import { shellNavigation } from "@/lib/shell/nav";

const PREVIEW_ORG = {
  user: { id: "preview", email: "preview@example.com", displayName: "Jordan Reyes" },
  org: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Northside Roofing",
    slug: "northside",
    timezone: "America/New_York",
    ghlLocationId: null,
    status: "active",
    isPlatformWorkspace: false,
  },
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

/** Development previews only: the real shell around a page, with a labeled fake workspace. */
export function PreviewShell({
  title,
  crumbs = [],
  chat = false,
  children,
}: {
  title: string;
  crumbs?: { label: string; href: string }[];
  chat?: boolean;
  children: ReactNode;
}) {
  const nav = shellNavigation({ role: "owner", templateAccess: false, workspaceName: PREVIEW_ORG.org.name });
  return (
    <OrgProvider value={PREVIEW_ORG}>
      <ApplicationShell
        groups={nav.groups}
        phone={nav.phone}
        more={nav.more}
        homeHref="/preview/layouts"
        title={title}
        crumbs={crumbs}
        version="preview"
        chat={chat}
        renderAccount={() => (
          <Link href="/preview/layouts" className="rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-accent">
            Account
          </Link>
        )}
      >
        {children}
      </ApplicationShell>
    </OrgProvider>
  );
}
