"use client";

import { useState, useTransition } from "react";

import { saveCannedReply, saveSupportSettings } from "@/app/(workspace)/app/team/staff-actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorClass, helperClass } from "@/lib/ui";

export function SupportForm({ settings }: { settings: Record<string, unknown> }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [replyError, setReplyError] = useState<string | null>(null);
  return (
    <div className="max-w-xl space-y-8">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          startTransition(async () => {
            const result = await saveSupportSettings({
              business_tz: String(form.get("business_tz") ?? ""),
              business_start: String(form.get("business_start") ?? ""),
              business_end: String(form.get("business_end") ?? ""),
              flag_after_minutes: Number(form.get("flag_after_minutes")),
              escalate_after_minutes: Number(form.get("escalate_after_minutes")),
              data_request_target_days: Number(form.get("data_request_target_days")),
            });
            setError(result.ok ? null : result.error);
          });
        }}
      >
        <Field label="Timezone" name="business_tz">
          <Input name="business_tz" defaultValue={String(settings.business_tz ?? "")} required />
        </Field>
        <Field label="Day starts" name="business_start">
          <Input name="business_start" defaultValue={String(settings.business_start ?? "").slice(0, 5)} required />
        </Field>
        <Field label="Day ends" name="business_end">
          <Input name="business_end" defaultValue={String(settings.business_end ?? "").slice(0, 5)} required />
        </Field>
        <Field label="Flag a request after this many business minutes" name="flag_after_minutes">
          <Input name="flag_after_minutes" type="number" defaultValue={Number(settings.flag_after_minutes ?? 240)} required />
        </Field>
        <Field label="Raise it to a Platform Admin after this many business minutes" name="escalate_after_minutes">
          <Input name="escalate_after_minutes" type="number" defaultValue={Number(settings.escalate_after_minutes ?? 540)} required />
        </Field>
        <Field label="Data request target, days" name="data_request_target_days">
          <Input name="data_request_target_days" type="number" defaultValue={Number(settings.data_request_target_days ?? 5)} required />
        </Field>
        <Button type="submit" variant="primary" disabled={pending}>
          Save
        </Button>
        {error ? <p className={errorClass}>{error}</p> : <p className={helperClass}>Business days stay Monday to Friday unless edited in the database routing record.</p>}
      </form>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formEl = event.currentTarget;
          const form = new FormData(formEl);
          startTransition(async () => {
            const result = await saveCannedReply(String(form.get("title") ?? ""), String(form.get("body") ?? ""), true);
            setReplyError(result.ok ? null : result.error);
            if (result.ok) formEl.reset();
          });
        }}
      >
        <h2 className="font-heading text-sm text-card-foreground">Shared reply</h2>
        <Field label="Title" name="title">
          <Input name="title" required maxLength={80} />
        </Field>
        <Field label="Body" name="body">
          <Textarea name="body" required maxLength={4000} rows={4} />
        </Field>
        <Button type="submit" disabled={pending}>
          Add shared reply
        </Button>
        {replyError ? <p className={errorClass}>{replyError}</p> : null}
      </form>
    </div>
  );
}
