"use client";

import { useActionState, useState, useTransition } from "react";

import { closeHelpRequest, createHelpRequest, followUpHelpRequest } from "@/app/(workspace)/app/help/actions";
import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { HELP_TOPICS, type HelpTopic } from "@/lib/portal/requests";
import { errorClass, helperClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function HelpRequestForm({
  defaultTopic,
  pagePath,
  lead,
}: {
  defaultTopic: HelpTopic;
  pagePath: string | null;
  lead: { id: string; name: string } | null;
}) {
  const [state, action, pending] = useActionState(createHelpRequest, initial);
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Send to your team</SubmitButton>}>
      <Field label="What is it about?" name="topic" htmlFor="help-topic">
        <Select id="help-topic" name="topic" defaultValue={defaultTopic}>
          {Object.entries(HELP_TOPICS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Message" name="message" htmlFor="help-message">
        <Textarea id="help-message" name="message" rows={5} maxLength={4000} required />
      </Field>
      {pagePath ? <input type="hidden" name="page_path" value={pagePath} /> : null}
      {lead ? <input type="hidden" name="lead_id" value={lead.id} /> : null}
      <p className={helperClass}>
        {lead ? `This will be about ${lead.name}. ` : ""}
        {pagePath ? `Your team will see you were on ${pagePath}. ` : ""}
        Your Vistrial team gets this by email and replies here. You will get an email when they do.
      </p>
      {state.status === "error" ? (
        <p role="alert" className={errorClass}>
          {state.error}
        </p>
      ) : null}
    </SettingsFormCard>
  );
}

export function FollowUpForm({ requestId, label = "Reply" }: { requestId: string; label?: string }) {
  const [state, action, pending] = useActionState(followUpHelpRequest.bind(null, requestId), initial);
  useSettingsToast(state, pending, "Sent.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>{label}</SubmitButton>}>
      <Field label="Your reply" name="body" htmlFor={`reply-${requestId}`}>
        <Textarea id={`reply-${requestId}`} name="body" rows={3} maxLength={4000} required />
      </Field>
    </SettingsFormCard>
  );
}

export function CloseRequestButton({ requestId }: { requestId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await closeHelpRequest(requestId);
            setMessage(result.status === "error" ? result.error : null);
          })
        }
      >
        Mark as sorted
      </Button>
      {message ? <p className={errorClass}>{message}</p> : null}
    </div>
  );
}
