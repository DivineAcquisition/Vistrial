import "server-only";

import { getAuthContext } from "@/lib/auth/session";
import { isOperatorToolName, isProposeToolName } from "@/lib/operator/catalog";
import { OPERATOR_STEP_LIMIT, OPERATOR_TIME_LIMIT_MS } from "@/lib/operator/constants";
import { streamOperatorMessage } from "@/lib/operator/anthropic";
import {
  addRunTokens,
  finishStep,
  insertRunningStep,
  loadOrgBatchCap,
  nextStepSeq,
  touchLeads,
  updateRunState,
} from "@/lib/operator/persist";
import { runProposeTool } from "@/lib/operator/propose";
import { toolLabel } from "@/lib/operator/labels";
import { modelToolResultPayload, runReadTool } from "@/lib/operator/tools";
import type {
  AgentMessage,
  AgentToolResult,
  OperatorConfirmationView,
  OperatorRunStatus,
  OperatorStepState,
  OperatorStepView,
  OperatorUiList,
} from "@/lib/operator/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type OperatorLoopEvent =
  | { type: "text"; delta: string }
  | {
      type: "step";
      step: {
        id: string;
        seq: number;
        toolName: string;
        label: string;
        state: OperatorStepState;
        resultSummary: string | null;
        errorText: string | null;
        ui: OperatorUiList | null;
        arguments: unknown;
      };
    }
  | { type: "confirmation"; confirmation: OperatorConfirmationView }
  | { type: "status"; status: OperatorRunStatus; finalResponse?: string | null; stopReason?: string | null }
  | { type: "error"; message: string };

function assistantText(content: AgentMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } => "type" in block && block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

async function loadMessages(runId: string, orgId: string): Promise<AgentMessage[]> {
  const db = await createClient();
  const { data } = await db
    .from("operator_runs")
    .select("messages")
    .eq("id", runId)
    .eq("org_id", orgId)
    .maybeSingle();
  const raw = data?.messages;
  return Array.isArray(raw) ? (raw as unknown as AgentMessage[]) : [];
}

async function saveMessages(runId: string, orgId: string, messages: AgentMessage[]): Promise<void> {
  await updateRunState({ runId, orgId, messages: messages as unknown as Json });
}

function stopStatus(kind: "step" | "time"): OperatorRunStatus {
  return kind === "step" ? "stopped_step_limit" : "stopped_time_limit";
}

function stopCopy(kind: "step" | "time", text: string): string {
  const prefix =
    kind === "step"
      ? `Stopped after ${OPERATOR_STEP_LIMIT} tool calls.`
      : "Stopped because this run reached the time limit.";
  return text ? `${prefix} Completed so far:\n\n${text}` : `${prefix} Nothing further was done.`;
}

