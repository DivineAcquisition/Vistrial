"use client";

import { useAction, useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { BillingView, type BillingData } from "@/components/billing/billing-view";
import { useWorkspaceShell } from "@/components/shell/shell-context";
import { EmptyState } from "@/components/ui/empty-state";
import { errorWords } from "@/lib/research/words";
import { api } from "../../../convex/_generated/api";

/** Workspace → Billing, fed by Convex. Owners buy and manage; everyone sees the balance. */
export function BillingScreen() {
  const shell = useWorkspaceShell();
  const data = useQuery(api.billing.overview, shell ? { workspaceId: shell.workspaceId } : "skip");
  const refresh = useAction(api.billingActions.refresh);
  const subscribe = useAction(api.billingActions.subscribe);
  const topUp = useAction(api.billingActions.topUp);
  const setAutoRefill = useAction(api.billingActions.setAutoRefill);
  const portal = useAction(api.billingActions.portal);
  const params = useSearchParams();
  const paid = params.get("paid");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  // Coming back from checkout, or opening the page: read the latest balance from Autumn.
  useEffect(() => {
    if (!shell || !data?.on) return;
    void refresh({ workspaceId: shell.workspaceId }).catch(() => undefined);
  }, [shell, data?.on, paid, refresh]);
  const paidNotice = paid === "plan" ? "Thanks. Your plan is on and its credits are added." : paid ? "Thanks. Your credits are added." : "";

  if (!shell) return <EmptyState kind="permission" title="Sign in to open your workspace." />;
  if (data === undefined) return <p className="text-sm text-muted-foreground">Loading billing.</p>;

  const go = async (key: string, run: () => Promise<{ url: string | null } | null>) => {
    setBusy(key);
    setNotice("");
    try {
      const result = await run();
      if (result?.url) window.location.assign(result.url);
    } catch (error) {
      setNotice(errorWords(error, "That did not go through."));
    } finally {
      setBusy(null);
    }
  };
  const origin = typeof window === "undefined" ? undefined : window.location.origin;

  return (
    <BillingView
      data={data as BillingData}
      busy={busy}
      notice={notice || paidNotice}
      actions={{
        subscribe: () => void go("plan", () => subscribe({ workspaceId: shell.workspaceId, returnOrigin: origin })),
        topUp: (amountCents) => void go(`topup:${amountCents}`, () => topUp({ workspaceId: shell.workspaceId, amountCents, returnOrigin: origin })),
        autoRefill: (enabled) => void go("refill", async () => (await setAutoRefill({ workspaceId: shell.workspaceId, enabled }), null)),
        portal: () => void go("portal", () => portal({ workspaceId: shell.workspaceId, returnOrigin: origin })),
      }}
    />
  );
}
