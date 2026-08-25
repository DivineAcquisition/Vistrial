import { after } from "next/server";
import { NextResponse } from "next/server";

import { ingestTranscriptWebhook } from "@/lib/transcripts/ingest";
import { processTranscriptWebhookQueue } from "@/lib/transcripts/process";
import { processExtractionQueue } from "@/lib/extraction/run";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ source: string; token: string }> }
) {
  const db = getSupabaseAdmin();
  const limited = await rateLimitWebhook(db, request, "transcript");
  if (!limited.allowed) {
    await recordHttpSample(db, "/api/transcripts/webhooks", true);
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { source, token } = await context.params;
  const rawBody = await request.text();

  try {
    const result = await ingestTranscriptWebhook(db, {
      source,
      publicToken: token,
      rawBody,
      headers: request.headers,
    });

    if (result.httpStatus === 401) {
      await recordHttpSample(db, "/api/transcripts/webhooks", true);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    after(async () => {
      const admin = getSupabaseAdmin();
      await processTranscriptWebhookQueue(admin);
      await processExtractionQueue(admin);
    });

    await recordHttpSample(db, "/api/transcripts/webhooks", false);
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch {
    await recordHttpSample(db, "/api/transcripts/webhooks", true);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
