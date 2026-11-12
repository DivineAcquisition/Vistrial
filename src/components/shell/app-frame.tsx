"use client";

import { useMutation, useQuery } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { RedirectToSignIn } from "@/components/auth/redirect-to-sign-in";
import { FreeSessionFlow } from "@/components/onboarding/free-session-flow";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ProductShell } from "@/components/shell/product-shell";
import { CreditsProvider } from "@/lib/credits";
import { ShellProvider, type ScopeChoice, type ShellAccount, type ShellOrganization, type WorkspaceShell } from "@/components/shell/shell-context";
import { chooseOrganization, readOrganizationChoice, readScopeChoice, validScope, writeOrganizationChoice, writeScopeChoice } from "@/lib/shell/organization-choice";
import { useConvexReady } from "@/components/providers/convex-ready";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function AppFrame({ children }: { children: React.ReactNode }) {
  const ready = useConvexReady();
  if (!ready) return <ProductShell agents={[]}>{children}</ProductShell>;
  return <LiveFrame>{children}</LiveFrame>;
}

function LiveFrame({ children }: { children: React.ReactNode }) {
  const sync = useMutation(api.workspace.syncCatalog);
  useEffect(() => {
    void sync({});
  }, [sync]);
  return (
    <>
      <Authenticated>
        <AuthedFrame>{children}</AuthedFrame>
      </Authenticated>
      <Unauthenticated>
        <RedirectToSignIn />
      </Unauthenticated>
    </>
  );
}

const WIZARD_STAGES = new Set(["about", "business", "offer", "goal", "review"]);
/** After the wizard and before paying: the free research session, its report, and the paywall. */
const LOCKED_STAGES = new Set(["freeSession", "paywall"]);

function AuthedFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const onboarding = useQuery(api.onboarding.mine, {});
  const mine = useQuery(api.organizations.mine, {});
  // Which organization is open is remembered per browser; the server decides which ones can be.
  const [remembered, setRemembered] = useState<string | null>(() => readOrganizationChoice());
  const switchOrganization = useCallback(
    (workspaceId: Id<"workspaces">) => {
      writeOrganizationChoice(workspaceId);
      setRemembered(workspaceId);
      // The page on screen may show a record of the organization being left, so start from Home.
      router.push("/app");
    },
    [router],
  );
  // New people answer the wizard before anything else; it creates their organization.
  if (onboarding && WIZARD_STAGES.has(onboarding.stage)) return <OnboardingFlow />;
  // The organization exists, but the rest of the app opens once the plan is paid for.
  if (onboarding && LOCKED_STAGES.has(onboarding.stage) && onboarding.workspaceId) return <FreeSessionFlow />;
  if (mine === undefined || onboarding === undefined) {
    return (
      <ProductShell agents={[]}>
        <p className="text-sm text-muted-foreground">Loading your organization.</p>
      </ProductShell>
    );
  }
  const current = chooseOrganization(mine.organizations, remembered);
  if (!current) return <OnboardingFlow />;
  const organizations: ShellOrganization[] = mine.organizations.map((row) => ({ workspaceId: row.workspaceId, name: row.name, role: row.role, accountId: row.accountId }));
  const found = mine.accounts.find((row) => row.accountId === current.accountId);
  const account: ShellAccount | null = found ? { accountId: found.accountId, name: found.name, owner: found.owner, canAdd: found.canAdd, addClosedReason: found.addClosedReason, addPrice: found.addPrice } : null;
  return (
    // Keyed by organization, so nothing loaded for one is ever shown under another.
    <WorkspaceFrame key={current.workspaceId} workspaceId={current.workspaceId} organizations={organizations} account={account} switchOrganization={switchOrganization}>
      {children}
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({
  workspaceId,
  organizations,
  account,
  switchOrganization,
  children,
}: {
  workspaceId: WorkspaceShell["workspaceId"];
  organizations: ShellOrganization[];
  account: ShellAccount | null;
  switchOrganization: (workspaceId: Id<"workspaces">) => void;
  children: React.ReactNode;
}) {
  const shell = useQuery(api.workspace.shell, { workspaceId });
  const listed = useQuery(api.clients.list, { workspaceId });
  // The markup turns what work cost into the credits charged for it, on every screen (lib/credits).
  const billing = useQuery(api.billing.status, { workspaceId });
  // The picker's choice is remembered per organization and per browser.
  const [stored, setStored] = useState<string>(() => readScopeChoice(workspaceId));
  const setChoice = useCallback(
    (next: ScopeChoice) => {
      writeScopeChoice(workspaceId, next);
      setStored(next);
    },
    [workspaceId],
  );
  if (shell === undefined) {
    return (
      <ProductShell agents={[]}>
        <p className="text-sm text-muted-foreground">Loading your organization.</p>
      </ProductShell>
    );
  }
  const value: WorkspaceShell = {
    workspaceId,
    role: shell.role,
    setupDone: shell.setupDone,
    agents: shell.agents,
    organizations,
    account,
    switchOrganization,
    clients: listed?.clients.map((row) => ({ id: row.id, name: row.name, type: row.type, line: row.line })) ?? [],
    ownWork: listed?.ownWork ?? true,
    canManageClients: listed?.canManage ?? false,
    // Until the list has loaded nothing is narrowed, and a choice that no longer exists is dropped.
    choice: listed ? (validScope(stored, listed.clients, listed.ownWork) as ScopeChoice) : "all",
    setChoice,
  };
  return (
    <ShellProvider value={value}>
      <CreditsProvider markup={billing?.markup}>
        <ProductShell departments={shell.departments} agents={shell.agents}>{children}</ProductShell>
      </CreditsProvider>
    </ShellProvider>
  );
}
