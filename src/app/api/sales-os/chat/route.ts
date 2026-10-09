import { createHmac } from "node:crypto";

import { convertToModelMessages, generateId, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";

import { getTokenEncryptionKey } from "@/lib/ghl/crypto";
import { consumeOperatorAgentLimits } from "@/lib/operator/rate-limit";
import { denyUnrecorded, mergeApprovalResponses } from "@/lib/sales-os/approvals";
import { EXECUTION_TOOLS, type ExecutionType } from "@/lib/sales-os/catalog";
import { renderContextForPrompt, resolveContext } from "@/lib/sales-os/context";
import { applyApprovalDecisions, loadDestinations, loadGateMode, loadRoutes } from "@/lib/sales-os/executions/run";
import { SalesOsUnavailable, salesOsModel } from "@/lib/sales-os/model";
import {
  finishToolCall,
  loadConversationMessages,
  pinContextPackage,
  requireOwnConversation,
  saveConversationMessages,
} from "@/lib/sales-os/persist";
import { destinationsBlock, permissionsBlock, salesOsInstructions } from "@/lib/sales-os/prompt";
import { checkAgentConfig } from "@/lib/config/agent-gate";
import { beginCompassTurn, compassContextRead, failCompassTurn, finishCompassTurn } from "@/lib/live/compass";
import { agentMayRun } from "@/lib/live/record";
import { salesOsActorOrNull } from "@/lib/sales-os/session";
import { buildSalesOsTools } from "@/lib/sales-os/tools";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_USER_CHARS = 8000;
const MAX_STEPS = 8;
const CACHE = { anthropic: { cacheControl: { type: "ephemeral" as const } } };

function approvalSecret(): Uint8Array | undefined {
  try {
    return createHmac("sha256", getTokenEncryptionKey()).update("sales-os-tool-approval").digest();
  } catch (cause) {
    console.error("[sales-os] tool approvals are unsigned", cause instanceof Error ? cause.message : cause);
    return undefined;
  }
}

function userText(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("\n");
}

type Body = { id?: unknown; message?: unknown; trigger?: unknown };

export async function POST(request: Request) {
  const actor = await salesOsActorOrNull();
  if (!actor) return NextResponse.json({ error: "Sign in again to keep talking." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Body | null;
  const incoming = body?.message as UIMessage | undefined;
  if (!body || typeof body.id !== "string" || !incoming || typeof incoming.id !== "string" || !Array.isArray(incoming.parts)) {
    return NextResponse.json({ error: "That message didn't arrive in one piece." }, { status: 400 });
  }
  if (body.trigger !== undefined && body.trigger !== "submit-message") {
    return NextResponse.json({ error: "Conversations here are kept as they happened, so answers can't be regenerated." }, { status: 400 });
  }

  const conversation = await requireOwnConversation(actor, body.id);
  if (!conversation) return NextResponse.json({ error: "That conversation isn't yours to continue." }, { status: 403 });
  if (conversation.status === "archived") {
    return NextResponse.json({ error: "This conversation is archived. Start a new one." }, { status: 409 });
  }

  const { data: org } = await actor.db.from("organizations").select("agents_halted").eq("id", actor.orgId).maybeSingle();
  if (org?.agents_halted) {
    return NextResponse.json({ error: "Vistrial is paused for this workspace right now." }, { status: 403 });
  }

  const compassAllowed = await agentMayRun(actor.orgId, "compass").catch(() => ({ ok: true as const }));
  if (!compassAllowed.ok && compassAllowed.reason === "paused") {
    return NextResponse.json({ error: "Compass is paused for this workspace. An owner can resume it from Agents." }, { status: 403 });
  }

  const gate = await checkAgentConfig(actor.db, actor.orgId, "sales_os");
  if (!gate.ok) {
    return NextResponse.json(
      { error: "Vistrial can't answer for this workspace until its setup is finished. The Vistrial team has been told." },
      { status: 503 }
    );
  }

  let model;
  try {
    model = salesOsModel("conversation");
  } catch (cause) {
    console.error("[sales-os] model unavailable", cause instanceof Error ? cause.message : cause);
    const message = cause instanceof SalesOsUnavailable ? cause.message : "Vistrial can't think right now.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  const stored = await loadConversationMessages(actor, conversation.id);
  let messages: UIMessage[];

  if (incoming.role === "user") {
    const text = userText(incoming);
    if (!text.trim()) return NextResponse.json({ error: "Write something first." }, { status: 400 });
    if (text.length > MAX_USER_CHARS) {
      return NextResponse.json({ error: `Keep a message under ${MAX_USER_CHARS} characters.` }, { status: 400 });
    }
    if (stored.some((message) => message.id === incoming.id)) {
      return NextResponse.json({ error: "That message was already sent." }, { status: 409 });
    }
    const limited = await consumeOperatorAgentLimits(actor.orgId);
    if (!limited.allowed) {
      return NextResponse.json({ error: "You've reached this hour's limit for questions. Try again shortly." }, { status: 429 });
    }
    const parts = incoming.parts.filter((part) => part.type === "text");
    messages = [...stored, { id: incoming.id, role: "user", parts }];
  } else if (incoming.role === "assistant") {
    const merged = mergeApprovalResponses(stored, incoming);
    if (!merged) return NextResponse.json({ error: "There was nothing waiting for a decision." }, { status: 409 });
    const recorded = await applyApprovalDecisions({ ...actor, conversationId: conversation.id }, merged.decisions);
    for (const decision of merged.decisions) {
      const outcome = recorded.find((r) => r.toolCallId === decision.toolCallId);
      if (!decision.approved && outcome?.recorded) {
        const name = (stored.at(-1)?.parts as Array<{ type: string; toolCallId?: string }>).find(
          (part) => part.toolCallId === decision.toolCallId
        )?.type.replace(/^tool-/, "");
        if (name) {
          await finishToolCall(actor, conversation.id, {
            toolCallId: decision.toolCallId,
            toolName: name,
            state: "rejected",
            output: { reason: decision.reason },
          });
        }
      }
    }
    messages = denyUnrecorded(
      merged.messages,
      recorded.filter((r) => !r.recorded).map((r) => ({ toolCallId: r.toolCallId, error: r.error }))
    );
  } else {
    return NextResponse.json({ error: "That message didn't arrive in one piece." }, { status: 400 });
  }

  await saveConversationMessages(actor, conversation.id, messages);

  const turn = await beginCompassTurn({
    orgId: actor.orgId,
    memberId: actor.memberId,
    conversationId: conversation.id,
    messages,
    resumingApproval: incoming.role === "assistant",
  });

  const context = await resolveContext(actor, { conversationId: conversation.id });
  await compassContextRead(turn);
  if (conversation.context_package_id !== context.id) await pinContextPackage(actor, conversation.id, context.id);

  const [destinations, routes, gateEntries] = await Promise.all([
    loadDestinations(actor.db, actor.orgId),
    loadRoutes(actor.db, actor.orgId),
    Promise.all(EXECUTION_TOOLS.map(async (type) => [type, await loadGateMode(actor.db, actor.orgId, type)] as const)),
  ]);
  const gates = Object.fromEntries(gateEntries) as Record<ExecutionType, (typeof gateEntries)[number][1]>;

  const tools = buildSalesOsTools(actor, conversation.id);
  const secret = approvalSecret();
  const result = streamText({
    model: model.model,
    system: [
      { role: "system", content: salesOsInstructions(gate.businessDescription ?? "a business that sells through conversations with its leads") },
      {
        role: "system",
        content: [permissionsBlock(actor), destinationsBlock({ destinations, routes, gates }), renderContextForPrompt(context.pkg)].join("\n\n"),
        providerOptions: CACHE,
      },
    ],
    messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
    tools,
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 4000,
    ...(secret ? { experimental_toolApprovalSecret: secret } : {}),
    abortSignal: request.signal,
  });
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    generateMessageId: generateId,
    sendReasoning: false,
    onError: (error) => {
      void failCompassTurn(turn, error instanceof Error ? error.message : "stream error");
      return error instanceof Error && error.message.length < 300 ? error.message : "Something went wrong. Nothing outside Vistrial was changed.";
    },
    onFinish: async ({ messages: finished }) => {
      const usage = await Promise.resolve(result.totalUsage).catch(() => null);
      await saveConversationMessages(actor, conversation.id, finished, {
        model: model.modelId,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        cacheReadTokens: usage?.cachedInputTokens ?? 0,
      });
      await finishCompassTurn(turn, finished);
    },
  });
}
