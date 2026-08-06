import { NextResponse } from "next/server";

import { runAttentionDigest } from "@/lib/attention/digest";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Morning attention digest. Authenticated with CRON_SECRET. Safe to invoke
 * every hour — it only sends at the configured UTC hour, and only when
 * something is outstanding.
 */
export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  const presented = request.headers.get("authorization");
  if (presented !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  try {
    const result = await runAttentionDigest(createServiceClient());
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Digest failed.",
      },
      { status: 500 }
    );
  }
}
