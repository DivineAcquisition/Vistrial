"use client";

import { useAction, useMutation, useQuery } from "convex/react";

import { HighLevelActionsView, type HighLevelActionsData } from "@/components/connections/highlevel-actions-view";
import { HighLevelView, type HighLevelStatus } from "@/components/connections/highlevel-view";
import { describeError } from "@/lib/errors/user-error";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Props = {
  workspaceId: Id<"workspaces">;
  /** The client this is for. Missing means the organization itself. */
  clientId?: Id<"clients">;
  /** The client's name, for the words on the card. */
  forName?: string | null;
  /** The `?highlevel=` outcome HighLevel's install sent the person back with. */
  returned?: string | null;
  /** The app page to come back to after HighLevel's install page. Defaults to the HighLevel connection page. */
  returnPath?: string;
  compact?: boolean;
  manageHref?: string;
};

/** The HighLevel card, fed by Convex. Tokens never reach the browser. */
export function HighLevel({ workspaceId, clientId, forName, returned, returnPath, compact, manageHref }: Props) {
  const status = useQuery(api.highLevel.status, { workspaceId, clientId });
  const startConnect = useMutation(api.highLevel.startConnect);
  const disconnect = useMutation(api.highLevel.disconnect);
  const syncNow = useAction(api.highLevel.syncNow);

  if (status === undefined) return <p className="text-sm text-muted-foreground">Loading HighLevel.</p>;
  const back = returnPath ?? `/app/connections/highlevel${clientId ? `?client=${clientId}` : ""}`;
  return (
    <HighLevelView
      status={status as HighLevelStatus}
      returned={returned}
      forName={forName}
      compact={compact}
      manageHref={manageHref}
      actions={{
        connect: async () => {
          const { url } = await startConnect({ workspaceId, clientId, returnOrigin: window.location.origin, returnPath: back });
          window.location.assign(url);
        },
        sync: () => syncNow({ workspaceId, clientId }),
        disconnect: async () => {
          try {
            await disconnect({ workspaceId, clientId });
          } catch (problem) {
            showError(problem);
          }
        },
      }}
    />
  );
}

/**
 * The slot onboarding drops in: a compact HighLevel card for the organization or one client. It sends the
 * person to HighLevel's install page and back to `returnPath` (the onboarding step), with `?highlevel=` set,
 * which the caller passes back in as `returned`. `onConnected` is not needed: the card follows Convex live.
 *
 * <HighLevelConnectSlot workspaceId={id} clientId={client} returnPath="/app/onboarding?step=crm" returned={params.get("highlevel")} />
 */
export function HighLevelConnectSlot(props: Omit<Props, "compact" | "manageHref">) {
  const manage = `/app/connections/highlevel${props.clientId ? `?client=${props.clientId}` : ""}`;
  return <HighLevel {...props} compact manageHref={manage} />;
}

/** The reason a request was refused, in the person's words, or null when it worked. */
async function reasonOf(work: () => Promise<unknown>) {
  try {
    await work();
    return null;
  } catch (problem) {
    return describeError(problem, "That did not work. Try again in a moment.").message;
  }
}

/** Acting in HighLevel for one client (or the organization): the Owner's switch, proposals and decisions. */
export function HighLevelActions({ workspaceId, clientId }: { workspaceId: Id<"workspaces">; clientId?: Id<"clients"> }) {
  const data = useQuery(api.crmActions.list, { workspaceId, clientId });
  const setActing = useMutation(api.crmActions.setActing);
  const propose = useMutation(api.crmActions.propose);
  const decide = useMutation(api.crmActions.decide);
  const undo = useMutation(api.crmActions.undo);
  if (data === undefined) return null;
  return (
    <HighLevelActionsView
      data={data as HighLevelActionsData}
      handlers={{
        setActing: async (on) => {
          try {
            await setActing({ workspaceId, clientId, on });
          } catch (problem) {
            showError(problem);
          }
        },
        propose: (input) => reasonOf(() => propose({ workspaceId, clientId, ...input })),
        decide: async (actionId, approve, confirmWord) => {
          let state: string | null = null;
          const problem = await reasonOf(async () => {
            state = (await decide({ workspaceId, actionId: actionId as Id<"crmActions">, approve, confirmWord })).state;
          });
          if (problem) return problem;
          if (state === "expired") return "This waited more than a day and expired. Nothing was done in HighLevel.";
          if (state === "cancelled") return "Acting is off or the connection is gone, so this was cancelled. Nothing was done in HighLevel.";
          return null;
        },
        undo: (actionId) => reasonOf(() => undo({ workspaceId, actionId: actionId as Id<"crmActions"> })),
      }}
    />
  );
}
