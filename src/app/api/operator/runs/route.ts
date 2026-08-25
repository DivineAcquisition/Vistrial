import { NextResponse } from "next/server";

import { getAuthContext } from "@/lib/auth/session";
import { insertOperatorRun, updateRunState } from "@/lib/operator/persist";
import { consumeOperatorAgentLimits } from "@/lib/operator/rate-limit";
import { runOperatorLoop, type OperatorLoopEvent } from "@/lib/operator/loop";
import type { AgentMessage } from "@/lib/operator/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function encode(event: OperatorLoopEvent | { type: "run"; id: string }): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const ctx = await getAuthContext();
  const body = (await request.json().catch(() => null)) as { request?: unknown } | null;
  const text = typeof body?.request === "string" ? body.request.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Write what you want done." }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Keep the request under 4000 characters." }, { status: 400 });
  }

  const limited = await consumeOperatorAgentLimits(ctx.org.id);
  if (!limited.allowed) {
    return NextResponse.json({ error: limited.error, code: "rate_limited" }, { status: 429 });
  }

  const created = await insertOperatorRun({ requestText: text });
  if ("error" in created) {
    return NextResponse.json({ error: created.error }, { status: 500 });
  }

  const messages: AgentMessage[] = [{ role: "user", content: text }];
  await updateRunState({ runId: created.id, orgId: created.orgId, messages, status: "running" });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: OperatorLoopEvent | { type: "run"; id: string }) => {
        controller.enqueue(new TextEncoder().encode(encode(event)));
      };
      send({ type: "run", id: created.id });
      try {
        await runOperatorLoop({
          runId: created.id,
          orgId: created.orgId,
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
