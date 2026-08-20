import { after } from "next/server";
import { NextResponse } from "next/server";

import { ingestTranscriptWebhook } from "@/lib/transcripts/ingest";
import { processTranscriptWebhookQueue } from "@/lib/transcripts/process";
import { processExtractionQueue } from "@/lib/extraction/run";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ source: string; token: string }> }
) {
  const { source, token } = await context.params;
  const rawBody = await request.text();

  try {
    const result = await ingestTranscriptWebhook(getSupabaseAdmin(), {
      source,
      publicToken: token,
      rawBody,
      headers: request.headers,
    });

    if (result.httpStatus === 401) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    after(async () => {
      const db = getSupabaseAdmin();
      await processTranscriptWebhookQueue(db);
      await processExtractionQueue(db);
    });

    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch {
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
