"use client";

import { useQuery } from "convex/react";

import { useWorkspaceShell } from "@/components/shell/shell-context";
import { api } from "../../../convex/_generated/api";

export function LiveAside() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="mt-3 text-sm text-muted-foreground">Nothing is running. Agents are off.</p>;
  return <LiveEvents workspaceId={shell.workspaceId} />;
}

function LiveEvents({ workspaceId }: { workspaceId: NonNullable<ReturnType<typeof useWorkspaceShell>>["workspaceId"] }) {
  const events = useQuery(api.events.recent, { workspaceId });
  if (events === undefined) return <p className="mt-3 text-sm text-muted-foreground">Loading.</p>;
  if (events.length === 0) return <p className="mt-3 text-sm text-muted-foreground">Nothing is running. Agents are off.</p>;
  return (
    <ul className="mt-3 grid gap-2">
      {events.map((event: { id: string; kind: string }) => (
        <li key={event.id} className="text-sm text-muted-foreground">
          {event.kind}
        </li>
      ))}
    </ul>
  );
}
