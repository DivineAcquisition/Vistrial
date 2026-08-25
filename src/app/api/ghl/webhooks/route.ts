import { after } from "next/server";
import { NextResponse } from "next/server";

import { ingestGhlWebhook } from "@/lib/ghl/ingest";
import { processGhlWebhookQueue } from "@/lib/ghl/process";
import { signatureHeaders } from "@/lib/ghl/signature";
import { recordHttpSample } from "@/lib/ops/alerts";
import { rateLimitWebhook } from "@/lib/ops/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const db = getSupabaseAdmin();
  const limited = await rateLimitWebhook(db, request, "ghl");
  if (!limited.allowed) {
    await recordHttpSample(db, "/api/ghl/webhooks", true);
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await request.text();
  const { ghlSignature, legacySignature } = signatureHeaders(request.headers);

  try {
    const result = await ingestGhlWebhook(db, {
      rawBody,
      ghlSignature,
      legacySignature,
    });

    if (result.httpStatus === 401) {
      await recordHttpSample(db, "/api/ghl/webhooks", true);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    after(async () => {
      await processGhlWebhookQueue(getSupabaseAdmin());
    });

    await recordHttpSample(db, "/api/ghl/webhooks", false);
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch {
    await recordHttpSample(db, "/api/ghl/webhooks", true);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
