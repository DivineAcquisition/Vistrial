import { NextResponse } from "next/server";

import { parseMarketingEvent } from "@/lib/marketing/analytics";
import { marketingEventsWebhookUrl } from "@/lib/marketing/config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = parseMarketingEvent(raw);
  if (!event) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const webhook = marketingEventsWebhookUrl();
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch {
      /* recording must not fail the page */
    }
  }

  return NextResponse.json({ ok: true, type: event.type });
}
