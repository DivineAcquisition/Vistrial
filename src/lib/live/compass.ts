import "server-only";

import type { UIMessage } from "ai";

import { startRun, type RunRecorder, type StepHandle } from "@/lib/live/record";

/**
 * Ask Vistrial turns, recorded as Compass runs. Labels never carry the
 * question or answer text: the conversation itself holds that, and the live
 * record is visible to more people than the person asking.
 *
 * Every call here swallows its own errors. Recording is a view of the work,
 * so a failure to record must never fail the conversation.
 */

export type CompassTurn = {
  recorder: RunRecorder;
  thinking: StepHandle | null;
};

async function quiet<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (cause) {
    console.error("[compass] could not record", cause instanceof Error ? cause.message : "unknown");
    return null;
  }
}

function lastUserMessageId(messages: UIMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].id;
  }
  return null;
}

export function waitingForApproval(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  return last.parts.some(
    (part) => typeof part.type === "string" && part.type.startsWith("tool-") && (part as { state?: string }).state === "approval-requested"
  );
}

function toolCount(messages: UIMessage[]): number {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return 0;
  return last.parts.filter((part) => typeof part.type === "string" && part.type.startsWith("tool-")).length;
}

export async function beginCompassTurn(input: {
  orgId: string;
  memberId: string;
  conversationId: string;
  messages: UIMessage[];
  resumingApproval: boolean;
}): Promise<CompassTurn | null> {
  const userMessageId = lastUserMessageId(input.messages);
  if (!userMessageId) return null;
  return quiet(async () => {
    const recorder = await startRun({
      orgId: input.orgId,
      agentId: "compass",
      triggerKey: `chat:${input.conversationId}:${userMessageId}`,
      subjectLabel: "A question in Ask Vistrial",
      subjectHref: `/app/ask?c=${input.conversationId}`,
      actorMemberId: input.memberId,
      plan: ["Reading this workspace", "Thinking through the answer", "Answer ready"],
    });
    if (input.resumingApproval) {
      const step = await recorder.step("Carrying out what you decided");
      return { recorder, thinking: step };
    }
    await recorder.begin();
    const reading = await recorder.step("Reading this workspace");
    return { recorder, thinking: reading };
  });
}

export async function compassContextRead(turn: CompassTurn | null): Promise<void> {
  if (!turn) return;
  await quiet(async () => {
    await turn.thinking?.done({
      sources: [
        { kind: "configuration", label: "Workspace setup" },
        { kind: "record", label: "Recent leads and results" },
      ],
    });
    turn.thinking = await turn.recorder.step("Thinking through the answer");
  });
}

export async function finishCompassTurn(turn: CompassTurn | null, messages: UIMessage[]): Promise<void> {
  if (!turn) return;
  await quiet(async () => {
    const tools = toolCount(messages);
    await turn.thinking?.done({ detail: tools ? `Used ${tools} ${tools === 1 ? "tool" : "tools"}.` : null });
    if (waitingForApproval(messages)) {
      await turn.recorder.needPerson({
        kind: "approval",
        prompt: "Compass wants to do something outside Vistrial and is waiting for your approval in the conversation.",
        whoCanAct: "The person who asked",
      });
      return;
    }
    await turn.recorder.output({ kind: "answer", title: "Answer ready in Ask Vistrial" });
    await turn.recorder.finish({ reason: "Answered in Ask Vistrial." });
  });
}

export async function failCompassTurn(turn: CompassTurn | null, technical: string): Promise<void> {
  if (!turn) return;
  await quiet(async () => {
    await turn.thinking?.fail();
    await turn.recorder.fail("Compass could not finish this answer. Nothing outside Vistrial was changed.", technical);
  });
}
