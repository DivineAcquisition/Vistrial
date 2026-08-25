import { NextResponse } from "next/server";

import { writeQueueOutcome } from "@/lib/queue/log-outcome";
import type { LogOutcomeInput } from "@/lib/queue/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LogOutcomeInput | null;
  if (!body || typeof body.leadId !== "string") {
    return NextResponse.json({ error: "That lead is not in this workspace." }, { status: 400 });
  }
  const result = await writeQueueOutcome(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, retryable: false }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    duplicate: result.duplicate ?? false,
    discrepancy: result.discrepancy ?? null,
  });
}
