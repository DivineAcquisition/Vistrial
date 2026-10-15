import { createAnthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateId, generateText, stepCountIs, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";

import { checkAgentConfig } from "@/lib/config/agent-gate";
import { compassActorOrNull, unavailableMessage, type CompassActor } from "@/lib/compass/actor";
import { verifyNumbers } from "@/lib/compass/grounding";
import { buildCompassTools, newTrace, type StepLog } from "@/lib/compass/lookups";
import { costMicros, modelIdFor } from "@/lib/compass/models";
import { dropMessage, loadMessages, requireOwnConversation, saveMessages, setTitleIfMissing } from "@/lib/compass/persist";
import { COMPASS_RULES, contextBlock, ROUTER_PROMPT } from "@/lib/compass/prompt";
import { classifyQuestion, routeFromLabel } from "@/lib/compass/route";
import { titleFor } from "@/lib/compass/titles";
import { isCompassContext, type CompassAnswerMeta, type CompassContext, type CompassOutcome, type CompassSource } from "@/lib/compass/types";
import { consumeQuestion, limitMessage, loadHelpArticles, nearMessage, recordUsage } from "@/lib/compass/usage";
import { anthropicApiKey } from "@/lib/extraction/anthropic";
import { beginCompassTurn, compassStep, failCompassTurn, finishCompassTurn } from "@/lib/live/compass";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_STEPS = 6;
const CACHE = { anthropic: { cacheControl: { type: "ephemeral" as const } } };

type Body = { id?: unknown; message?: unknown; trigger?: unknown; context?: unknown };

function userText(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("\n").trim();
}

function json(error: string, status: number, code?: string) {
  return NextResponse.json({ error, code }, { status });
}

/** Context narrows a question; it never adds access. A lead the person may not ask about is dropped. */
async function validContext(actor: CompassActor, raw: unknown): Promise<CompassContext> {
  if (!isCompassContext(raw)) return { kind: "none" };
  if (raw.kind === "lead") {
    const { data } = await actor.db.rpc("compass_lead_allowed", { p_org_id: actor.orgId, p_lead_id: raw.leadId });
    return data === true ? { kind: "lead", leadId: raw.leadId } : { kind: "none" };
  }
  if (raw.kind === "list" || raw.kind === "results") {
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.params ?? {}).slice(0, 12)) {
      if (/^[a-z_]{1,20}$/i.test(key) && typeof value === "string" && value.length <= 80) params[key] = value;
    }
    return { kind: raw.kind, params };
  }
  return { kind: raw.kind === "home" ? "home" : "none" } as CompassContext;
}

