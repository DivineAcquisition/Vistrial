import { after } from "next/server";
import { NextResponse } from "next/server";

import { ingestGhlWebhook } from "@/lib/ghl/ingest";
import { processGhlWebhookQueue } from "@/lib/ghl/process";
import { signatureHeaders } from "@/lib/ghl/signature";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const { ghlSignature, legacySignature } = signatureHeaders(request.headers);

  try {
    const result = await ingestGhlWebhook(getSupabaseAdmin(), {
      rawBody,
      ghlSignature,
      legacySignature,
    });

    if (result.httpStatus === 401) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    after(async () => {
      await processGhlWebhookQueue(getSupabaseAdmin());
    });

    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch {
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
