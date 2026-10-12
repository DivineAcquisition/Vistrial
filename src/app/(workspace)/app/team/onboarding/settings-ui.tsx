"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  saveOnboardingSettings,
  saveStageDefinition,
  saveTemplateDefaults,
  setCreatePermission,
  type StaffResult,
} from "@/app/(workspace)/app/team/onboarding/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { errorClass, successClass } from "@/lib/ui";

function Outcome({ result }: { result: StaffResult | null }) {
  if (!result) return null;
  if (!result.ok) {
    return (
      <p role="alert" className={errorClass}>
        {result.error}
      </p>
    );
  }
  return result.message ? (
    <p role="status" className={successClass}>
      {result.message}
    </p>
  ) : null;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<StaffResult | null>(null);
  const run = (fn: () => Promise<StaffResult>) =>
    start(async () => {
      setResult(
        await fn().catch(() => ({
          ok: false as const,
          error: "Something went wrong. Nothing was changed.",
        })),
      );
      router.refresh();
    });
  return { pending, result, run };
}

/** "3, 7" → [3, 7]; anything that is not a whole number is dropped. */
function dayList(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((day) => Number.isInteger(day) && day > 0 && day < 100);
}

const NUMBER_FIELDS = [
  {
    key: "onboarding_nudge_every_days",
    label: "Remind the Owner at most every (days)",
    min: 1,
    max: 30,
  },
  {
    key: "onboarding_nudge_max_per_step",
    label: "Reminders per step, at most",
    min: 0,
    max: 10,
  },
  {
    key: "onboarding_stuck_customer_days",
    label: "Stuck after waiting on the customer (days)",
    min: 1,
    max: 60,
  },
  {
    key: "onboarding_carrier_slow_days",
    label: "Carrier approval is slow after (days)",
    min: 1,
    max: 60,
  },
  {
    key: "onboarding_max_lookback_days",
    label: "Longest import look-back an Owner can choose (days)",
    min: 30,
    max: 730,
  },
  {
    key: "onboarding_ai_case_file_limit",
    label: "Full case files per workspace, default",
    min: 0,
    max: 100000,
  },
  {
    key: "onboarding_ai_rate_per_hour",
    label: "Full case files per hour, default",
    min: 1,
    max: 2000,
  },
  {
    key: "onboarding_ai_active_days",
    label: "Full case files only for leads active in the last (days)",
    min: 1,
    max: 365,
  },
] as const;

export function OnboardingTimingsForm({ settings }: { settings: Record<string, unknown> }) {
  const { pending, result, run } = useRun();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(NUMBER_FIELDS.map((field) => [field.key, String(settings[field.key] ?? "")])),
  );
  const [inviteDays, setInviteDays] = useState(((settings.onboarding_invite_reminder_days as number[] | null) ?? [3, 7]).join(", "));
  const [checkinDays, setCheckinDays] = useState(((settings.onboarding_checkin_days as number[] | null) ?? [1, 3, 7]).join(", "));

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const patch: Record<string, unknown> = {
          onboarding_invite_reminder_days: dayList(inviteDays),
          onboarding_checkin_days: dayList(checkinDays),
        };
        for (const field of NUMBER_FIELDS) {
          const value = Number(values[field.key]);
          if (Number.isInteger(value)) patch[field.key] = Math.min(field.max, Math.max(field.min, value));
        }
        run(() => saveOnboardingSettings(patch));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Remind staff about an unaccepted Owner invitation on days" name="invite_days" htmlFor="ob-invite-days" help="For example: 3, 7">
          <Input id="ob-invite-days" value={inviteDays} onChange={(event) => setInviteDays(event.target.value)} />
        </Field>
        <Field label="First-week check-ins on days" name="checkin_days" htmlFor="ob-checkin-days" help="Counted from go-live approval. For example: 1, 3, 7">
          <Input id="ob-checkin-days" value={checkinDays} onChange={(event) => setCheckinDays(event.target.value)} />
        </Field>
        {NUMBER_FIELDS.map((field) => (
          <Field key={field.key} label={field.label} name={field.key} htmlFor={`ob-${field.key}`}>
            <Input
              id={`ob-${field.key}`}
              type="number"
              min={field.min}
              max={field.max}
              value={values[field.key] ?? ""}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  [field.key]: event.target.value,
                }))
              }
            />
          </Field>
        ))}
      </div>
      <Button type="submit" variant="primary" size="sm" loading={pending}>
        Save onboarding timings
      </Button>
      <Outcome result={result} />
    </form>
  );
}

