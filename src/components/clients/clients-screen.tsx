"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { ClientsView, type ClientDraft } from "@/components/clients/clients-view";
import { useWorkspaceShell, type WorkspaceShell } from "@/components/shell/shell-context";
import { describeError } from "@/lib/errors/user-error";
import { isAdmin } from "@/lib/roles";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

async function attempt(run: Promise<unknown>): Promise<string | null> {
  try {
    await run;
    return null;
  } catch (problem) {
    return describeError(problem, "That did not go through. Try again.").message;
  }
}

function profileOf(draft: ClientDraft) {
  return draft.type === "business" ? { business: draft.business } : { person: draft.person };
}

export function ClientsScreen() {
  const shell = useWorkspaceShell();
  if (!shell) return <p className="text-sm text-muted-foreground">Sign in to open your organization.</p>;
  return <LiveClients shell={shell} />;
}

function LiveClients({ shell }: { shell: WorkspaceShell }) {
  const workspaceId = shell.workspaceId;
  const canManage = isAdmin(shell.role);
  const [selected, setSelected] = useState<string | null>(null);
  const active = useQuery(api.clients.list, { workspaceId });
  const archived = useQuery(api.clients.list, canManage ? { workspaceId, archived: true } : "skip");
  const open = selected && selected !== "new" ? (selected as Id<"clients">) : null;
  const detail = useQuery(api.clients.get, open ? { workspaceId, clientId: open } : "skip");
  const access = useQuery(api.clients.access, open && canManage ? { workspaceId, clientId: open } : "skip");
  const create = useMutation(api.clients.create);
  const update = useMutation(api.clients.update);
  const setArchived = useMutation(api.clients.setArchived);
  const setAssigned = useMutation(api.clients.setAssigned);

  if (!active) return <p className="text-sm text-muted-foreground">Loading clients.</p>;
  return (
    <ClientsView
      organizationName={shell.organizations?.find((row) => row.workspaceId === workspaceId)?.name ?? "Your organization"}
      canManage={canManage}
      clients={active.clients}
      archived={archived?.clients ?? []}
      selected={selected}
      detail={detail ?? null}
      access={canManage ? (access ?? null) : null}
      showing={shell.choice ?? "all"}
      onSelect={setSelected}
      onShow={(id) => shell.setChoice?.(id as Id<"clients">)}
      onCreate={async (draft) => {
        try {
          const id = await create({ workspaceId, type: draft.type, name: draft.name, ...profileOf(draft) });
          setSelected(id);
          return null;
        } catch (problem) {
          return describeError(problem, "The client could not be added. Try again.").message;
        }
      }}
      onSave={(id, draft) => attempt(update({ workspaceId, clientId: id as Id<"clients">, name: draft.name, ...profileOf(draft) }))}
      onArchive={(id, next) => attempt(setArchived({ workspaceId, clientId: id as Id<"clients">, archived: next }))}
      onAssign={(id, memberId, assigned) => attempt(setAssigned({ workspaceId, clientId: id as Id<"clients">, memberId: memberId as Id<"members">, assigned }))}
    />
  );
}
