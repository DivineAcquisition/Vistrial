"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { setWeeklySummaryAction } from "@/lib/actions/portal";

export function WeeklySummaryToggle({
  enabled,
  disabled,
}: {
  enabled: boolean;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();

  return (
    <label className="flex items-start gap-3 text-sm text-silver">
      <input
        type="checkbox"
        className="mt-1"
        checked={enabled}
        disabled={disabled || pending}
        onChange={(event) => {
          const next = event.target.checked;
          start(async () => {
            const result = await setWeeklySummaryAction({ weekly_summary: next });
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.success(
              next ? "Weekly summary on." : "Weekly summary turned off."
            );
          });
        }}
      />
      <span>
        <span className="block font-medium text-white">Weekly summary email</span>
        <span className="text-xs text-dim">
          Appointment confirmations and billing notices cannot be turned off.
        </span>
      </span>
    </label>
  );
}
