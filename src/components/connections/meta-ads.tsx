"use client";

import { useAction, useMutation, useQuery } from "convex/react";

import { MetaAdsView, type MetaStatus } from "@/components/connections/meta-ads-view";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** The Meta ads card, fed by Convex. The token never reaches the browser. */
export function MetaAds({ workspaceId, returned }: { workspaceId: Id<"workspaces">; returned: string | null }) {
  const status = useQuery(api.metaAds.status, { workspaceId });
  const startConnect = useMutation(api.metaAds.startConnect);
  const disconnect = useMutation(api.metaAds.disconnect);
  const adAccounts = useAction(api.metaAds.adAccounts);
  const chooseAccount = useAction(api.metaAds.chooseAccount);
  const syncNow = useAction(api.metaAds.syncNow);

  if (status === undefined) return <p className="text-sm text-muted-foreground">Loading Meta ads.</p>;
  return (
    <MetaAdsView
      status={status as MetaStatus}
      returned={returned}
      actions={{
        connect: async () => {
          const { url } = await startConnect({ workspaceId, returnOrigin: window.location.origin });
          window.location.assign(url);
        },
        loadAccounts: () => adAccounts({ workspaceId }),
        chooseAccount: (adAccountId) => chooseAccount({ workspaceId, adAccountId }),
        sync: (range) => syncNow({ workspaceId, ...(range ? { range } : {}) }),
        disconnect: async () => {
          await disconnect({ workspaceId });
        },
      }}
    />
  );
}
