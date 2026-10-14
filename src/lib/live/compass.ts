import "server-only";

import { startRun, type RunRecorder, type StepHandle } from "@/lib/live/record";

/**
 * Compass turns, recorded as Compass runs in the shared event record. Each
 * lookup Compass makes is a real step ("Checking response times for last 7
 * days"), so the work shown in the chat matches what the product shows for
 * other agents.
 *
 * Labels never carry the question, the answer, or a lead's name: the run is a
 * private conversation's working record, visible only to the person who asked,
 * and it holds what Compass did (lookups, counts, durations, errors), not what
 * was said.
 *
 * Every call here swallows its own errors. Recording is a view of the work, so
 * a failure to record must never fail the conversation.
 */

export type CompassTurn = {
  recorder: RunRecorder;
  open: StepHandle | null;
};

async function quiet<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (cause) {
    console.error("[compass] could not record", cause instanceof Error ? cause.message : "unknown");
    return null;
  }
}

export async function beginCompassTurn(input: {
  orgId: string;
  memberId: string | null;
  conversationId: string;
  userMessageId: string;
}): Promise<CompassTurn | null> {
  return quiet(async () => {
    const recorder = await startRun({
      orgId: input.orgId,
      agentId: "compass",
      triggerKey: `compass:${input.conversationId}:${input.userMessageId}`,
      subjectLabel: "A question in Compass",
      subjectHref: `/app/compass?c=${input.conversationId}`,
      actorMemberId: input.memberId,
      plan: ["Understanding the question", "Looking it up", "Answer ready"],
    });
    await recorder.begin();
    const open = await recorder.step("Understanding the question");
    return { recorder, open };
  });
}

/** One real piece of work, shown live while it runs. */
export async function compassStep(turn: CompassTurn | null, label: string) {
  if (!turn) return null;
  return quiet(async () => {
    if (turn.open) {
      await turn.open.done();
      turn.open = null;
    }
    const handle = await turn.recorder.step(label.slice(0, 200));
    return {
      done: async (detail?: string | null) => {
        await quiet(() => handle.done({ detail: detail ?? null }));
      },
      fail: async () => {
        await quiet(() => handle.fail());
      },
    };
  });
}

export async function finishCompassTurn(
  turn: CompassTurn | null,
  result: { lookups: number; outcome: string; suggestions: number }
): Promise<void> {
  if (!turn) return;
  await quiet(async () => {
    await turn.open?.done();
    const parts = [`${result.lookups} ${result.lookups === 1 ? "lookup" : "lookups"}`];
    if (result.suggestions) parts.push(`${result.suggestions} ${result.suggestions === 1 ? "suggestion" : "suggestions"}`);
    await turn.recorder.output({ kind: "answer", title: result.outcome === "answered" ? "Answer ready" : "Answered with a note", body: parts.join(", ") });
    await turn.recorder.finish({ reason: `Answered in Compass (${parts.join(", ")}).` });
  });
}

export async function failCompassTurn(turn: CompassTurn | null, technical: string): Promise<void> {
  if (!turn) return;
  await quiet(async () => {
    await turn.open?.fail();
    await turn.recorder.fail("Compass could not finish this answer. Nothing was changed.", technical.slice(0, 300));
  });
}

/** A suggestion the person confirmed: its own short run, attributed to them, with Compass as the suggester. */
export async function recordCompassAction(input: {
  orgId: string;
  memberId: string | null;
  suggestionId: string;
  label: string;
  outcome: "done" | "refused";
  detail?: string;
}): Promise<void> {
  await quiet(async () => {
    const recorder = await startRun({
      orgId: input.orgId,
      agentId: "compass",
      triggerKey: `compass-action:${input.suggestionId}`,
      subjectLabel: "A suggestion from Compass",
      actorMemberId: input.memberId,
      plan: ["Checking you may do this", input.label],
    });
    await recorder.begin();
    const check = await recorder.step("Checking you may do this");
    await check.done();
    const act = await recorder.step(input.label.slice(0, 200));
    if (input.outcome === "done") {
      await act.done({ detail: input.detail ?? null });
      await recorder.finish({ reason: "Confirmed by the person; suggested by Compass." });
    } else {
      await act.fail();
      await recorder.fail(input.detail ?? "That could not be done.", "refused");
    }
  });
}
