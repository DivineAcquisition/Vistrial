"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { saveDomainSettingsAction } from "@/app/(app)/settings/actions";
import {
  btnPrimary,
  btnSizeSm,
  helperClass,
  inputClass,
  labelClass,
} from "@/lib/ui";

export type DomainSettingsValues = {
  staffBaseUrl: string;
  clientBaseUrl: string;
  webhookBaseUrl: string;
  emailFrom: string;
  emailReplyTo: string;
};

/**
 * Base URLs and mail identity. Stored in app_settings so they change without
 * a deploy. Generated links must use these values — never the request host.
 */
export function DomainSettings({ values }: { values: DomainSettingsValues }) {
  const [pending, start] = useTransition();

  return (
    <form
      className="max-w-xl space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          const result = await saveDomainSettingsAction({
            staffBaseUrl: String(form.get("staffBaseUrl") ?? ""),
            clientBaseUrl: String(form.get("clientBaseUrl") ?? ""),
            webhookBaseUrl: String(form.get("webhookBaseUrl") ?? ""),
            emailFrom: String(form.get("emailFrom") ?? ""),
            emailReplyTo: String(form.get("emailReplyTo") ?? ""),
          });
          if (!result.ok) toast.error(result.error);
          else toast.success("Domain settings saved");
        });
      }}
    >
      <div>
        <label className={labelClass} htmlFor="staffBaseUrl">
          Staff base URL
        </label>
        <input
          id="staffBaseUrl"
          name="staffBaseUrl"
          type="url"
          required
          defaultValue={values.staffBaseUrl}
          className={inputClass}
          placeholder="https://admin.vistrial.io"
        />
        <p className={helperClass}>
          Team invitations, password resets, and staff-facing links.
        </p>
      </div>
      <div>
        <label className={labelClass} htmlFor="clientBaseUrl">
          Client base URL
        </label>
        <input
          id="clientBaseUrl"
          name="clientBaseUrl"
          type="url"
          required
          defaultValue={values.clientBaseUrl}
          className={inputClass}
          placeholder="https://app.vistrial.io"
        />
        <p className={helperClass}>
          Portal invitations, share links, and client-facing links.
        </p>
      </div>
      <div>
        <label className={labelClass} htmlFor="webhookBaseUrl">
          Webhook base URL
        </label>
        <input
          id="webhookBaseUrl"
          name="webhookBaseUrl"
          type="url"
          required
          defaultValue={values.webhookBaseUrl}
          className={inputClass}
          placeholder="https://….supabase.co/functions/v1/inbound"
        />
        <p className={helperClass}>
          Shown on each client detail page and copied into GoHighLevel. Points
          at the Supabase Edge Function — not at this deployment.
        </p>
      </div>
      <div>
        <label className={labelClass} htmlFor="emailFrom">
          From address
        </label>
        <input
          id="emailFrom"
          name="emailFrom"
          type="text"
          required
          defaultValue={values.emailFrom}
          className={inputClass}
          placeholder="Vistrial &lt;noreply@mail.vistrial.io&gt;"
        />
        <p className={helperClass}>
          Resend sends from the mail subdomain so deliverability problems stay
          contained.
        </p>
      </div>
      <div>
        <label className={labelClass} htmlFor="emailReplyTo">
          Reply-to
        </label>
        <input
          id="emailReplyTo"
          name="emailReplyTo"
          type="email"
          required
          defaultValue={values.emailReplyTo}
          className={inputClass}
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className={`${btnPrimary} ${btnSizeSm}`}
      >
        {pending ? "Saving…" : "Save domain settings"}
      </button>
    </form>
  );
}
