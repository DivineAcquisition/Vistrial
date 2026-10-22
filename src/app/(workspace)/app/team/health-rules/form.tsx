"use client";

import { useState, useTransition } from "react";

import { saveHealthRules } from "@/app/(workspace)/app/team/staff-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { HealthRules } from "@/lib/staff/types";
import { errorClass, helperClass } from "@/lib/ui";

const NUMBER_KEYS = [
  ["failed_runs_24h", "Failed runs in 24 hours before Watch"],
  ["response_met_percent", "Response target, percent"],
  ["response_min_leads", "Leads in the period before the target counts"],
  ["response_period_days", "Response period, days"],
  ["draft_oldest_hours", "Hours a draft can wait before Watch"],
  ["onboarding_stall_days", "Days without a setup change before a note"],
] as const;

export function HealthRulesForm({ rules }: { rules: HealthRules }) {
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="max-w-xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const patch: Record<string, unknown> = {};
        for (const [key] of NUMBER_KEYS) patch[key] = Number(form.get(key));
        patch.connection_failing = form.get("connection_failing") === "on";
        patch.open_escalation = form.get("open_escalation") === "on";
        patch.request_overdue = form.get("request_overdue") === "on";
        patch.payment_failed = form.get("payment_failed") === "on";
        patch.agent_paused_watch = form.get("agent_paused_watch") === "on";
        startTransition(async () => {
          const result = await saveHealthRules(patch, description);
          setError(result.ok ? null : result.error);
        });
      }}
    >
      {NUMBER_KEYS.map(([key, label]) => (
        <Field key={key} label={label} name={key}>
          <Input name={key} type="number" defaultValue={rules[key]} required />
        </Field>
      ))}
      {(
        [
          ["connection_failing", "A failing connection needs attention"],
          ["open_escalation", "An open escalation needs attention"],
          ["request_overdue", "An overdue request needs attention"],
          ["payment_failed", "A failed payment needs attention, for people who can see billing"],
          ["agent_paused_watch", "An agent paused by someone other than the Owner is Watch"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center gap-2 text-sm text-strong">
          <input type="checkbox" name={key} defaultChecked={rules[key]} />
          {label}
        </label>
      ))}
      <Field label="What changed" name="description">
        <Input value={description} onChange={(event) => setDescription(event.target.value)} required maxLength={600} />
      </Field>
      <Button type="submit" variant="primary" disabled={pending}>
        Save a new version
      </Button>
      {error ? <p className={errorClass}>{error}</p> : <p className={helperClass}>The previous version stays in the list.</p>}
    </form>
  );
}
