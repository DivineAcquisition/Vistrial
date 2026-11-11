"use client";

import { useActionState, useEffect } from "react";

import { submitCustomContact, submitPrivateAccess, type AccessFormState } from "@/app/(marketing)/request/actions";
import {
  FieldPair,
  FormGlow,
  FormSection,
  SelectShell,
  publicCheckClass,
  publicChipClass,
  publicFieldClass,
  publicFormClass,
  publicSubmitClass,
} from "@/components/marketing/public-form";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  BUSINESS_TYPES,
  AD_SPEND,
  CHANNELS,
  CLIENT_COUNTS,
  CUSTOM_TEAM_SIZES,
  FIGURES,
  FIRST_WANTS,
  OFFER_PRICES,
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
      <SelectShell>
        <select id={name} name={name} required={required} aria-invalid={error ? true : undefined} className={cn(selectClass, publicFieldClass, "appearance-none pr-10")} defaultValue="">
          <option value="">Choose</option>
          {options.map((option) => (
            <option key={option.value || "blank"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </SelectShell>
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
      {(() => {
        const name = (
          <Field label="Full name" name="full_name" htmlFor="full_name" required>
            <Input className={publicFieldClass} id="full_name" name="full_name" type="text" autoComplete="name" required aria-invalid={error?.full_name ? true : undefined} maxLength={120} />
            <FieldMessage message={error?.full_name} />
          </Field>
        );
        const email = (
          <Field label="Work email" name="email" htmlFor="email" required>
            <Input className={publicFieldClass} id="email" name="email" type="email" inputMode="email" autoComplete="email" required aria-invalid={error?.email ? true : undefined} maxLength={200} />
            <FieldMessage message={error?.email} />
          </Field>
        );
        const business = (
          <Field label="Business name" name="business_name" htmlFor="business_name" required>
            <Input className={publicFieldClass} id="business_name" name="business_name" type="text" autoComplete="organization" required aria-invalid={error?.business_name ? true : undefined} maxLength={160} />
            <FieldMessage message={error?.business_name} />
          </Field>
        );
        const phone = (
          <Field label="Phone" name="phone" htmlFor="phone" help={FORMS.phoneHelp}>
            <Input className={publicFieldClass} id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} aria-invalid={error?.phone ? true : undefined} />
            <FieldMessage message={error?.phone} />
          </Field>
        );

        if (kind === "custom") {
          return (
            <>
              <FormSection step={1} title={FORMS.sections.you}>
                <FieldPair>
                  {name}
                  {email}
                </FieldPair>
                {business}
              </FormSection>
              <FormSection step={2} title={FORMS.sections.need}>
                <Field label="What you need" name="need" htmlFor="need" required>
                  <textarea id="need" name="need" required maxLength={1000} className={cn(textareaClass, publicFieldClass)} aria-invalid={error?.need ? true : undefined} />
                  <FieldMessage message={error?.need} />
                </Field>
                <FieldPair>
                  <Choice name="team_size" label="Approximate team size" options={CUSTOM_TEAM_SIZES} />
                  {phone}
                </FieldPair>
              </FormSection>
            </>
          );
        }

        return (
          <>
            <FormSection step={1} title={FORMS.sections.you}>
              <FieldPair>
                {name}
                {email}
              </FieldPair>
              <FieldPair>
                {business}
                <Field label="Business website" name="website" htmlFor="website" help="Optional.">
                  <Input className={publicFieldClass} id="website" name="website" type="text" inputMode="url" autoComplete="url" aria-invalid={error?.website ? true : undefined} maxLength={200} placeholder="example.com" />
                  <FieldMessage message={error?.website} />
                </Field>
              </FieldPair>
            </FormSection>

            <FormSection step={2} title={FORMS.sections.business}>
              <FieldPair>
                <Choice name="business_type" label="Type of business" options={BUSINESS_TYPES} required error={error?.business_type} />
                <Field label="If other, what do you sell" name="business_type_other" htmlFor="business_type_other">
                  <Input className={publicFieldClass} id="business_type_other" name="business_type_other" type="text" maxLength={120} aria-invalid={error?.business_type_other ? true : undefined} />
                  <FieldMessage message={error?.business_type_other} />
                </Field>
              </FieldPair>
              <FieldPair>
                <Choice name="team_size" label="People on your team" options={TEAM_SIZES} required error={error?.team_size} />
                <Choice name="client_count" label="Who you would use Vistrial for" options={CLIENT_COUNTS} required error={error?.client_count} />
              </FieldPair>
            </FormSection>

            <FormSection step={3} title={FORMS.sections.selling}>
              <fieldset>
                <legend className="text-sm font-medium text-card-foreground">Where your customers come from today</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {CHANNELS.map((channel) => (
                    <label key={channel.value} className={publicChipClass}>
                      <input type="checkbox" name="channels" value={channel.value} className={cn(checkboxClass, publicCheckClass)} />
                      {channel.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label="If other, where" name="channels_other" htmlFor="channels_other">
                <Input className={publicFieldClass} id="channels_other" name="channels_other" type="text" maxLength={120} />
              </Field>
              <FieldPair>
                <Choice name="ad_spend" label="Ad spend each month, yours or your clients'" options={AD_SPEND} required error={error?.ad_spend} />
                <Choice name="offer_price" label="Price of your main offer" options={OFFER_PRICES} required error={error?.offer_price} />
              </FieldPair>
              <FieldPair>
                <Choice name="first_want" label="What you want first" options={FIRST_WANTS} required error={error?.first_want} />
                <Choice name="figures" label="Your own figures you could share" options={FIGURES} error={error?.figures} />
              </FieldPair>
            </FormSection>

            <FormSection step={4} title={FORMS.sections.more}>
              <Field label="Main problem you want help with" name="problem" htmlFor="problem" help={FORMS.problemHelp}>
                <textarea id="problem" name="problem" maxLength={1000} className={cn(textareaClass, publicFieldClass)} aria-invalid={error?.problem ? true : undefined} />
                <FieldMessage message={error?.problem} />
              </Field>
              <FieldPair>
                <Field label="How did you hear about Vistrial" name="heard_about" htmlFor="heard_about" help="Optional.">
                  <Input className={publicFieldClass} id="heard_about" name="heard_about" type="text" maxLength={160} />
                </Field>
                {phone}
              </FieldPair>
            </FormSection>
          </>
        );
      })()}
      <label className="flex items-start gap-3 rounded-lg border border-border bg-background p-3 text-sm leading-relaxed">
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
