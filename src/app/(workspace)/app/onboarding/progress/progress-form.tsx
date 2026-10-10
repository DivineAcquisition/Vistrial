"use client";

import { useActionState } from "react";

import { setOnboardingStep } from "@/app/(workspace)/app/onboarding/progress/actions";
import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ONBOARDING_STATES, type OnboardingStep } from "@/lib/portal/onboarding";
import { helperClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function OnboardingOverrideForm({ steps }: { steps: OnboardingStep[] }) {
  const [state, action, pending] = useActionState(setOnboardingStep, initial);
  useSettingsToast(state, pending, "Step updated.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Update step</SubmitButton>}>
      <Field label="Step" name="key" htmlFor="step-key">
        <Select id="step-key" name="key" defaultValue={steps[0]?.key}>
          {steps.map((step) => (
            <option key={step.key} value={step.key}>
              {step.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="State" name="state" htmlFor="step-state">
        <Select id="step-state" name="state" defaultValue="">
          <option value="">Follow the workspace</option>
          {Object.entries(ONBOARDING_STATES).map(([value, item]) => (
            <option key={value} value={value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note for them" name="note" htmlFor="step-note">
        <Textarea id="step-note" name="note" rows={2} maxLength={300} />
      </Field>
      <Field label="Expected timing" name="eta" htmlFor="step-eta">
        <Input id="step-eta" name="eta" maxLength={80} placeholder="This week" />
      </Field>
      <p className={helperClass}>
        Leave the state on “Follow the workspace” and clear the note to drop an override. The step then follows what is actually set up.
      </p>
    </SettingsFormCard>
  );
}
