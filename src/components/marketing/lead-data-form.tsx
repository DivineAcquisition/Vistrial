"use client";

import { useActionState } from "react";

import { submitLeadNote, type LeadNoteState } from "@/app/(marketing)/privacy/requests/actions";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { textareaClass } from "@/lib/ui";

const initial: LeadNoteState = { ok: true, message: "" };

export function LeadDataForm() {
  const [state, action, pending] = useActionState(submitLeadNote, initial);
  return (
    <form action={action} className="space-y-4">
      {state.message ? <p role="status" className="text-sm text-silver">{state.message}</p> : null}
      <Field label="Your name" name="name" htmlFor="lead-name">
        <Input id="lead-name" name="name" autoComplete="name" />
      </Field>
      <Field label="Email" name="email" htmlFor="lead-email" required>
        <Input id="lead-email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Which business contacted you" name="business" htmlFor="lead-business">
        <Input id="lead-business" name="business" />
      </Field>
      <Field label="What should change" name="details" htmlFor="lead-details" required>
        <textarea id="lead-details" name="details" required maxLength={2000} className={textareaClass} />
      </Field>
      <SubmitButton pending={pending}>Send</SubmitButton>
    </form>
  );
}
