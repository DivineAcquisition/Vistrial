import "server-only";

import { actorFromMember } from "@/lib/agents/identity";
import { loadAgentRunContext } from "@/lib/agents/context";
import { createOperatorStore, ensureOperatorFrameworkRun } from "@/lib/agents/operator-adapter";
import { runAgentRuntime, type AgentRuntimeEvent } from "@/lib/agents/runtime";
import { getAuthContext } from "@/lib/auth/session";
import { loadOrgBatchCap } from "@/lib/operator/persist";
import { updateRunState } from "@/lib/operator/persist";
import type {
  AgentMessage,
  OperatorConfirmationView,
  OperatorRunStatus,
  OperatorStepState,
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

function toOperatorEvent(event: AgentRuntimeEvent): OperatorLoopEvent | null {
  if (event.type === "text" || event.type === "error") return event;
  if (event.type === "confirmation") {
    return { type: "confirmation", confirmation: event.confirmation as OperatorConfirmationView };
  }
  if (event.type === "step") {
    return {
      type: "step",
      step: {
        id: event.step.id,
        seq: event.step.seq,
        toolName: event.step.toolName,
        label: event.step.label,
        state: event.step.state as OperatorStepState,
        resultSummary: event.step.resultSummary,
        errorText: event.step.errorText,
        ui: event.step.ui as OperatorUiList | null,
        arguments: event.step.arguments,
      },
    };
  }
  if (event.type === "status") {
    const mapped: OperatorRunStatus =
      event.status === "stopped_halt" || event.status === "stopped_cap" || event.status === "dead_lettered"
        ? "failed"
        : event.status === "queued" || event.status === "awaiting_batch" || event.status === "observation"
          ? "running"
          : event.status;
    return {
      type: "status",
      status: mapped,
      finalResponse: event.finalResponse,
      stopReason: event.stopReason,
    };
  }
  return null;
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

export async function runOperatorLoop(input: {
  runId: string;
  orgId: string;
  startedAtMs: number;
  emit: (event: OperatorLoopEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const ctx = await getAuthContext();
  const requester = actorFromMember({
    userId: ctx.user.id,
    memberId: ctx.member.id,
    role: ctx.role,
    displayName: ctx.member.displayName,
  });
  const loaded = await loadAgentRunContext({
    orgId: input.orgId,
    agentId: "operator",
    mode: "on_demand",
    requester,
    timezone: ctx.org.timezone,
  });
  if (!loaded.gate.ok) {
    await updateRunState({
      runId: input.runId,
      orgId: input.orgId,
      status: "failed",
      finalResponse: loaded.gate.message,
      stopReason: loaded.gate.reason,
      finished: true,
    });
    input.emit({ type: "error", message: loaded.gate.message });
    input.emit({ type: "status", status: "failed", finalResponse: loaded.gate.message, stopReason: loaded.gate.reason });
    return;
  }
  if (!loaded.actor) {
    await updateRunState({
      runId: input.runId,
      orgId: input.orgId,
      status: "failed",
      finalResponse: "This run has no team member to run as.",
      stopReason: "no_identity",
      finished: true,
    });
    input.emit({ type: "error", message: "This run has no team member to run as." });
    return;
  }

  const cap = await loadOrgBatchCap(await createClient(), input.orgId);
  const { data: runRow } = await (await createClient())
    .from("operator_runs")
    .select("request_text")
    .eq("id", input.runId)
    .eq("org_id", input.orgId)
    .maybeSingle();
  await ensureOperatorFrameworkRun({
    runId: input.runId,
    orgId: input.orgId,
    actor: loaded.actor,
    requestText: runRow?.request_text ?? "",
  });

  const store = createOperatorStore({
    runId: input.runId,
    orgId: input.orgId,
    ctx,
    cap,
    agentId: "operator",
    actor: loaded.actor,
    emit: (event) => {
      const mapped = toOperatorEvent(event);
      if (mapped) input.emit(mapped);
    },
  });

  await runAgentRuntime({
    agentId: "operator",
    mode: "on_demand",
    orgId: input.orgId,
    runId: input.runId,
    trigger: { kind: "on_demand", key: `on_demand:${input.runId}` },
    actor: loaded.actor,
    workKind: loaded.gate.definition.workKind,
    routes: loaded.routes,
    startedAtMs: input.startedAtMs,
    signal: input.signal,
    lastUserActivityAt: loaded.lastUserActivityAt,
    store,
  });
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
