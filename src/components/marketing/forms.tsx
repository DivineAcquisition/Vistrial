"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { FormGlow, publicFieldClass, publicFormClass, publicSubmitClass } from "@/components/marketing/public-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitContact } from "@/lib/marketing/actions";
import { CONTACT_PAGE } from "@/lib/marketing/copy";
import { errorClass } from "@/lib/ui";
import { trackMarketingEvent } from "@/components/marketing/track";

function FormRow({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </Field>
  );
}

export function ContactForm() {
  const started = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function markStart() {
    if (started.current) return;
    started.current = true;
    trackMarketingEvent({ type: "form_start", form: "contact", path: "/contact" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await submitContact({
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      message: String(form.get("message") ?? ""),
      website: String(form.get("website") ?? ""),
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    trackMarketingEvent({ type: "form_complete", form: "contact", path: "/contact", position: null });
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return <p className="text-sm leading-relaxed text-muted-foreground">{CONTACT_PAGE.sent}</p>;
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocus={markStart}
      noValidate
      data-marketing-form="contact"
      className={publicFormClass}
    >
      <FormGlow />
      <FormRow label="Name" htmlFor="contact-name">
        <Input
          className={publicFieldClass}
          id="contact-name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          placeholder="Jordan Blake"
        />
      </FormRow>
      <FormRow label="Email" htmlFor="contact-email">
        <Input
          className={publicFieldClass}
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@company.com"
        />
      </FormRow>
      <FormRow label="Message" htmlFor="contact-message">
        <Textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          className={`${publicFieldClass} min-h-32`}
          placeholder="What should we know before we talk?"
        />
      </FormRow>
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {error ? (
        <p className={errorClass} role="alert">
          {error}
        </p>
      ) : null}
      <SubmitButton pending={pending} variant="gradient" size="lg" loadingLabel={CONTACT_PAGE.pending} className={publicSubmitClass}>
        {CONTACT_PAGE.submit}
      </SubmitButton>
    </form>
  );
}
