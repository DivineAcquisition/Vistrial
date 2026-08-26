"use client";

import { useRef, useState, type FormEvent } from "react";

import { ShimmerButton } from "@/components/ui/shimmer-button";
import { trackMarketingEvent } from "@/components/marketing/track";
import { submitWaitlist } from "@/lib/marketing/actions";
import type { CtaPosition } from "@/lib/marketing/config";
import { WAITLIST } from "@/lib/marketing/copy";
import { marketingFieldCompact, marketingFieldCompactControl } from "@/lib/marketing/ui";
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
      <div className="rounded-xl border border-white/[0.1] bg-ink-950/60 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className={cn(marketingFieldCompact, "sm:w-36")}>
          <label htmlFor={`waitlist-name-${position}`} className="sr-only">
            {WAITLIST.nameLabel}
          </label>
          <input
            id={`waitlist-name-${position}`}
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder={WAITLIST.nameLabel}
            className={marketingFieldCompactControl}
          />
        </div>
        <div className={cn(marketingFieldCompact, "min-w-0 flex-1")}>
          <label htmlFor={`waitlist-email-${position}`} className="sr-only">
            {WAITLIST.emailLabel}
          </label>
          <input
            id={`waitlist-email-${position}`}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder={WAITLIST.emailLabel}
            className={marketingFieldCompactControl}
          />
        </div>
        <ShimmerButton
          type="submit"
          disabled={pending}
          background="rgb(154, 136, 252)"
          shimmerColor="#ffffff"
          borderRadius="8px"
          className="h-10 w-full px-5 py-0 text-sm font-medium text-ink-950 sm:w-auto disabled:opacity-45"
        >
          {pending ? `${WAITLIST.pending}…` : WAITLIST.submit}
        </ShimmerButton>
        </div>
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
