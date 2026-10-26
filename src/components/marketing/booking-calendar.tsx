"use client";

import { useState } from "react";
import Script from "next/script";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auditBookingEmbedScript } from "@/lib/marketing/config";

export function BookingCalendar({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <p className="text-sm leading-relaxed text-muted-foreground">
          The booking calendar is provided by GoHighLevel. It stays unloaded until you open it, and it may set its own cookies after that.
        </p>
        <Button type="button" className="mt-4" variant="outline" onClick={() => setOpen(true)}>
          Open the booking calendar
        </Button>
      </div>
    );
  }
  return (
    <Card className="overflow-hidden rounded-3xl p-1.5 sm:p-2">
      <div className="overflow-hidden rounded-[1.25rem] bg-ink-900">
        <iframe
          src={src}
          allow="payment"
          title={title}
          id="vistrial-audit-calendar"
          className="w-full border-0"
          style={{ minHeight: 920, width: "100%", overflow: "hidden" }}
        />
      </div>
      <Script src={auditBookingEmbedScript()} strategy="afterInteractive" />
    </Card>
  );
}
