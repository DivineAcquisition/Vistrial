"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useAgentSummary } from "@/components/agents/summary-context";
import { setSalesCalendarFlag } from "@/lib/calendar/actions";
import { Switch } from "@/components/ui/switch";

/** Vistrial staff only: the sales calendar for this workspace. */
export function SalesCalendarSwitch() {
  const { summary, refresh } = useAgentSummary();
  const [on, setOn] = useState(Boolean(summary?.salesCalendar));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-brand-500/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-card-foreground">Calendar for this business</p>
        <p className="text-xs text-muted-foreground">Only the Vistrial team sees this switch. Off, the calendar page is not there.</p>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <Switch
        checked={on}
        disabled={pending}
        aria-label="Sales calendar"
        onCheckedChange={(next) => {
          setOn(next);
          setError(null);
          start(async () => {
            const result = await setSalesCalendarFlag(next);
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
