"use client";

import { useMutation, useQuery } from "convex/react";
import { Authenticated, Unauthenticated } from "convex/react";
import { useEffect, useState } from "react";

import { RedirectToSignIn } from "@/components/auth/redirect-to-sign-in";
import { ProductShell } from "@/components/shell/product-shell";
import { ShellProvider, type WorkspaceShell } from "@/components/shell/shell-context";
import { useConvexReady } from "@/components/providers/convex-ready";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function AuthedFrame({ children }: { children: React.ReactNode }) {
  const mine = useQuery(api.workspace.mine, {});
  if (mine === undefined) {
    return (
      <ProductShell agents={[]}>
        <p className="text-sm text-muted-foreground">Loading your workspace.</p>
      </ProductShell>
    );
  }
  if (mine === null) {
    return (
      <ProductShell agents={[]}>
        <CreateWorkspace />
      </ProductShell>
    );
  }
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
      <ProductShell areas={shell.areas} agents={shell.agents}>{children}</ProductShell>
    </ShellProvider>
  );
}

function CreateWorkspace() {
  const create = useMutation(api.workspace.create);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      className="grid max-w-md gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError("");
        void create({ name }).catch(() => setError("We could not create that workspace."));
      }}
    >
      <h1 className="font-heading text-2xl text-strong">Create your workspace</h1>
      <p className="text-sm text-muted-foreground">You become the owner. Nothing is connected, and no agent runs.</p>
      <label className="grid gap-2 text-sm" htmlFor="workspace-name">
        Workspace name
        <Input id="workspace-name" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit">Create workspace</Button>
    </form>
  );
}
