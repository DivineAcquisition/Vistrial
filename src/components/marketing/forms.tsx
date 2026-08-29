"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { SubmitButton } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitContact, submitQualification } from "@/lib/marketing/actions";
import { BOOK, CONTACT_PAGE } from "@/lib/marketing/copy";
import type { TrackingParamKey } from "@/lib/marketing/config";
import {
  GHL_USE_OPTIONS,
  MONTHLY_REVENUE_OPTIONS,
  OFFER_PRICE_OPTIONS,
  WHO_WORKS_LEADS_OPTIONS,
} from "@/lib/marketing/qualify";
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

export function QualifyForm({
  tracking,
}: {
  tracking: Partial<Record<TrackingParamKey, string>>;
}) {
  const started = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function markStart() {
    if (started.current) return;
    started.current = true;
    trackMarketingEvent({ type: "form_start", form: "qualify", path: "/book" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await submitQualification({
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      companyName: String(form.get("companyName") ?? ""),
      monthlyRevenue: String(form.get("monthlyRevenue") ?? ""),
      usesGhl: String(form.get("usesGhl") ?? ""),
      whoWorksLeads: String(form.get("whoWorksLeads") ?? ""),
      offerPrice: String(form.get("offerPrice") ?? ""),
      website: String(form.get("website") ?? ""),
      tracking,
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    trackMarketingEvent({
      type: "form_complete",
      form: "qualify",
      path: "/book",
      position: tracking.from === "nav" || tracking.from === "hero" || tracking.from === "audit" ? tracking.from : null,
    });
    window.location.assign(result.redirectTo);
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocus={markStart}
      noValidate
      data-marketing-form="qualify"
      className="relative grid gap-4"
    >
      {Object.entries(tracking).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Full name" htmlFor="fullName">
          <Input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            placeholder="Jordan Blake"
          />
        </FormRow>
        <FormRow label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
          />
        </FormRow>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Phone" htmlFor="phone">
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            placeholder="(555) 201-8890"
          />
        </FormRow>
        <FormRow label="Company name" htmlFor="companyName">
          <Input
            id="companyName"
            name="companyName"
            type="text"
            autoComplete="organization"
            required
            placeholder="Your company"
          />
        </FormRow>
      </div>

      <FormRow label="Roughly what does a typical month of revenue look like?" htmlFor="monthlyRevenue">
        <Select
          id="monthlyRevenue"
          name="monthlyRevenue"
          required
          defaultValue=""
          placeholder="Select one"
        >
          <option value="" disabled>
            Select one
          </option>
          {MONTHLY_REVENUE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </FormRow>

      <FormRow label="Do you already run GoHighLevel?" htmlFor="usesGhl">
        <Select id="usesGhl" name="usesGhl" required defaultValue="" placeholder="Select one">
          <option value="" disabled>
            Select one
          </option>
          {GHL_USE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </FormRow>

      <FormRow label="Who works inbound leads today?" htmlFor="whoWorksLeads">
        <Select
          id="whoWorksLeads"
          name="whoWorksLeads"
          required
          defaultValue=""
          placeholder="Select one"
        >
          <option value="" disabled>
            Select one
          </option>
          {WHO_WORKS_LEADS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </FormRow>

      <FormRow label="What is the offer priced at?" htmlFor="offerPrice">
        <Select id="offerPrice" name="offerPrice" required defaultValue="" placeholder="Select one">
          <option value="" disabled>
            Select one
          </option>
          {OFFER_PRICE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
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

      <SubmitButton pending={pending} variant="gradient" size="lg" loadingLabel={BOOK.pending} className="mt-1 w-full rounded-full">
        {BOOK.submit}
      </SubmitButton>
    </form>
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
      className="relative grid gap-4"
    >
      <FormRow label="Name" htmlFor="contact-name">
        <Input
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
          className="min-h-32"
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
      <SubmitButton pending={pending} variant="gradient" size="lg" loadingLabel={CONTACT_PAGE.pending} className="w-full rounded-full">
        {CONTACT_PAGE.submit}
      </SubmitButton>
    </form>
  );
}
