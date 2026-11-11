"use client";

import { useAction, useMutation, useQuery } from "convex/react";

import { IntegrationsView } from "@/components/connections/integrations-view";
import { showError } from "@/lib/errors/show-error";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** The other connections, fed by Convex. Tokens never reach the browser. */
export function Integrations({ workspaceId, returned }: { workspaceId: Id<"workspaces">; returned: { provider: string | null; outcome: string } | null }) {
  const data = useQuery(api.integrations.list, { workspaceId });
  const startConnect = useMutation(api.integrations.startConnect);
  const disconnect = useAction(api.integrationActions.disconnect);

  if (data === undefined) return <p className="text-sm text-muted-foreground">Loading connections.</p>;
  return (
    <IntegrationsView
      providers={data.providers}
      canManage={data.canManage}
      returned={returned}
      actions={{
        connect: async (provider) => {
          try {
            const { url } = await startConnect({ workspaceId, provider, returnOrigin: window.location.origin });
            window.location.assign(url);
          } catch (problem) {
            showError(problem);
          }
        },
        disconnect: async (provider) => {
          try {
            await disconnect({ workspaceId, provider });
          } catch (problem) {
            showError(problem);
          }
        },
      }}
    />
  );
}
