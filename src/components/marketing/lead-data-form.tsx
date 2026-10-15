"use client";

import { useActionState } from "react";

import { submitLeadNote, type LeadNoteState } from "@/app/(marketing)/privacy/requests/actions";
import { FormGlow, publicFieldClass, publicFormClass, publicSubmitClass } from "@/components/marketing/public-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { textareaClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

const initial: LeadNoteState = { ok: true, message: "" };

export function LeadDataForm() {
  const [state, action, pending] = useActionState(submitLeadNote, initial);
  return (
    <form action={action} className={publicFormClass}>
      <FormGlow />
      {state.message ? <p role="status" className="text-sm text-silver">{state.message}</p> : null}
      <Field label="Your name" name="name" htmlFor="lead-name">
        <Input className={publicFieldClass} id="lead-name" name="name" autoComplete="name" />
      </Field>
      <Field label="Email" name="email" htmlFor="lead-email" required>
        <Input className={publicFieldClass} id="lead-email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Which business contacted you" name="business" htmlFor="lead-business">
        <Input className={publicFieldClass} id="lead-business" name="business" />
      </Field>
      <Field label="What should change" name="details" htmlFor="lead-details" required>
        <textarea id="lead-details" name="details" required maxLength={2000} className={cn(textareaClass, publicFieldClass)} />
      </Field>
      <SubmitButton pending={pending} size="lg" className={publicSubmitClass}>Send</SubmitButton>
    </form>
  );
}
