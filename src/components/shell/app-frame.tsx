"use client";

import { useMutation, useQuery } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { useEffect } from "react";

import { RedirectToSignIn } from "@/components/auth/redirect-to-sign-in";
import { FreeSessionFlow } from "@/components/onboarding/free-session-flow";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { ProductShell } from "@/components/shell/product-shell";
import { ShellProvider, type WorkspaceShell } from "@/components/shell/shell-context";
import { useConvexReady } from "@/components/providers/convex-ready";
import { api } from "../../../convex/_generated/api";

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
  const onboarding = useQuery(api.onboarding.mine, {});
  const mine = useQuery(api.workspace.mine, {});
  // New people answer the wizard before anything else; it creates their workspace.
  if (onboarding && WIZARD_STAGES.has(onboarding.stage)) return <OnboardingFlow />;
  // The workspace exists, but the rest of the app opens once the plan is paid for.
  if (onboarding && LOCKED_STAGES.has(onboarding.stage) && onboarding.workspaceId) return <FreeSessionFlow />;
  if (mine === undefined || onboarding === undefined) {
    return (
      <ProductShell agents={[]}>
        <p className="text-sm text-muted-foreground">Loading your workspace.</p>
      </ProductShell>
    );
  }
  if (mine === null) return <OnboardingFlow />;
  return <WorkspaceFrame workspaceId={mine.workspaceId}>{children}</WorkspaceFrame>;
}

function WorkspaceFrame({
  workspaceId,
  children,
}: {
  workspaceId: WorkspaceShell["workspaceId"];
  children: React.ReactNode;
}) {
  const shell = useQuery(api.workspace.shell, { workspaceId });
  if (shell === undefined) {
    return (
      <ProductShell agents={[]}>
        <p className="text-sm text-muted-foreground">Loading your workspace.</p>
      </ProductShell>
    );
  }
  const value: WorkspaceShell = {
    workspaceId,
    role: shell.role,
    setupDone: shell.setupDone,
    agents: shell.agents,
  };
  return (
    <ShellProvider value={value}>
      <ProductShell departments={shell.departments} agents={shell.agents}>{children}</ProductShell>
    </ShellProvider>
  );
}
