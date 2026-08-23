"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { SubmitButton } from "@/components/ui/button";
import { submitContact, submitQualification } from "@/lib/marketing/actions";
import { BOOK, CONTACT_PAGE } from "@/lib/marketing/copy";
import type { TrackingParamKey } from "@/lib/marketing/config";
import {
  GHL_USE_OPTIONS,
  MONTHLY_REVENUE_OPTIONS,
  OFFER_PRICE_OPTIONS,
  WHO_WORKS_LEADS_OPTIONS,
} from "@/lib/marketing/qualify";
import {
  marketingField,
  marketingFieldControl,
  marketingFieldSelect,
  marketingFormLabel,
} from "@/lib/marketing/ui";
import { errorClass } from "@/lib/ui";
import { trackMarketingEvent } from "@/components/marketing/track";

function Field({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className={marketingFormLabel}>
        {label}
      </label>
      <div className={`${marketingField} mt-2`}>{children}</div>
    </div>
  );
}

function SelectChevron() {
  return (
    <ChevronDown
      className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-brand-300/80"
      aria-hidden
    />
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
        <Field label="Full name" htmlFor="fullName">
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            required
            placeholder="Jordan Blake"
            className={marketingFieldControl}
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            className={marketingFieldControl}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone">
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
            placeholder="(555) 201-8890"
            className={marketingFieldControl}
          />
        </Field>
        <Field label="Company name" htmlFor="companyName">
          <input
            id="companyName"
            name="companyName"
            type="text"
            autoComplete="organization"
            required
            placeholder="Your company"
            className={marketingFieldControl}
          />
        </Field>
      </div>

      <Field label="Roughly what does a typical month of revenue look like?" htmlFor="monthlyRevenue">
        <select
          id="monthlyRevenue"
          name="monthlyRevenue"
          required
          defaultValue=""
          className={marketingFieldSelect}
        >
          <option value="" disabled>
            Select one
          </option>
          {MONTHLY_REVENUE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <SelectChevron />
      </Field>

      <Field label="Do you already run GoHighLevel?" htmlFor="usesGhl">
        <select id="usesGhl" name="usesGhl" required defaultValue="" className={marketingFieldSelect}>
          <option value="" disabled>
            Select one
          </option>
          {GHL_USE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <SelectChevron />
      </Field>

      <Field label="Who works inbound leads today?" htmlFor="whoWorksLeads">
        <select
          id="whoWorksLeads"
          name="whoWorksLeads"
          required
          defaultValue=""
          className={marketingFieldSelect}
        >
          <option value="" disabled>
            Select one
          </option>
          {WHO_WORKS_LEADS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <SelectChevron />
      </Field>

      <Field label="What is the offer priced at?" htmlFor="offerPrice">
        <select
          id="offerPrice"
          name="offerPrice"
          required
          defaultValue=""
          className={marketingFieldSelect}
        >
          <option value="" disabled>
            Select one
          </option>
          {OFFER_PRICE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <SelectChevron />
      </Field>

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

      <SubmitButton pending={pending} variant="gradient" size="lg" loadingLabel={BOOK.pending} className="mt-1 w-full">
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
    return <p className="text-sm leading-relaxed text-silver">{CONTACT_PAGE.sent}</p>;
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocus={markStart}
      noValidate
      data-marketing-form="contact"
      className="relative grid gap-4"
    >
      <Field label="Name" htmlFor="contact-name">
        <input
          id="contact-name"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          className={marketingFieldControl}
        />
      </Field>
      <Field label="Email" htmlFor="contact-email">
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className={marketingFieldControl}
        />
      </Field>
      <Field label="Message" htmlFor="contact-message">
        <textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          className={`${marketingFieldControl} min-h-32 resize-y py-3`}
        />
      </Field>
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
      <SubmitButton pending={pending} variant="gradient" size="lg" loadingLabel={CONTACT_PAGE.pending} className="w-full">
        {CONTACT_PAGE.submit}
      </SubmitButton>
    </form>
  );
}
