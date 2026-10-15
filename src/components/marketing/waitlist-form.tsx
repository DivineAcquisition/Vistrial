"use client";

import { useRef, useState, type FormEvent } from "react";

import { FormGlow, publicFieldClass, publicFormClass, publicSubmitClass } from "@/components/marketing/public-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trackMarketingEvent } from "@/components/marketing/track";
import { submitWaitlist } from "@/lib/marketing/actions";
import type { CtaPosition } from "@/lib/marketing/config";
import { WAITLIST } from "@/lib/marketing/copy";
import { errorClass, successClass } from "@/lib/ui";
import { cn } from "@/lib/utils";

export function WaitlistForm({
  position,
  className,
}: {
  position: CtaPosition;
  className?: string;
}) {
  const started = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function markStart() {
    if (started.current) return;
    started.current = true;
    trackMarketingEvent({ type: "form_start", form: "waitlist", path: "/" });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(event.currentTarget);
    const result = await submitWaitlist({
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      website: String(form.get("website") ?? ""),
      tracking: { from: position },
    });
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    trackMarketingEvent({
      type: "form_complete",
      form: "waitlist",
      path: "/",
      position,
    });
    setSent(true);
    setPending(false);
  }

  if (sent) {
    return <p className={cn(successClass, "mt-0 text-sm")}>{WAITLIST.sent}</p>;
  }

  return (
    <form
      onSubmit={onSubmit}
      onFocus={markStart}
      noValidate
      data-marketing-form="waitlist"
      className={cn(publicFormClass, className)}
    >
      <FormGlow />
      <label htmlFor={`waitlist-name-${position}`} className="sr-only">
        {WAITLIST.nameLabel}
      </label>
      <Input
        id={`waitlist-name-${position}`}
        name="name"
        type="text"
        autoComplete="name"
        required
        className={publicFieldClass}
        size="lg"
        placeholder="Jordan Blake"
      />
      <label htmlFor={`waitlist-email-${position}`} className="sr-only">
        {WAITLIST.emailLabel}
      </label>
      <Input
        id={`waitlist-email-${position}`}
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@company.com"
        className={publicFieldClass}
        size="lg"
      />
      <Button type="submit" variant="gradient" size="lg" className={publicSubmitClass} loading={pending} loadingLabel={WAITLIST.pending}>
        {WAITLIST.submit}
      </Button>
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
    </form>
  );
}