function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function dedupeSources(sources: CompassSource[]): CompassSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = source.kind === "lead" ? `lead:${source.id}` : source.kind === "metric" ? `metric:${source.metric}:${source.range}` : `${source.kind}:${source.href}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Haiku decides lookup or reasoning when the local check cannot tell; on any trouble, reasoning. */
async function routeWithHaiku(apiKey: string, question: string): Promise<"fast" | "reasoning"> {
  try {
    const result = await generateText({
      model: createAnthropic({ apiKey })(modelIdFor("fast")),
      prompt: ROUTER_PROMPT + question.slice(0, 600),
      maxOutputTokens: 5,
      abortSignal: AbortSignal.timeout(1500),
      providerOptions: { anthropic: { effort: "low" } },
    });
    return routeFromLabel(result.text);
  } catch {
    return "reasoning";
  }
}

export async function POST(request: Request) {
  const started = Date.now();
  const actor = await compassActorOrNull();
  if (!actor) return json("Sign in again to keep asking.", 401);

  const body = (await request.json().catch(() => null)) as Body | null;
  const incoming = body?.message as UIMessage | undefined;
  if (!body || typeof body.id !== "string" || !incoming || typeof incoming.id !== "string" || !Array.isArray(incoming.parts) || incoming.role !== "user") {
    return json("That message didn't arrive in one piece.", 400);
  }
  if (body.trigger !== undefined && body.trigger !== "submit-message") {
    return json("Ask again to get a fresh answer.", 400);
  }

  const conversation = await requireOwnConversation(actor, body.id);
  if (!conversation) return json("That conversation isn't available.", 404);
  const origin = conversation.origin;

  if (!actor.available) {
    await recordUsage(actor, { conversationId: conversation.id, messageId: null, origin, route: "none", model: null, lookups: [], durationMs: Date.now() - started, firstOutputMs: null, outcome: "unavailable" });
    return json(unavailableMessage(actor.unavailableReason), 403, "unavailable");
  }

  const text = userText(incoming);
  if (!text) return json("Write a question first.", 400);

  const loaded = await loadMessages(actor, conversation.id);
  if (loaded.some((message) => message.id === incoming.id)) {
    return json("That question was already sent.", 409, "duplicate");
  }
  // A question whose answer never arrived is replaced by this one (a retry), not repeated.
  const unanswered = loaded.at(-1)?.role === "user" ? loaded.at(-1)! : null;
  const stored = unanswered ? loaded.slice(0, -1) : loaded;

  const plan = await actor.db.rpc("entitlement_check", { p_org_id: actor.orgId, p_key: "compass_questions" });
  const planRow = plan.data as { allowed?: boolean; reason?: string } | null;
  if (!plan.error && planRow && planRow.allowed === false) {
    await recordUsage(actor, { conversationId: conversation.id, messageId: null, origin, route: "none", model: null, lookups: [], durationMs: Date.now() - started, firstOutputMs: null, outcome: "limited" });
    return json(planRow.reason || "Compass is paused until billing is sorted. Ask your Owner.", 429, "plan_limit");
  }

  const limit = await consumeQuestion(actor);
  if (!limit.allowed) {
    await recordUsage(actor, { conversationId: conversation.id, messageId: null, origin, route: "none", model: null, lookups: [], durationMs: Date.now() - started, firstOutputMs: null, outcome: "limited" });
    return json(limitMessage(limit.scope), 429, "limit");
  }
  const counted = await actor.db.rpc("billing_consume", {
    p_org_id: actor.orgId,
    p_meter: "compass_questions",
    p_quantity: 1,
    p_key: `compass:${incoming.id}`,
    p_kind: "live",
  });
  if (!counted.error && counted.data === false) {
    await recordUsage(actor, { conversationId: conversation.id, messageId: null, origin, route: "none", model: null, lookups: [], durationMs: Date.now() - started, firstOutputMs: null, outcome: "limited" });
    return json(planRow?.reason || "This workspace has reached its Compass questions for this period. Ask your Owner.", 429, "plan_limit");
  }
  if (text.length > limit.limits.max_question_chars) {
    return json(`Keep a question under ${limit.limits.max_question_chars} characters.`, 400, "too_long");
  }
  if (stored.length >= limit.limits.max_turns * 2) {
    return json("This conversation is long enough that answers would get less reliable. Start a fresh one; your question will carry over.", 409, "too_many_turns");
  }

  const gate = await checkAgentConfig(actor.db, actor.orgId, "sales_os");
  if (!gate.ok) {
    return json("Compass can't answer for this workspace until its setup is finished. The Vistrial team has been told.", 503, "setup");
  }
  const apiKey = anthropicApiKey();
  if (!apiKey) {
    await recordUsage(actor, { conversationId: conversation.id, messageId: null, origin, route: "none", model: null, lookups: [], durationMs: Date.now() - started, firstOutputMs: null, outcome: "error", errorCode: "no_model_key" });
    return json("Compass can't answer right now. The Vistrial team has been told. Try again shortly.", 503, "provider");
  }

  const context = await validContext(actor, body.context ?? conversation.context);
  const userMessage: UIMessage = { id: incoming.id, role: "user", parts: incoming.parts.filter((part) => part.type === "text") };
  const messages: UIMessage[] = [...stored, userMessage];
  if (unanswered) await dropMessage(actor, conversation.id, unanswered.id);
  await saveMessages(actor, conversation.id, messages);

  const decision = classifyQuestion(text);
  const near = limit.near;
  let firstOutputMs: number | null = null;
  // Recorded once the answer has its message id, so a rating can be matched to it.
  let pendingUsage: Parameters<typeof recordUsage>[1] | null = null;

  const stream = createUIMessageStream<UIMessage>({
    originalMessages: messages,
    generateId,
    onError: () => "Compass couldn't finish this answer. Nothing was changed. Try again.",
    onFinish: async ({ messages: finished, responseMessage, isAborted }) => {
      await saveMessages(actor, conversation.id, finished).catch((cause) => console.error("[compass] save failed", cause instanceof Error ? cause.message : cause));
      if (pendingUsage) {
        await recordUsage(actor, {
          ...pendingUsage,
          messageId: responseMessage?.id ?? null,
          outcome: isAborted && pendingUsage.outcome === "answered" ? "stopped" : pendingUsage.outcome,
        });
      }
    },
    execute: async ({ writer }) => {
      // Out of scope, or too broad to answer well: a plain reply, no model, no lookups.
      if (decision.route === "refused") {
        const id = generateId();
        writer.write({ type: "start" });
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: decision.reply ?? "That's outside what I can help with." });
        writer.write({ type: "text-end", id });
        const meta: CompassAnswerMeta = { sources: [], outcome: "out_of_scope", route: "refused", near: nearMessage(near) };
        writer.write({ type: "message-metadata", messageMetadata: meta });
        writer.write({ type: "finish" });
        firstOutputMs = Date.now() - started;
        pendingUsage = { conversationId: conversation.id, messageId: null, origin, route: "refused", model: null, lookups: [], durationMs: Date.now() - started, firstOutputMs, outcome: "out_of_scope" };
        await setTitleIfMissing(actor, conversation.id, titleFor([], todayIn(actor.timeZone)));
        return;
      }

      const turn = await beginCompassTurn({ orgId: actor.orgId, memberId: actor.memberId, conversationId: conversation.id, userMessageId: incoming.id });
      const route =
        decision.kind === "unclear" ? await routeWithHaiku(apiKey, text) : decision.route === "fast" ? "fast" : "reasoning";
      const modelId = modelIdFor(route);
      const trace = newTrace();
      const step: StepLog = (label) => compassStep(turn, label);
      const tools = buildCompassTools({ actor, trace, step, helpArticles: () => loadHelpArticles(actor) });

      try {
        const result = streamText({
          model: createAnthropic({ apiKey })(modelId),
          system: [
            { role: "system", content: COMPASS_RULES, providerOptions: CACHE },
            {
              role: "system",
              content: contextBlock({
                access: actor.access,
                personName: actor.personName,
                businessDescription: gate.businessDescription ?? "a business that sells through conversations with its leads",
                today: todayIn(actor.timeZone),
                timeZone: actor.timeZone,
                context,
                canSeeTranscripts: actor.canSeeTranscripts,
                canSeeMoney: actor.canSeeMoney,
              }),
            },
          ],
          messages: await convertToModelMessages(messages, { tools, ignoreIncompleteToolCalls: true }),
          tools,
          stopWhen: stepCountIs(MAX_STEPS),
          maxOutputTokens: route === "fast" ? 1200 : 2000,
          providerOptions: { anthropic: { effort: route === "fast" ? "low" : "medium" } },
          abortSignal: request.signal,
        });

        for await (const chunk of result.toUIMessageStream({ sendFinish: false, sendReasoning: false })) {
          if (firstOutputMs === null && (chunk.type === "text-delta" || chunk.type === "tool-input-start")) firstOutputMs = Date.now() - started;
          writer.write(chunk);
        }

        const [answer, usage] = await Promise.all([result.text, result.totalUsage]);
        const { unverified } = verifyNumbers(answer, trace.outputs, text);
        const outcome: CompassOutcome = request.signal.aborted
          ? "stopped"
          : unverified.length
            ? "unverified"
            : trace.gaps.length && trace.gaps.length === trace.names.length
              ? "no_data"
              : "answered";
        const meta: CompassAnswerMeta = {
          sources: dedupeSources(trace.sources).slice(0, 30),
          outcome,
          unverified: unverified.length ? unverified : undefined,
          route,
          near: nearMessage(near),
        };
        writer.write({ type: "message-metadata", messageMetadata: meta });
        writer.write({ type: "finish" });

        const tokens = { inputTokens: usage?.inputTokens ?? 0, outputTokens: usage?.outputTokens ?? 0, cacheReadTokens: usage?.cachedInputTokens ?? 0 };
        pendingUsage = {
          conversationId: conversation.id,
          messageId: null,
          origin,
          route: trace.names.length === 1 && trace.names[0] === "product_help" ? "help" : route,
          model: modelId,
          ...tokens,
          costMicros: costMicros(modelId, tokens),
          lookups: trace.names,
          durationMs: Date.now() - started,
          firstOutputMs,
          outcome,
        };
        await Promise.all([
          finishCompassTurn(turn, { lookups: trace.names.length, outcome, suggestions: trace.suggestions.length }),
          setTitleIfMissing(actor, conversation.id, titleFor(trace.names, todayIn(actor.timeZone))),
        ]);
      } catch (cause) {
        const technical = cause instanceof Error ? cause.message : "stream error";
        await failCompassTurn(turn, technical);
        await recordUsage(actor, {
          conversationId: conversation.id,
          messageId: null,
          origin,
          route,
          model: modelId,
          lookups: trace.names,
          durationMs: Date.now() - started,
          firstOutputMs,
          outcome: request.signal.aborted ? "stopped" : "error",
          errorCode: technical.slice(0, 80),
        });
        throw cause;
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
}
