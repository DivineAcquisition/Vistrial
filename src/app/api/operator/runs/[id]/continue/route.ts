import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { appendOperatorDecision, appendOperatorFollowUp, runOperatorLoop, type OperatorLoopEvent } from "@/lib/operator/loop";
import { requireOwnedRun } from "@/lib/operator/persist";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function encode(event: OperatorLoopEvent | { type: "run"; id: string }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  await getAuthContext();
  const owned = await requireOwnedRun(id);
  if (!owned.ok) {
    return NextResponse.json({ error: owned.error }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    followUp?: unknown;
    decisionNote?: unknown;
  } | null;
  const followUp = typeof body?.followUp === "string" ? body.followUp.trim() : "";
  const decisionNote = typeof body?.decisionNote === "string" ? body.decisionNote.trim() : "";

  if (followUp) {
    if (owned.run.follow_up_used) {
      return NextResponse.json({ error: "This run already had its one follow-up. Start a new run." }, { status: 400 });
    }
    if (owned.run.status !== "completed") {
      return NextResponse.json({ error: "A follow-up is only for a finished run." }, { status: 400 });
    }
    await appendOperatorFollowUp(owned.run.id, owned.run.org_id, followUp);
  } else {
    const db = await createClient();
    const { count } = await db
      .from("operator_run_confirmations")
      .select("id", { count: "exact", head: true })
      .eq("run_id", owned.run.id)
      .eq("decision", "pending");
    if ((count ?? 0) > 0) {
      return NextResponse.json({ error: "Confirm or cancel the proposed writes first." }, { status: 409 });
    }
    if (owned.run.status !== "awaiting_confirmation") {
      return NextResponse.json({ error: "This run is not waiting to continue." }, { status: 400 });
    }
    await appendOperatorDecision(
      owned.run.id,
      owned.run.org_id,
      decisionNote ||
        "The operator decided the proposed writes. Use the confirmation results. Do not claim a cancelled write happened. Do not invent facts beyond the tool results."
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: OperatorLoopEvent | { type: "run"; id: string }) => {
        controller.enqueue(new TextEncoder().encode(encode(event)));
      };
      send({ type: "run", id: owned.run.id });
      try {
        await runOperatorLoop({
          runId: owned.run.id,
          orgId: owned.run.org_id,
          startedAtMs: Date.now(),
          signal: request.signal,
          emit: (event) => send(event),
        });
      } catch (error) {
        send({
          type: "error",
          message: error instanceof Error ? error.message : "The run failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
