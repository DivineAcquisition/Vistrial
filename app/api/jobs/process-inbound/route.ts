import { NextResponse } from "next/server";
import { z } from "zod";

import { processStoredEvent } from "@/lib/ingest/pipeline";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Deferred processing for events stored by the Supabase inbound Edge Function.
 * Same processStoredEvent path as admin replay — not a webhook surface, and it
 * never sets cookies or reads a session.
 */
const bodySchema = z.object({
  eventId: z.string().uuid(),
});

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();

  if (!expected) {
    return NextResponse.json(
      {
        ok: false,
        error: "CRON_SECRET is not configured, so the job endpoint is closed.",
      },
      { status: 503 }
    );
  }

  const presented = request.headers.get("x-cron-secret")?.trim();
  if (presented !== expected) {
    return NextResponse.json({ ok: false, error: "Unrecognised secret." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "eventId is required." }, { status: 400 });
  }

  const result = await processStoredEvent(createServiceClient(), parsed.data.eventId, {
    note: "Processed after inbound acknowledgement.",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
