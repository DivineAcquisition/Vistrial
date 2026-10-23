"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Component, useState, type ReactNode } from "react";

import { useConvexReady } from "@/components/providers/convex-ready";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

class QuietBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return <p className="text-sm text-muted-foreground">Not found.</p>;
    return this.props.children;
  }
}

export function StaffDesk() {
  const ready = useConvexReady();
  if (!ready) {
    return (
      <EmptyState
        kind="permission"
        title="No grant is open"
        detail="A staff member sees a workspace only after a logged grant with a reason and an expiry. Without one, there is nothing here."
      />
    );
  }
  return (
    <>
      <Authenticated>
        <QuietBoundary>
          <StaffPanel />
        </QuietBoundary>
      </Authenticated>
      <Unauthenticated>
        <SignInButton mode="modal">
          <Button type="button">Sign in</Button>
        </SignInButton>
      </Unauthenticated>
    </>
  );
}

function StaffPanel() {
  const grants = useQuery(api.staff.listMine, {});
  const grant = useMutation(api.staff.grant);
  const enter = useMutation(api.staff.enter);
  const [workspaceId, setWorkspaceId] = useState("");
  const [reason, setReason] = useState("");
  const [opened, setOpened] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="grid gap-6">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          void grant({ workspaceId: workspaceId as Id<"workspaces">, reason, hours: 4 })
            .then(() => setReason(""))
            .catch(() => setError("Not found."));
        }}
      >
        <label className="grid gap-2 text-sm" htmlFor="grant-workspace">
          Workspace id
          <Input id="grant-workspace" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm" htmlFor="grant-reason">
          Reason
          <Input id="grant-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit">Create grant</Button>
      </form>
      <ul className="grid gap-3">
        {(grants ?? []).map((row: { id: string; workspaceId: Id<"workspaces"> }) => (
          <li key={row.id}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpened("");
                void enter({ workspaceId: row.workspaceId })
                  .then((workspace) => setOpened(workspace.name))
                  .catch(() => setOpened(""));
              }}
            >
              Open grant
            </Button>
          </li>
        ))}
      </ul>
      {opened ? <p className="text-sm text-foreground">{opened}</p> : null}
    </div>
  );
}
