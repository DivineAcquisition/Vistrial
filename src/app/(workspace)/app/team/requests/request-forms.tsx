"use client";

import { useActionState } from "react";

import { replyToHelpRequest, updateDataRequest } from "@/app/(workspace)/app/team/requests/actions";
import type { SettingsSaveResult } from "@/app/(workspace)/app/settings/types";
import { SettingsFormCard } from "@/components/settings/settings-form-card";
import { useSettingsToast } from "@/components/settings/use-settings-toast";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DATA_REQUEST_STATUS, HELP_STATUS } from "@/lib/portal/requests";
import { helperClass } from "@/lib/ui";

const initial: SettingsSaveResult = { status: "idle" };

export function StaffReplyForm({ requestId, status }: { requestId: string; status: string }) {
  const [state, action, pending] = useActionState(replyToHelpRequest.bind(null, requestId), initial);
  useSettingsToast(state, pending, "Reply sent. They will get an email.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Send reply</SubmitButton>}>
      <Field label="Reply" name="body" htmlFor={`staff-reply-${requestId}`}>
        <Textarea id={`staff-reply-${requestId}`} name="body" rows={4} maxLength={4000} />
      </Field>
      <Field label="Status" name="status" htmlFor={`staff-status-${requestId}`}>
        <Select id={`staff-status-${requestId}`} name="status" defaultValue={status === "received" ? "answered" : status}>
          {Object.entries(HELP_STATUS)
            .filter(([value]) => value !== "received")
            .map(([value, item]) => (
              <option key={value} value={value}>
                {item.label}
              </option>
            ))}
        </Select>
      </Field>
      <p className={helperClass}>They see this as “Your Vistrial team”. A reply also emails them.</p>
    </SettingsFormCard>
  );
}

export function DataRequestUpdateForm({ requestId, status }: { requestId: string; status: string }) {
  const [state, action, pending] = useActionState(updateDataRequest.bind(null, requestId), initial);
  useSettingsToast(state, pending, "Updated. The owner will be told.");
  return (
    <SettingsFormCard action={action} footer={<SubmitButton pending={pending}>Update</SubmitButton>}>
      <Field label="Status" name="status" htmlFor={`data-status-${requestId}`}>
        <Select id={`data-status-${requestId}`} name="status" defaultValue={status}>
          {Object.entries(DATA_REQUEST_STATUS).map(([value, item]) => (
            <option key={value} value={value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Note for them" name="team_note" htmlFor={`data-note-${requestId}`}>
        <Textarea id={`data-note-${requestId}`} name="team_note" rows={2} maxLength={2000} />
      </Field>
      <p className={helperClass}>Updating the status does not export or delete anything. Do that separately, then mark it done.</p>
    </SettingsFormCard>
  );
}
