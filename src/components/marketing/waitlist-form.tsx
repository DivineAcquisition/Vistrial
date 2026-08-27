"use client";

import { useRef, useState, type FormEvent } from "react";

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
      className={cn("relative", className)}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={`waitlist-name-${position}`} className="sr-only">
          {WAITLIST.nameLabel}
        </label>
        <Input
          id={`waitlist-name-${position}`}
          name="name"
          type="text"
          autoComplete="name"
          required
          className="min-w-0 flex-1 sm:min-w-52"
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
          className="min-w-0 flex-1"
          size="lg"
        />
        <Button type="submit" variant="gradient" size="lg" loading={pending} loadingLabel={WAITLIST.pending}>
          {WAITLIST.submit}
        </Button>
      </div>
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
