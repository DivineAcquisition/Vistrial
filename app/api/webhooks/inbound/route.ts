import { after, NextResponse } from "next/server";

import { receiveInboundEvent } from "@/lib/ingest/pipeline";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The single endpoint every provider posts to: GoHighLevel workflows, Facebook
 * lead forms, and the landing page. It acknowledges receipt and processes
 * afterwards, because a slow response makes providers retry and retries are how
 * duplicates get made.
 */
const SECRET_HEADERS = ["x-vistrial-secret", "x-webhook-secret", "x-ghl-secret"];

function readSecret(request: Request): string | null {
  for (const header of SECRET_HEADERS) {
    const value = request.headers.get(header);
    if (value && value.trim() !== "") return value.trim();
  }

  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const value = authorization.slice(7).trim();
    if (value !== "") return value;
  }

  return null;
}

export async function POST(request: Request) {
  const secret = readSecret(request);

  // Rejected before the body is even read, let alone parsed.
  if (secret === null) {
    return NextResponse.json({ ok: false, error: "Missing webhook secret." }, { status: 401 });
  }

  const rawBody = await request.text();

  const receipt = await receiveInboundEvent(
    { secret, rawBody },
    createServiceClient()
  );

  if (receipt.process) {
    after(receipt.process);
  }

  return NextResponse.json(receipt.body, { status: receipt.status });
}
