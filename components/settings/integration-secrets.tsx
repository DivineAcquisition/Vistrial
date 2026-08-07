"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { saveIntegrationNotifyEmailAction } from "@/app/(app)/settings/actions";
import {
  btnPrimary,
  btnSizeSm,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

/**
 * Owner-only. Payment processor keys and webhook secrets remain in environment
 * variables — GAP: there is no encrypted secret store in-app yet. This panel
 * shows configuration presence and lets Owners update the notify address used
 * for lockouts and operational alerts.
 */
export function IntegrationSecrets({
  stripeConfigured,
  stripeWebhookConfigured,
  resendConfigured,
  notifyEmail,
}: {
  stripeConfigured: boolean;
  stripeWebhookConfigured: boolean;
  resendConfigured: boolean;
  notifyEmail: string;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <ul className="space-y-2 text-sm text-silver">
        <li>
          Stripe secret key:{" "}
          {stripeConfigured ? "configured (env)" : "not set"}
        </li>
        <li>
          Stripe webhook secret:{" "}
          {stripeWebhookConfigured ? "configured (env)" : "not set"}
        </li>
        <li>
          Resend API key: {resendConfigured ? "configured (env)" : "not set"}
        </li>
      </ul>
      <p className={helperClass}>
        Secret values are never shown. Admins and Members cannot open this
        section.
      </p>
      <form
        className="max-w-md space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          start(async () => {
            const result = await saveIntegrationNotifyEmailAction({
              email: String(form.get("email") ?? ""),
            });
            if (!result.ok) toast.error(result.error);
            else toast.success("Notification address saved");
          });
        }}
      >
        <div>
          <label className={labelClass} htmlFor="notify_email">
            Admin notify email
          </label>
          <input
            id="notify_email"
            name="email"
            type="email"
            defaultValue={notifyEmail}
            className={inputClass}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className={`${btnPrimary} ${btnSizeSm}`}
        >
          Save
        </button>
      </form>
    </div>
  );
}
