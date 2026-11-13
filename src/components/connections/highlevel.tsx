"use client";

import { useAction, useMutation, useQuery } from "convex/react";

import { HighLevelView, type HighLevelStatus } from "@/components/connections/highlevel-view";
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
