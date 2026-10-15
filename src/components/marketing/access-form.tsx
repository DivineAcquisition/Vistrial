"use client";

import { useActionState, useEffect } from "react";

import { submitCustomContact, submitPrivateAccess, type AccessFormState } from "@/app/(marketing)/request/actions";
import { FormGlow, publicCheckClass, publicFieldClass, publicFormClass, publicSubmitClass } from "@/components/marketing/public-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  BUSINESS_TYPES,
  CALLS_PER_WEEK,
  CRMS,
  CUSTOM_TEAM_SIZES,
  DEAL_VALUES,
  LEAD_SOURCES,
  LEADS_PER_MONTH,
  TEAM_SIZES,
} from "@/lib/access-requests/options";
import { trackMarketingEvent } from "@/components/marketing/track";
import { FORMS } from "@/lib/marketing/content";
import { checkboxClass, selectClass, textareaClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

const initial: AccessFormState = { ok: true, message: "", errors: {} };

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function Choice({
  name,
  label,
  options,
  error,
  required = false,
}: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  error?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} name={name} htmlFor={name} required={required}>
      <select id={name} name={name} required={required} aria-invalid={error ? true : undefined} className={cn(selectClass, publicFieldClass)} defaultValue="">
        <option value="">Choose</option>
        {options.map((option) => (
          <option key={option.value || "blank"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessage message={error} />
    </Field>
  );
}

export function AccessRequestForm({ kind }: { kind: "private_access" | "custom" }) {
  const action = kind === "custom" ? submitCustomContact : submitPrivateAccess;
  const [state, formAction, pending] = useActionState(action, initial);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    trackMarketingEvent({ type: "form_start", form: kind === "custom" ? "custom" : "access" });
    if (!siteKey || document.querySelector("script[data-turnstile]")) return;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.dataset.turnstile = "true";
    document.body.appendChild(script);
  }, [kind, siteKey]);

  const error = state.ok ? undefined : state.errors;

  return (
    <form
      action={formAction}
      className={publicFormClass}
      noValidate
      onSubmit={(event) => {
        const params = new URLSearchParams(window.location.search);
        const picked: Record<string, string> = {};
        for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id", "ref", "from"]) {
          const value = params.get(key);
          if (value) picked[key] = value.slice(0, 120);
        }
        const field = event.currentTarget.elements.namedItem("campaign");
        if (field instanceof HTMLInputElement) field.value = JSON.stringify(picked);
      }}
    >
      <FormGlow />
      {state.message && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
      <Field label="Full name" name="full_name" htmlFor="full_name" required>
        <Input className={publicFieldClass} id="full_name" name="full_name" type="text" autoComplete="name" required aria-invalid={error?.full_name ? true : undefined} maxLength={120} />
        <FieldMessage message={error?.full_name} />
      </Field>
      <Field label="Work email" name="email" htmlFor="email" required>
        <Input className={publicFieldClass} id="email" name="email" type="email" inputMode="email" autoComplete="email" required aria-invalid={error?.email ? true : undefined} maxLength={200} />
        <FieldMessage message={error?.email} />
      </Field>
      <Field label="Business name" name="business_name" htmlFor="business_name" required>
        <Input className={publicFieldClass} id="business_name" name="business_name" type="text" autoComplete="organization" required aria-invalid={error?.business_name ? true : undefined} maxLength={160} />
        <FieldMessage message={error?.business_name} />
      </Field>
      {kind === "private_access" ? (
        <>
          <Field label="Business website" name="website" htmlFor="website" help="Optional.">
            <Input className={publicFieldClass} id="website" name="website" type="text" inputMode="url" autoComplete="url" aria-invalid={error?.website ? true : undefined} maxLength={200} placeholder="example.com" />
            <FieldMessage message={error?.website} />
          </Field>
          <Choice name="business_type" label="Type of business" options={BUSINESS_TYPES} required error={error?.business_type} />
          <Field label="If other, what do you sell" name="business_type_other" htmlFor="business_type_other">
            <Input className={publicFieldClass} id="business_type_other" name="business_type_other" type="text" maxLength={120} aria-invalid={error?.business_type_other ? true : undefined} />
            <FieldMessage message={error?.business_type_other} />
          </Field>
          <Choice name="team_size" label="People who handle leads" options={TEAM_SIZES} required error={error?.team_size} />
          <fieldset>
            <legend className="text-sm font-medium text-card-foreground">Where your lead data lives today</legend>
            <div className="mt-2 grid gap-2">
              {LEAD_SOURCES.map((source) => (
                <label key={source.value} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="lead_sources" value={source.value} className={cn(checkboxClass, publicCheckClass)} />
                  {source.label}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="If other, where" name="lead_sources_other" htmlFor="lead_sources_other">
            <Input className={publicFieldClass} id="lead_sources_other" name="lead_sources_other" type="text" maxLength={120} />
          </Field>
          <Choice name="crm" label="Which CRM you use" options={CRMS} error={error?.crm} />
          <Field label="If another CRM, which one" name="crm_other" htmlFor="crm_other">
            <Input className={publicFieldClass} id="crm_other" name="crm_other" type="text" maxLength={120} aria-invalid={error?.crm_other ? true : undefined} />
            <FieldMessage message={error?.crm_other} />
          </Field>
          <Choice name="deal_value" label="Average value of a closed deal" options={DEAL_VALUES} required error={error?.deal_value} />
          <Choice name="calls_per_week" label="Sales calls or consultations each week" options={CALLS_PER_WEEK} required error={error?.calls_per_week} />
          <Choice name="leads_per_month" label="New leads each month" options={LEADS_PER_MONTH} required error={error?.leads_per_month} />
          <Field label="Main problem you want help with" name="problem" htmlFor="problem" help={FORMS.problemHelp}>
            <textarea id="problem" name="problem" maxLength={1000} className={cn(textareaClass, publicFieldClass)} aria-invalid={error?.problem ? true : undefined} />
            <FieldMessage message={error?.problem} />
          </Field>
          <Field label="How did you hear about Vistrial" name="heard_about" htmlFor="heard_about" help="Optional.">
            <Input className={publicFieldClass} id="heard_about" name="heard_about" type="text" maxLength={160} />
          </Field>
        </>
      ) : (
        <>
          <Field label="What you need" name="need" htmlFor="need" required>
            <textarea id="need" name="need" required maxLength={1000} className={cn(textareaClass, publicFieldClass)} aria-invalid={error?.need ? true : undefined} />
            <FieldMessage message={error?.need} />
          </Field>
          <Choice name="team_size" label="Approximate team size" options={CUSTOM_TEAM_SIZES} />
        </>
      )}
      <Field label="Phone" name="phone" htmlFor="phone" help={FORMS.phoneHelp}>
        <Input className={publicFieldClass} id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} aria-invalid={error?.phone ? true : undefined} />
        <FieldMessage message={error?.phone} />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="consent" value="yes" className={cn(checkboxClass, publicCheckClass)} aria-invalid={error?.consent ? true : undefined} />
        <span>
          {FORMS.consent}{" "}
          <a href={FORMS.privacyHref} className="text-brand-300 underline">
            Privacy Policy
          </a>{" "}
          and the{" "}
          <a href="/terms" className="text-brand-300 underline">
            Terms
          </a>
          .
        </span>
      </label>
      {error?.consent ? (
        <p role="alert" className="text-xs text-destructive">
          {error.consent}
        </p>
      ) : null}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="company_website_confirm">{FORMS.honeypotLabel}</label>
        <input id="company_website_confirm" name="company_website_confirm" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="campaign" defaultValue="{}" />
      <input type="hidden" name="page_path" value={kind === "custom" ? "/contact" : "/request"} />
      {siteKey ? (
        <div className="cf-turnstile" data-sitekey={siteKey} />
      ) : null}
      <SubmitButton pending={pending} loadingLabel={FORMS.pending} size="lg" className={publicSubmitClass}>
        {kind === "custom" ? FORMS.submitCustom : FORMS.submitAccess}
      </SubmitButton>
    </form>
  );
}
