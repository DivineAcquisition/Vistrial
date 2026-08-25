"use client";

import Link from "next/link";
import { useActionState } from "react";

import { updateOrganization } from "@/app/app/settings/organization/actions";
import type { SettingsSaveResult } from "@/app/app/settings/types";
import { Button, SubmitButton } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cardStack, cardTitle, errorClass, helperClass, successClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function OrganizationForm({
  salesCycleDays,
  baselineLookbackDays,
  callCoachingEmbargoHours,
  operatorAgentBatchCap,
}: {
  salesCycleDays: number;
  baselineLookbackDays: number;
  callCoachingEmbargoHours: number;
  operatorAgentBatchCap: number;
}) {
  const [state, action, pending] = useActionState(updateOrganization, initial);
  const error = state.status === "error" ? state.error : null;

  return (
    <Card className="max-w-xl">
      <form action={action} className={cardStack}>
        <Field
          label="Sales cycle (days)"
          name="sales_cycle_days"
          help="A lead cohort enters the headline outcome metric only after this many days. Default 60. Maturing cohorts are shown separately and never blended into that number."
        >
          <Input
            name="sales_cycle_days"
            id="sales_cycle_days"
            type="number"
            min={14}
            max={365}
            required
            defaultValue={salesCycleDays}
          />
        </Field>

        <Field
          label="Baseline lookback (days)"
          name="baseline_lookback_days"
          help="How far the automatic CRM history pull reaches. Default 365. Changing this does not re-run the backfill by itself."
        >
          <Input
            name="baseline_lookback_days"
            id="baseline_lookback_days"
            type="number"
            min={30}
            max={730}
            required
            defaultValue={baselineLookbackDays}
          />
        </Field>

        <Field
          label="Coaching delay (hours)"
          name="call_coaching_embargo_hours"
          help="A rep sees their own call analysis immediately. Owner and admin see it after this many hours. Default 48. Range 0–168. 0 means they see it immediately — the cost is that the rep does not get a private window first."
        >
          <Input
            name="call_coaching_embargo_hours"
            id="call_coaching_embargo_hours"
            type="number"
            min={0}
            max={168}
            required
            defaultValue={callCoachingEmbargoHours}
          />
        </Field>

        <Field
          label="Operator-agent batch cap"
          name="operator_agent_batch_cap"
          help="A confirmed agent write may touch this many records. Above it, the agent must narrow or split. Nothing is truncated. Default 10. Range 1–40."
        >
          <Input
            name="operator_agent_batch_cap"
            id="operator_agent_batch_cap"
            type="number"
            min={1}
            max={40}
            required
            defaultValue={operatorAgentBatchCap}
          />
        </Field>

        {error ? <p className={errorClass}>{error}</p> : null}
        {state.status === "saved" ? <p className={successClass}>Saved.</p> : null}

        <CardFooter>
          <SubmitButton pending={pending}>Save</SubmitButton>
        </CardFooter>
      </form>
    </Card>
  );
}

export function FollowUpOnboardingNote() {
  return (
    <Card className="max-w-xl">
      <h2 className={cardTitle}>Voice examples</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-silver">
        Follow-up drafts copy messages this business has actually sent. Paste two to five real
        examples on the Follow-up tab as part of setup — they matter more than formality sliders.
      </p>
      <div className="mt-5">
        <Button asChild variant="secondary" size="sm">
          <Link href="/app/settings/workspace">Add voice examples</Link>
        </Button>
      </div>
    </Card>
  );
}
