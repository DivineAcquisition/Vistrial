"use client";

import { useActionState, useState, useTransition } from "react";

import {
  cancelPlan,
  linkStripeCustomer,
  openBillingPortal,
  refreshBilling,
  unlinkStripeCustomer,
} from "@/app/(workspace)/app/settings/billing/actions";
import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { Button, SubmitButton } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { errorClass, helperClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function LinkCustomerForm({ current }: { current: string | null }) {
  const [state, action, pending] = useActionState(linkStripeCustomer, initial);
  useSettingsToast(state, pending, "Billing linked and read from Stripe.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>{current ? "Change link" : "Link"}</SubmitButton>}>
      <Field label="Stripe customer" name="customer_id" htmlFor="billing-customer">
        <Input
          id="billing-customer"
          name="customer_id"
          defaultValue={current ?? ""}
          placeholder="cus_..."
          autoComplete="off"
          spellCheck={false}
          required
        />
      </Field>
      <p className={helperClass}>
        The customer in Vistrial&apos;s Stripe account. Vistrial reads the plan, renewal, and invoices from it and
        changes nothing in Stripe.
      </p>
    </SettingsFormCard>
  );
}

function useActionMessage() {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<SettingsSaveResult>, done: string) =>
    startTransition(async () => {
      const result = await fn();
      setMessage(result.status === "error" ? { ok: false, text: result.error } : { ok: true, text: done });
    });
  return { message, pending, run };
}

function Message({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return (
    <p role="status" className={message.ok ? helperClass : errorClass}>
      {message.text}
    </p>
  );
}

export function RefreshBillingButton() {
  const { message, pending, run } = useActionMessage();
  return (
    <div>
      <Button type="button" variant="secondary" size="sm" loading={pending} onClick={() => run(refreshBilling, "Up to date.")}>
        Check Stripe again
      </Button>
      <Message message={message} />
    </div>
  );
}

export function UnlinkButton() {
  const { message, run } = useActionMessage();
  return (
    <div>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm">
            Remove link
          </Button>
        }
        title="Remove the billing link?"
        description="The workspace keeps working. Nothing changes in Stripe. The billing page goes back to waiting for your team."
        confirmLabel="Remove"
        onConfirm={() => run(unlinkStripeCustomer, "Link removed.")}
      />
      <Message message={message} />
    </div>
  );
}

/** One optional question. No extra steps. */
export function CancelPlanForm() {
  const [state, action, pending] = useActionState(cancelPlan, initial);
  useSettingsToast(state, pending, "Cancellation scheduled. Access continues until the end of the paid period.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Cancel at period end</SubmitButton>}>
      <Field label="Why are you leaving? (optional)" name="reason" htmlFor="billing-cancel-reason">
        <Input id="billing-cancel-reason" name="reason" maxLength={500} />
      </Field>
      <p className={helperClass}>
        You keep access until the end of the paid period. Export your data from Privacy first if you want a copy. Nothing is deleted by canceling.
      </p>
      {state.status === "error" ? <p className={errorClass}>{state.error}</p> : null}
    </SettingsFormCard>
  );
}

/** Opens the hosted page for the card and receipts; the action redirects there. */
export function ManagePaymentButton() {
  const { message, pending, run } = useActionMessage();
  return (
    <div>
      <Button type="button" loading={pending} onClick={() => run(openBillingPortal, "Opening…")}>
        Update payment method
      </Button>
      <Message message={message} />
    </div>
  );
}
