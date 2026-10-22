"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { setAgentSidebarAction } from "@/app/(workspace)/app/agents/roster-actions";
import { useAgentSummary } from "@/components/agents/summary-context";
import { Switch } from "@/components/ui/switch";

/** Vistrial staff only: the agent-first sidebar for this workspace. The old sidebar stays behind it. */
export function AgentSidebarSwitch() {
  const { summary, refresh } = useAgentSummary();
  const [on, setOn] = useState(Boolean(summary?.sidebar));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-brand-500/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-card-foreground">Agent sidebar for this business</p>
        <p className="text-xs text-muted-foreground">Only the Vistrial team sees this switch. Turning it off brings back the current sidebar.</p>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Agent sidebar"
        onCheckedChange={(next) => {
          setOn(next);
          setError(null);
          start(async () => {
            const result = await setAgentSidebarAction(next);
            if (!result.ok) {
              setOn(!next);
              setError(result.error);
              return;
            }
            refresh();
            router.refresh();
          });
        }}
      />
    </div>
  );
}
