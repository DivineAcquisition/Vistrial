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
  const rawBody = await request.text();
  const { ghlSignature, legacySignature } = signatureHeaders(request.headers);

  try {
    // A signed payload is never rate limited. Turning away a real event with a
    // 429 stores nothing, and once GHL exhausts its retries that lead is gone
    // with no trace anywhere in the product. Only forged traffic is throttled.
    const result = await ingestGhlWebhook(db, {
      rawBody,
      ghlSignature,
      legacySignature,
      allowRejectionRecord: async () => (await rateLimitWebhook(db, request, "ghl")).allowed,
    });

    if (result.httpStatus === 401) {
      await recordHttpSample(db, "/api/leadconnector/webhooks", true);
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    after(async () => {
      await processGhlWebhookQueue(getSupabaseAdmin());
    });

    await recordHttpSample(db, "/api/leadconnector/webhooks", false);
    return NextResponse.json({ ok: true, duplicate: result.duplicate });
  } catch {
    await recordHttpSample(db, "/api/leadconnector/webhooks", true);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
