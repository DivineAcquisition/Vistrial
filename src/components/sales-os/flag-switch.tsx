"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useOrg } from "@/components/app/org-provider";
import { Switch } from "@/components/ui/switch";
import { setSalesOsFlag } from "@/lib/sales-os/flag-actions";
import { SALES_OS_HOME } from "@/lib/shell/nav";

/** Vistrial staff only: the Sales OS shell and conversation workspace for this business. */
export function SalesOsSwitch({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { workspaceRole } = useOrg();
  const previousHome = workspaceRole === "operator" ? "/app/today" : "/app/home";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-brand-500/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-card-foreground">Sales OS for this business</p>
        <p className="text-xs text-muted-foreground">
          Only the Vistrial team sees this switch. On, this workspace opens in the Sales OS. Off, it keeps the current home.
        </p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Sales OS"
        onCheckedChange={(next) => {
          setOn(next);
          setError(null);
          start(async () => {
            const result = await setSalesOsFlag(next);
            if (!result.ok) {
              setOn(!next);
              setError(result.error);
              return;
            }
            router.push(next ? SALES_OS_HOME : previousHome);
            router.refresh();
          });
        }}
      />
    </div>
  );
}
