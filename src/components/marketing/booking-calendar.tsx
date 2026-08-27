"use client";

import Script from "next/script";

import { Card } from "@/components/ui/card";
import { auditBookingEmbedScript } from "@/lib/marketing/config";

export function BookingCalendar({
  src,
  title,
}: {
  src: string;
  title: string;
}) {
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