export async function runOperatorLoop(input: {
  runId: string;
  orgId: string;
  startedAtMs: number;
  emit: (event: OperatorLoopEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const ctx = await getAuthContext();
  const cap = await loadOrgBatchCap(await createClient(), input.orgId);
  const messages = await loadMessages(input.runId, input.orgId);
  let finalText = "";

  const finish = async (
    status: OperatorRunStatus,
    response: string | null,
    stopReason: string | null
  ) => {
    await saveMessages(input.runId, input.orgId, messages);
    await updateRunState({
      runId: input.runId,
      orgId: input.orgId,
      status,
      finalResponse: response,
      stopReason,
      finished: status !== "awaiting_confirmation" && status !== "running",
    });
    input.emit({ type: "status", status, finalResponse: response, stopReason });
  };

  try {
    while (true) {
      const elapsed = Date.now() - input.startedAtMs;
      if (elapsed >= OPERATOR_TIME_LIMIT_MS) {
        const text = stopCopy("time", finalText);
        await finish("stopped_time_limit", text, "time_limit");
        return;
      }
      const seqNow = (await nextStepSeq(await createClient(), input.runId)) - 1;
      if (seqNow >= OPERATOR_STEP_LIMIT) {
        const text = stopCopy("step", finalText);
        await finish("stopped_step_limit", text, "step_limit");
        return;
      }

      const remainingMs = Math.max(5_000, OPERATOR_TIME_LIMIT_MS - elapsed);
      const message = await streamOperatorMessage({
        messages,
        timeoutMs: remainingMs,
        signal: input.signal,
        onEvent: (event) => {
          if (event.type === "text") input.emit({ type: "text", delta: event.delta });
        },
      });
      await addRunTokens(input.runId, input.orgId, message.inputTokens, message.outputTokens);
      await updateRunState({ runId: input.runId, orgId: input.orgId, model: message.model });

      messages.push({ role: "assistant", content: message.content });
      const text = assistantText(message.content);
      if (text) finalText = text;

      const toolUses = message.content.filter(
        (block): block is Extract<(typeof message.content)[number], { type: "tool_use" }> =>
          block.type === "tool_use"
      );

      if (toolUses.length === 0) {
        await finish("completed", text || "Done.", message.stopReason);
        return;
      }

      const toolResults: AgentToolResult[] = [];
      let pendingWrite = false;

      for (const tool of toolUses) {
        const elapsedInner = Date.now() - input.startedAtMs;
        if (elapsedInner >= OPERATOR_TIME_LIMIT_MS) {
          const copy = stopCopy("time", finalText);
          await finish("stopped_time_limit", copy, "time_limit");
          return;
        }
        const seq = await nextStepSeq(await createClient(), input.runId);
        if (seq > OPERATOR_STEP_LIMIT) {
          for (const leftover of toolUses.slice(toolUses.indexOf(tool))) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: leftover.id,
              content: JSON.stringify({
                ok: false,
                kind: "failed",
                error: `Stopped after ${OPERATOR_STEP_LIMIT} tool calls.`,
              }),
              is_error: true,
            });
          }
          messages.push({ role: "user", content: toolResults });
          const copy = stopCopy("step", finalText);
          await finish("stopped_step_limit", copy, "step_limit");
          return;
        }

        const startedAt = Date.now();
        const stepId = await insertRunningStep({
          runId: input.runId,
          orgId: input.orgId,
          seq,
          toolName: tool.name,
          args: tool.input,
        });
        input.emit({
          type: "step",
          step: {
            id: stepId,
            seq,
            toolName: tool.name,
            label: toolLabel(tool.name),
            state: "running",
            resultSummary: null,
            errorText: null,
            ui: null,
            arguments: tool.input,
          },
        });

        let outcome;
        if (!isOperatorToolName(tool.name)) {
          outcome = {
            ok: false as const,
            kind: "failed" as const,
            error: "That is not a tool.",
            summary: "That is not a tool.",
            leadIds: [] as string[],
          };
        } else if (isProposeToolName(tool.name)) {
          outcome = await runProposeTool({
            name: tool.name,
            rawInput: tool.input,
            ctx,
            cap,
            runId: input.runId,
            stepId,
          });
        } else {
          outcome = await runReadTool(tool.name, tool.input, ctx);
        }

        const state: OperatorStepView["state"] =
          !outcome.ok && outcome.kind === "permission" ? "permission" : outcome.ok ? "done" : "failed";
        const ui = outcome.ok && outcome.kind === "read" ? outcome.ui : outcome.ok && outcome.kind === "propose" ? null : null;
        await finishStep({
          stepId,
          runId: input.runId,
          orgId: input.orgId,
          state,
          summary: outcome.summary,
          result: outcome.ok ? outcome.model : { error: outcome.error, kind: outcome.kind },
          ui,
          errorKind: outcome.ok ? null : outcome.kind,
          errorText: outcome.ok ? null : outcome.error,
          startedAt,
        });
        await touchLeads(input.orgId, input.runId, outcome.leadIds);
        input.emit({
          type: "step",
          step: {
            id: stepId,
            seq,
            toolName: tool.name,
            label: toolLabel(tool.name),
            state,
            resultSummary: outcome.summary,
            errorText: outcome.ok ? null : outcome.error,
            ui,
            arguments: tool.input,
          },
        });
        if (outcome.ok && outcome.kind === "propose") {
          pendingWrite = true;
          input.emit({ type: "confirmation", confirmation: outcome.confirmation });
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: modelToolResultPayload(outcome),
          is_error: !outcome.ok,
        });
      }

      messages.push({ role: "user", content: toolResults });
      await saveMessages(input.runId, input.orgId, messages);

      if (pendingWrite) {
        await finish("awaiting_confirmation", null, "awaiting_confirmation");
        return;
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The language model failed.";
    input.emit({ type: "error", message });
    await finish("failed", message, "model_error");
  }
}

export async function appendOperatorDecision(
  runId: string,
  orgId: string,
  text: string
): Promise<void> {
  const messages = await loadMessages(runId, orgId);
  messages.push({ role: "user", content: text });
  await saveMessages(runId, orgId, messages);
  await updateRunState({ runId, orgId, status: "running", finished: false });
}

export async function appendOperatorFollowUp(
  runId: string,
  orgId: string,
  followUp: string
): Promise<void> {
  const messages = await loadMessages(runId, orgId);
  messages.push({ role: "user", content: followUp });
  await saveMessages(runId, orgId, messages);
  await updateRunState({
    runId,
    orgId,
    status: "running",
    followUpText: followUp,
    followUpUsed: true,
    finished: false,
  });
}

export { stopStatus };
