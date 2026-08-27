import type { Metadata } from "next";
import { cookies } from "next/headers";

import { BookingCalendar } from "@/components/marketing/booking-calendar";
import { MarketingShell } from "@/components/marketing/chrome";
import { Panel } from "@/components/ui/panel";
import { CONTACT_EMAIL } from "@/lib/constants";
import {
  auditBookingWidgetSrc,
  PREFILL_COOKIE,
  withWidgetPrefill,
} from "@/lib/marketing/config";
import { CALENDAR } from "@/lib/marketing/copy";
import { eyebrow } from "@/lib/ui";
import { marketingHeroTitle, marketingSubhead } from "@/lib/marketing/ui";

export const metadata: Metadata = {
  title: CALENDAR.title,
  description: CALENDAR.description,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function readPrefill(raw: string | undefined): {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
} | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      firstName: typeof parsed.firstName === "string" ? parsed.firstName : "",
      lastName: typeof parsed.lastName === "string" ? parsed.lastName : "",
      email: typeof parsed.email === "string" ? parsed.email : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
    };
  } catch {
    return null;
  }
}

export default async function CalendarPage() {
  const jar = await cookies();
  const prefill = readPrefill(jar.get(PREFILL_COOKIE)?.value);
  const widget = auditBookingWidgetSrc();
  let src = widget;
  if (widget && prefill) {
    try {
      src = withWidgetPrefill(widget, prefill);
    } catch {
      src = widget;
    }
  }

  return (
    <MarketingShell headerAction="none">
      <section className="px-5 pb-10 pt-14 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className={`${eyebrow} animate-rise`}>{CALENDAR.eyebrow}</p>
          <h1 className={`${marketingHeroTitle} animate-rise delay-1 mt-6 text-[2.1rem] sm:text-4xl md:text-[2.75rem]`}>
            {CALENDAR.title}
          </h1>
          <p className={`${marketingSubhead} animate-rise delay-2 mx-auto mt-5 max-w-xl`}>
            {CALENDAR.description}
          </p>
        </div>
      </section>
      <section className="px-5 pb-20 sm:px-6">
        <div className="mx-auto max-w-4xl">
          {src ? (
            <div className="animate-rise delay-3">
              <BookingCalendar src={src} title={CALENDAR.title} />
            </div>
          ) : (
            <Panel className="mx-auto max-w-2xl p-8 text-center">
              <p className="text-sm leading-relaxed text-silver">{CALENDAR.missing}</p>
              <p className="mt-4 text-sm text-white">
                <a
                  className="text-brand-300 underline-offset-4 hover:text-white hover:underline"
                  href={`mailto:${CONTACT_EMAIL}`}
                >
                  {CONTACT_EMAIL}
                </a>
              </p>
            </Panel>
          )}
        </div>
      </section>
    </MarketingShell>
  );
}
