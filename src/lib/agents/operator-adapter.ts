import "server-only";

import {
  incrementAgentRunSteps,
  incrementAgentRunUsage,
  insertEscalation,
  insertAgentRun,
  recordAgentRunFailure,
  updateAgentRun,
} from "@/lib/agents/persist";
import { estimatedAgentSpendUsd } from "@/lib/agents/spend";
import type { AgentRuntimeEvent, AgentRuntimeStore, RuntimeModelTurn, RuntimeToolResult } from "@/lib/agents/runtime";
import { cacheLastTool, withPromptCache } from "@/lib/agents/anthropic";
import { submitMessageBatch } from "@/lib/agents/batch";
import { assertModelAllowed } from "@/lib/agents/model-config";
import type { AgentActor, AgentId, WorkKind } from "@/lib/agents/types";
import { isOperatorToolName, isProposeToolName, operatorAnthropicTools } from "@/lib/operator/catalog";
import { streamOperatorMessage } from "@/lib/operator/anthropic";
import { OPERATOR_SYSTEM_PROMPT } from "@/lib/operator/prompt";
import { toolLabel } from "@/lib/operator/labels";
import {
  addRunTokens,
  finishStep,
  insertRunningStep,
  nextStepSeq,
  touchLeads,
  updateRunState,
} from "@/lib/operator/persist";
import { runProposeTool } from "@/lib/operator/propose";
import { modelToolResultPayload, runReadTool } from "@/lib/operator/tools";
import type { AgentMessage, OperatorUiList, ToolOutcome } from "@/lib/operator/types";
import type { AuthContext } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export function createOperatorStore(args: {
  runId: string;
  orgId: string;
  ctx: AuthContext;
  cap: number;
  agentId: AgentId;
  actor: AgentActor;
  emit: (event: AgentRuntimeEvent) => void;
}): AgentRuntimeStore {
  const dbPromise = createClient();

  return {
    async loadMessages() {
      const db = await dbPromise;
      const { data } = await db
        .from("operator_runs")
        .select("messages")
        .eq("id", args.runId)
        .eq("org_id", args.orgId)
        .maybeSingle();
      const raw = data?.messages;
      return Array.isArray(raw) ? (raw as unknown as AgentMessage[]) : [];
    },
    async saveMessages(messages) {
      await updateRunState({ runId: args.runId, orgId: args.orgId, messages: messages as unknown as Json });
    },
    async nextStepSeq() {
      return nextStepSeq(await dbPromise, args.runId);
    },
    async insertRunningStep(input) {
      return insertRunningStep({
        runId: args.runId,
        orgId: args.orgId,
        seq: input.seq,
        toolName: input.toolName,
        args: input.args,
      });
    },
    async finishStep(input) {
      await finishStep({
        stepId: input.stepId,
        runId: args.runId,
        orgId: args.orgId,
        state: input.state as "running" | "done" | "failed" | "permission",
        summary: input.summary,
        result: input.result as Json,
        ui: (input.ui as OperatorUiList | null) ?? null,
        errorKind: input.errorKind,
        errorText: input.errorText,
        startedAt: input.startedAt,
      });
      const db = await dbPromise;
      await incrementAgentRunSteps(db as never, args.runId, args.orgId);
    },
    async addTokens(input) {
      await addRunTokens(args.runId, args.orgId, input.inputTokens, input.outputTokens);
      const db = await dbPromise;
      await incrementAgentRunUsage(db as never, {
        runId: args.runId,
        orgId: args.orgId,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        cacheReadTokens: input.cacheReadTokens,
        spendUsd: estimatedAgentSpendUsd({
          model: input.model,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          cacheReadTokens: input.cacheReadTokens,
        }),
      });
    },
    async recordModel(model) {
      await updateRunState({ runId: args.runId, orgId: args.orgId, model });
      const db = await dbPromise;
      await updateAgentRun(db as never, {
        runId: args.runId,
        orgId: args.orgId,
        model,
        modelVersion: model,
      });
    },
    async updateRun(input) {
      await updateRunState({
        runId: args.runId,
        orgId: args.orgId,
        status: input.status === "stopped_halt" || input.status === "stopped_cap" || input.status === "dead_lettered"
          ? "failed"
          : input.status === "queued" || input.status === "awaiting_batch" || input.status === "observation"
            ? "running"
            : input.status,
        finalResponse: input.finalResponse,
        stopReason: input.stopReason,
        finished: input.finished,
        messages: input.messages as unknown as Json | undefined,
      });
      const db = await dbPromise;
      if (input.status === "failed") {
        await recordAgentRunFailure(db as never, {
          runId: args.runId,
          orgId: args.orgId,
          mode: "on_demand",
          stopReason: input.stopReason,
          outputText: input.finalResponse,
        });
        return;
      }
      await updateAgentRun(db as never, {
        runId: args.runId,
        orgId: args.orgId,
        status: input.status,
        outputText: input.finalResponse,
        stopReason: input.stopReason,
        finished: input.finished,
      });
    },
    async recordEscalation(input) {
      const db = await dbPromise;
      await insertEscalation(db as never, {
        orgId: args.orgId,
        agentId: args.agentId,
        runId: args.runId,
        stepIndex: input.stepIndex,
        workKind: input.workKind,
        fromTier: input.fromTier,
        toTier: input.toTier,
      });
    },
    async executeTool(input) {
      let raw: ToolOutcome;
      if (!isOperatorToolName(input.name)) {
        raw = {
          ok: false,
          kind: "failed",
          error: "That is not a tool.",
          summary: "That is not a tool.",
          leadIds: [],
        };
      } else if (isProposeToolName(input.name)) {
        raw = await runProposeTool({
          name: input.name,
          rawInput: input.args,
          ctx: args.ctx,
          cap: args.cap,
          runId: args.runId,
          stepId: input.stepId,
        });
      } else {
        raw = await runReadTool(input.name, input.args, args.ctx);
      }
      await touchLeads(args.orgId, args.runId, raw.leadIds);
      const outcome: RuntimeToolResult = {
        ok: raw.ok,
        kind: raw.kind,
        summary: raw.summary,
        error: raw.ok ? undefined : raw.error,
        model: raw.ok ? raw.model : undefined,
        ui: raw.ok && raw.kind === "read" ? raw.ui : null,
        leadIds: raw.leadIds,
        pendingWrite: raw.ok && raw.kind === "propose",
        confirmation: raw.ok && raw.kind === "propose" ? raw.confirmation : undefined,
        modelPayload: modelToolResultPayload(raw),
      };
      return outcome;
    },
    async streamTurn(input) {
      assertModelAllowed(input.model);
      if (input.useBatch) {
        const { batchId } = await submitMessageBatch({
          model: input.model,
          customId: `${args.runId}:${Date.now()}`,
          body: {
            max_tokens: 4096,
            system: [withPromptCache(OPERATOR_SYSTEM_PROMPT)],
            tools: cacheLastTool(operatorAnthropicTools()),
            messages: input.messages,
          },
        });
        throw new Error(`batch:${batchId}`);
      }
      const message = await streamOperatorMessage({
        messages: input.messages,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
        model: input.model,
        onEvent: (event) => {
          if (event.type === "text") input.onText?.(event.delta);
        },
      });
      const turn: RuntimeModelTurn = {
        content: message.content,
        inputTokens: message.inputTokens,
        outputTokens: message.outputTokens,
        model: message.model,
        stopReason: message.stopReason,
      };
      return turn;
    },
    async afterFinalText({ text }) {
      const db = await dbPromise;
      const { data: stepRows } = await db
        .from("operator_run_steps")
        .select("seq, tool_name, result_summary, result")
        .eq("run_id", args.runId)
        .eq("org_id", args.orgId)
        .order("seq", { ascending: true });
      const { correctAgentResponse } = await import("@/lib/verification/agent-response");
      const { persistBoundedVerification } = await import("@/lib/verification/record");
      const checked = correctAgentResponse({
        response: text,
        steps: (stepRows ?? []).map((row) => ({
          seq: row.seq,
          toolName: row.tool_name,
          summary: row.result_summary,
          result: row.result,
        })),
      });
      const display = checked.ok ? text : checked.corrected;
      await persistBoundedVerification({
        orgId: args.orgId,
        task: "agent_response",
        subjectType: "operator_run",
        subjectId: args.runId,
        result: {
          output: display,
          attempt: 1,
          retryHappened: false,
          finalState: checked.ok ? "passed" : "corrected",
          stageCaught: checked.ok ? "none" : "deterministic",
          faults: checked.faults,
          modelInvoked: false,
          verificationModel: null,
          inputTokens: 0,
          outputTokens: 0,
          skippedReason: null,
        },
      });
      return { text: display, verificationPassed: checked.ok };
    },
    toolLabel,
    emit: args.emit,
  };
}

export async function ensureOperatorFrameworkRun(args: {
  runId: string;
  orgId: string;
  actor: AgentActor;
  requestText: string;
}): Promise<void> {
  const db = await createClient();
  const created = await insertAgentRun(db as never, {
    id: args.runId,
    orgId: args.orgId,
    agentId: "operator",
    mode: "on_demand",
    triggerKind: "on_demand",
    triggerKey: `on_demand:${args.runId}`,
    actor: args.actor,
    requestText: args.requestText,
    status: "running",
  });
  void created;
}

export type { WorkKind };
