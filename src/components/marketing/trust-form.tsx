"use client";

import { useActionState } from "react";

import { submitTrustForm, type TrustFormState } from "@/app/(marketing)/security/actions";
import { FormGlow, publicCheckClass, publicFieldClass, publicFormClass, publicSubmitClass } from "@/components/marketing/public-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { checkboxClass, textareaClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

const initial: TrustFormState = { ok: true, message: "", errors: {} };

const NEEDS = [
  ["questionnaire", "Security questionnaire"],
  ["dpa", "Data processing agreement"],
  ["subprocessors", "Subprocessor information"],
  ["general", "General security questions"],
  ["other", "Other"],
] as const;

export function TrustRequestForm({ kind }: { kind: "security_review" | "vulnerability" }) {
  const [state, action, pending] = useActionState(submitTrustForm, initial);
  const error = state.ok ? undefined : state.errors;
  return (
    <form action={action} className={publicFormClass}>
      <FormGlow />
      <input type="hidden" name="kind" value={kind} />
      {state.message && !state.ok ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
      <Field label="Name" name="full_name" htmlFor="trust-name" required>
        <Input className={publicFieldClass} id="trust-name" name="full_name" required autoComplete="name" aria-invalid={error?.full_name ? true : undefined} />
        {error?.full_name ? <p className="text-xs text-destructive">{error.full_name}</p> : null}
      </Field>
      <Field label="Work email" name="email" htmlFor="trust-email" required>
        <Input className={publicFieldClass} id="trust-email" name="email" type="email" required autoComplete="email" aria-invalid={error?.email ? true : undefined} />
        {error?.email ? <p className="text-xs text-destructive">{error.email}</p> : null}
      </Field>
      <Field label="Company" name="business_name" htmlFor="trust-company" required>
        <Input className={publicFieldClass} id="trust-company" name="business_name" required aria-invalid={error?.business_name ? true : undefined} />
        {error?.business_name ? <p className="text-xs text-destructive">{error.business_name}</p> : null}
      </Field>
      {kind === "security_review" ? (
        <>
          <Field label="Role" name="role" htmlFor="trust-role" required>
            <Input className={publicFieldClass} id="trust-role" name="role" required aria-invalid={error?.role ? true : undefined} />
            {error?.role ? <p className="text-xs text-destructive">{error.role}</p> : null}
          </Field>
          <fieldset>
            <legend className="text-sm font-medium text-strong">What do you need?</legend>
            <div className="mt-2 grid gap-2">
              {NEEDS.map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="needs" value={value} className={cn(checkboxClass, publicCheckClass)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Deadline" name="deadline" htmlFor="trust-deadline" help="Optional.">
            <Input className={publicFieldClass} id="trust-deadline" name="deadline" type="date" />
          </Field>
          <p className="text-sm text-muted-foreground">If you have a questionnaire to send, tell us here and we will reply with a secure way to share it. This form does not take files.</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Include what you saw, where, and how to reproduce it. Do not include passwords or lead data.</p>
      )}
      <Field label={kind === "vulnerability" ? "What did you find?" : "Anything else"} name="details" htmlFor="trust-details" required={kind === "vulnerability"}>
        <textarea id="trust-details" name="details" maxLength={2000} className={cn(textareaClass, publicFieldClass)} required={kind === "vulnerability"} />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" value="yes" className={cn(checkboxClass, publicCheckClass)} />
        <span>We use these details only to respond to your request.</span>
      </label>
      {error?.consent ? <p className="text-xs text-destructive">{error.consent}</p> : null}
      <div className="absolute -left-[9999px] h-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="company_website_confirm">Company website confirm</label>
        <input id="company_website_confirm" name="company_website_confirm" tabIndex={-1} autoComplete="off" />
      </div>
      <SubmitButton pending={pending} size="lg" className={publicSubmitClass}>{kind === "vulnerability" ? "Send report" : "Request a review"}</SubmitButton>
    </form>
  );
}