export function StageDefinitionForm({
  stageKey,
  customerLabel,
  staffLabel,
  why,
  timeEstimate,
}: {
  stageKey: string;
  customerLabel: string;
  staffLabel: string;
  why: string;
  timeEstimate: string;
}) {
  const { pending, result, run } = useRun();
  const [customer, setCustomer] = useState(customerLabel);
  const [staff, setStaff] = useState(staffLabel);
  const [reason, setReason] = useState(why);
  const [estimate, setEstimate] = useState(timeEstimate);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() =>
          saveStageDefinition(stageKey, {
            customer_label: customer,
            staff_label: staff,
            why: reason,
            time_estimate: estimate,
          }),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer sees" name="customer_label" htmlFor={`def-${stageKey}-c`}>
          <Input id={`def-${stageKey}-c`} value={customer} onChange={(event) => setCustomer(event.target.value)} maxLength={80} />
        </Field>
        <Field label="Staff see" name="staff_label" htmlFor={`def-${stageKey}-s`}>
          <Input id={`def-${stageKey}-s`} value={staff} onChange={(event) => setStaff(event.target.value)} maxLength={80} />
        </Field>
        <Field label="Why it matters" name="why" htmlFor={`def-${stageKey}-w`}>
          <Textarea id={`def-${stageKey}-w`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={2} />
        </Field>
        <Field label="Time estimate" name="time_estimate" htmlFor={`def-${stageKey}-t`}>
          <Input id={`def-${stageKey}-t`} value={estimate} onChange={(event) => setEstimate(event.target.value)} maxLength={60} />
        </Field>
      </div>
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Save
      </Button>
      <Outcome result={result} />
    </form>
  );
}

export function TemplateDefaultsForm({ templateId, name, lookback, watchDays }: { templateId: string; name: string; lookback: number; watchDays: number }) {
  const { pending, result, run } = useRun();
  const [days, setDays] = useState(String(lookback));
  const [watch, setWatch] = useState(String(watchDays));
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(() => saveTemplateDefaults(templateId, Number(days), Number(watch)));
      }}
    >
      <p className="w-full text-sm text-white">{name}</p>
      <Field label="Import look-back (days)" name="lookback" htmlFor={`tpl-${templateId}-l`}>
        <Input id={`tpl-${templateId}-l`} type="number" min={7} max={365} value={days} onChange={(event) => setDays(event.target.value)} />
      </Field>
      <Field label="Sentry watch-only (days)" name="watch" htmlFor={`tpl-${templateId}-w`}>
        <Input id={`tpl-${templateId}-w`} type="number" min={0} max={14} value={watch} onChange={(event) => setWatch(event.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        Save
      </Button>
      <Outcome result={result} />
    </form>
  );
}

export function CreatePermissionToggle({ userId, name, allowed }: { userId: string; name: string; allowed: boolean }) {
  const { pending, result, run } = useRun();
  return (
    <div className="space-y-1">
      <Switch
        label={`${name} can create workspaces`}
        aria-label={`${name} can create workspaces`}
        checked={allowed}
        disabled={pending}
        onCheckedChange={(next: boolean) => run(() => setCreatePermission(userId, next))}
      />
      <Outcome result={result} />
    </div>
  );
}
