import "server-only";

import { AGENT_ASYNC_TIME_LIMIT_MS, AGENT_STEP_LIMIT, AGENT_TIME_LIMIT_MS } from "@/lib/agents/constants";
import { shouldEscalateAfterVerification } from "@/lib/agents/escalation";
import { resolveModel, type RouteTable } from "@/lib/agents/router";
import { resolveAgentPriority, yieldIfUserIsWorking } from "@/lib/agents/priority";
import { assertToolForAgent } from "@/lib/agents/assert";
import { shouldUseBatchApi } from "@/lib/agents/anthropic";
import type { AgentActor, AgentId, AgentMode, AgentRunState, TriggerKind, WorkKind } from "@/lib/agents/types";
import type { AgentContentBlock, AgentMessage } from "@/lib/operator/types";

export type RuntimeModelTurn = {
  content: AgentContentBlock[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  model: string;
  stopReason: string | null;
};

export type RuntimeToolResult = {
  ok: boolean;
  kind: string;
  summary: string;
  error?: string;
  model?: unknown;
  ui?: unknown;
  leadIds: string[];
  pendingWrite?: boolean;
  confirmation?: unknown;
  modelPayload?: string;
};

export type AgentRuntimeEvent =
  | { type: "text"; delta: string }
  | { type: "step"; step: { id: string; seq: number; toolName: string; label: string; state: string; resultSummary: string | null; errorText: string | null; ui: unknown; arguments: unknown } }
  | { type: "confirmation"; confirmation: unknown }
  | { type: "status"; status: AgentRunState; finalResponse?: string | null; stopReason?: string | null }
  | { type: "error"; message: string };

export type AgentRuntimeStore = {
  loadMessages(): Promise<AgentMessage[]>;
  saveMessages(messages: AgentMessage[]): Promise<void>;
  nextStepSeq(): Promise<number>;
  insertRunningStep(input: { seq: number; toolName: string; args: unknown; model: string; modelVersion: string }): Promise<string>;
  finishStep(input: {
    stepId: string;
    seq: number;
    state: string;
    summary: string;
    result: unknown;
    ui: unknown;
    errorKind: string | null;
    errorText: string | null;
    startedAt: number;
  }): Promise<void>;
  addTokens(input: { inputTokens: number; outputTokens: number; cacheReadTokens: number; model: string }): Promise<void>;
  recordModel(model: string, version: string): Promise<void>;
  updateRun(input: {
    status: AgentRunState;
    finalResponse: string | null;
    stopReason: string | null;
    finished: boolean;
    messages?: AgentMessage[];
  }): Promise<void>;
  recordEscalation(input: { stepIndex: number; workKind: WorkKind; fromTier: string; toTier: string }): Promise<void>;
  executeTool(input: { name: string; args: unknown; stepId: string }): Promise<RuntimeToolResult>;
  streamTurn(input: {
    messages: AgentMessage[];
    model: string;
    timeoutMs: number;
    signal?: AbortSignal;
    onText?: (delta: string) => void;
    useBatch: boolean;
  }): Promise<RuntimeModelTurn>;
  afterFinalText?(input: { text: string; messages: AgentMessage[] }): Promise<{ text: string; verificationPassed: boolean }>;
  toolLabel(name: string): string;
  emit?: (event: AgentRuntimeEvent) => void;
};

export type AgentRuntimeInput = {
  agentId: AgentId;
  mode: AgentMode;
  orgId: string;
  runId: string;
  trigger: { kind: TriggerKind; key: string };
  actor: AgentActor;
  workKind: WorkKind;
  routes?: RouteTable;
  startedAtMs: number;
  signal?: AbortSignal;
  lastUserActivityAt?: Date | null;
  store: AgentRuntimeStore;
};

function assistantText(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => "type" in block && block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function timeLimitMs(mode: AgentMode): number {
  return mode === "on_demand" ? AGENT_TIME_LIMIT_MS : AGENT_ASYNC_TIME_LIMIT_MS;
}

function stopCopy(kind: "step" | "time", text: string): string {
  const prefix =
    kind === "step"
      ? `Stopped after ${AGENT_STEP_LIMIT} tool calls.`
      : "Stopped because this run reached the time limit.";
  return text ? `${prefix} Completed so far:\n\n${text}` : `${prefix} Nothing further was done.`;
}

/**
 * The only execution loop. On-demand, triggered, and scheduled all enter here.
 * No agent gets its own path.
 */
export async function runAgentRuntime(input: AgentRuntimeInput): Promise<{
  status: AgentRunState;
  finalResponse: string | null;
  stopReason: string | null;
}> {
  const store = input.store;
  const messages = await store.loadMessages();
  let finalText = "";
  const limitMs = timeLimitMs(input.mode);
  const priority = resolveAgentPriority(input.mode);

  const finish = async (status: AgentRunState, response: string | null, stopReason: string | null) => {
    await store.saveMessages(messages);
    await store.updateRun({
      status,
      finalResponse: response,
      stopReason,
      finished: status !== "awaiting_confirmation" && status !== "running" && status !== "awaiting_batch",
      messages,
    });
    store.emit?.({ type: "status", status, finalResponse: response, stopReason });
    return { status, finalResponse: response, stopReason };
  };

  try {
    await yieldIfUserIsWorking({
      priority,
      lastUserActivityAt: input.lastUserActivityAt ?? null,
    });

    while (true) {
      const elapsed = Date.now() - input.startedAtMs;
      if (elapsed >= limitMs) {
        return finish("stopped_time_limit", stopCopy("time", finalText), "time_limit");
      }
      const seqNow = (await store.nextStepSeq()) - 1;
      if (seqNow >= AGENT_STEP_LIMIT) {
        return finish("stopped_step_limit", stopCopy("step", finalText), "step_limit");
      }

      const remainingMs = Math.max(5_000, limitMs - elapsed);
      const resolved = resolveModel({
        workKind: input.workKind,
        mode: input.mode,
        routes: input.routes,
      });
      const turn = await store.streamTurn({
        messages,
        model: resolved.modelId,
        timeoutMs: remainingMs,
        signal: input.signal,
        useBatch: resolved.useBatch && shouldUseBatchApi(input.mode),
        onText: (delta) => store.emit?.({ type: "text", delta }),
      });
      await store.addTokens({
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
        cacheReadTokens: turn.cacheReadTokens ?? 0,
        model: turn.model,
      });
      await store.recordModel(turn.model, resolved.version);

      messages.push({ role: "assistant", content: turn.content });
      const text = assistantText(turn.content);
      if (text) finalText = text;

      const toolUses = turn.content.filter(
        (block): block is Extract<AgentContentBlock, { type: "tool_use" }> => block.type === "tool_use",
      );

      if (toolUses.length === 0) {
        let display = text || "Done.";
        let verificationPassed = true;
        if (store.afterFinalText) {
          const checked = await store.afterFinalText({ text: display, messages });
          display = checked.text;
          verificationPassed = checked.verificationPassed;
        }
        if (
          shouldEscalateAfterVerification({
            declaredTier: resolved.tier,
            escalateOnFailure: Boolean(resolved.escalateToTier),
            verificationPassed,
            alreadyEscalated: false,
          })
        ) {
          const escalated = resolveModel({
            workKind: input.workKind,
            mode: input.mode,
            routes: input.routes,
            escalate: true,
          });
          await store.recordEscalation({
            stepIndex: seqNow + 1,
            workKind: input.workKind,
            fromTier: resolved.tier,
            toTier: escalated.tier,
          });
          messages.pop();
          const retry = await store.streamTurn({
            messages,
            model: escalated.modelId,
            timeoutMs: Math.max(5_000, limitMs - (Date.now() - input.startedAtMs)),
            signal: input.signal,
            useBatch: escalated.useBatch && shouldUseBatchApi(input.mode),
            onText: (delta) => store.emit?.({ type: "text", delta }),
          });
          await store.addTokens({
            inputTokens: retry.inputTokens,
            outputTokens: retry.outputTokens,
            cacheReadTokens: retry.cacheReadTokens ?? 0,
            model: retry.model,
          });
          await store.recordModel(retry.model, escalated.version);
          messages.push({ role: "assistant", content: retry.content });
          display = assistantText(retry.content) || display;
          if (store.afterFinalText) {
            const again = await store.afterFinalText({ text: display, messages });
            display = again.text;
          }
        }
        return finish("completed", display, turn.stopReason);
      }

      const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = [];
      let pendingWrite = false;

      for (const tool of toolUses) {
        const elapsedInner = Date.now() - input.startedAtMs;
        if (elapsedInner >= limitMs) {
          return finish("stopped_time_limit", stopCopy("time", finalText), "time_limit");
        }
        const seq = await store.nextStepSeq();
        if (seq > AGENT_STEP_LIMIT) {
          for (const leftover of toolUses.slice(toolUses.indexOf(tool))) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: leftover.id,
              content: JSON.stringify({
                ok: false,
                kind: "failed",
                error: `Stopped after ${AGENT_STEP_LIMIT} tool calls.`,
              }),
              is_error: true,
            });
          }
          messages.push({ role: "user", content: toolResults });
          return finish("stopped_step_limit", stopCopy("step", finalText), "step_limit");
        }

        const allowed = assertToolForAgent(input.agentId, tool.name);
        const startedAt = Date.now();
        const stepId = await store.insertRunningStep({
          seq,
          toolName: tool.name,
          args: tool.input,
          model: turn.model,
          modelVersion: resolved.version,
        });
        store.emit?.({
          type: "step",
          step: {
            id: stepId,
            seq,
            toolName: tool.name,
            label: store.toolLabel(tool.name),
            state: "running",
            resultSummary: null,
            errorText: null,
            ui: null,
            arguments: tool.input,
          },
        });

        const outcome = allowed.ok
          ? await store.executeTool({ name: tool.name, args: tool.input, stepId })
          : {
              ok: false,
              kind: "failed",
              error: allowed.reason,
              summary: allowed.reason,
              leadIds: [],
            };

        const state = !outcome.ok && outcome.kind === "permission" ? "permission" : outcome.ok ? "done" : "failed";
        await store.finishStep({
          stepId,
          seq,
          state,
          summary: outcome.summary,
          result: outcome.ok ? outcome.model : { error: outcome.error, kind: outcome.kind },
          ui: outcome.ui ?? null,
          errorKind: outcome.ok ? null : outcome.kind,
          errorText: outcome.ok ? null : outcome.error ?? outcome.summary,
          startedAt,
        });
        store.emit?.({
          type: "step",
          step: {
            id: stepId,
            seq,
            toolName: tool.name,
            label: store.toolLabel(tool.name),
            state,
            resultSummary: outcome.summary,
            errorText: outcome.ok ? null : outcome.error ?? outcome.summary,
            ui: outcome.ui ?? null,
            arguments: tool.input,
          },
        });
        if (outcome.ok && outcome.pendingWrite) {
          pendingWrite = true;
          if (outcome.confirmation) {
            store.emit?.({ type: "confirmation", confirmation: outcome.confirmation });
          }
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content:
            outcome.modelPayload ??
            JSON.stringify(outcome.ok ? outcome.model ?? { ok: true } : { ok: false, kind: outcome.kind, error: outcome.error }),
          is_error: !outcome.ok,
        });
      }

      messages.push({ role: "user", content: toolResults });
      await store.saveMessages(messages);

      if (pendingWrite) {
        return finish("awaiting_confirmation", null, "awaiting_confirmation");
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The language model failed.";
    store.emit?.({ type: "error", message });
    return finish("failed", message, "model_error");
  }
}
