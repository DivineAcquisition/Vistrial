import { boxById, edgesFrom, startBox } from "@/lib/workflows/graph";
import type { Box, EndReason, Graph, Tier } from "@/lib/workflows/types";

export type LeadSignals = {
  optedOut: boolean;
  doNotContact: boolean;
  closed: boolean;
  closedWon: boolean;
  repliedSinceStep: boolean;
  booking: "none" | "in_place" | "completed" | "missed";
  stage: string | null;
  tier: Tier | null;
  source: string | null;
  service: string | null;
  hasOwner: boolean;
  humanTouchedRecently: boolean;
  /** A Relay draft or approval is already open for this lead. */
  pendingDraft: boolean;
  /** An open task already has this purpose. */
  openTaskPurpose: boolean;
  /** Workspace allows a route box to reassign without a confirmation task. */
  autoReassign: boolean;
};

export type EnrollmentState = {
  boxId: string;
  status: "active" | "paused" | "needs_attention" | "finished";
  endReason: EndReason | null;
  acted: boolean;
  passes: Record<string, number>;
};

export type Effect =
  | { type: "draft"; channel: "sms" | "email"; snippetKey: string; boxId: string }
  | { type: "reuse_draft"; boxId: string }
  | { type: "task"; title: string; assignee: "lead_owner" | "owner" | "role" | "person"; role: "owner" | "operator" | null; personId: string | null; dueHours: number; notify: boolean; purpose: string }
  | { type: "reuse_task"; purpose: string }
  | { type: "route"; mode: "assign_unowned" | "reassign" }
  | { type: "finish"; reason: EndReason };

export type StepResult = { enrollment: EnrollmentState; effects: Effect[]; moved: boolean };

const TIER_RANK: Record<Tier, number> = { cold: 0, cool: 1, warm: 2, hot: 3 };

export function initialEnrollment(graph: Graph): EnrollmentState | null {
  const start = startBox(graph);
  if (!start) return null;
  const next = edgesFrom(graph, start.id, "next")[0];
  return {
    boxId: next?.target ?? start.id,
    status: "active",
    endReason: null,
    acted: false,
    passes: {},
  };
}

/**
 * One step. Opt-out, do-not-contact, and a closed lead always leave, even
 * mid-wait. Nothing here sends a message.
 */
export function stepEnrollment(graph: Graph, enrollment: EnrollmentState, signals: LeadSignals, draftState: "none" | "pending" | "approved" | "expired" | "skipped"): StepResult {
  if (enrollment.status === "paused" || enrollment.status === "finished" || enrollment.status === "needs_attention") {
    return { enrollment, effects: [], moved: false };
  }
  if (signals.optedOut || signals.doNotContact || signals.closed) {
    return finish(enrollment, "stopped");
  }
  const box = boxById(graph, enrollment.boxId);
  if (!box) return { enrollment: { ...enrollment, status: "needs_attention" }, effects: [], moved: false };

  if (box.type === "end" && box.config.type === "end") return finish(enrollment, box.config.reason);
  if (box.type === "wait") return { enrollment, effects: [], moved: false };
  if (box.type === "check" && box.config.type === "check") return takeCheck(graph, enrollment, box, signals);
  if (box.type === "draft" && box.config.type === "draft") return takeDraft(graph, enrollment, box, signals, draftState);
  if (box.type === "task" && box.config.type === "task") return takeTask(graph, enrollment, box, signals);
  if (box.type === "route" && box.config.type === "route") return takeRoute(graph, enrollment, box, signals);
  if (box.type === "start") return moveNext(graph, enrollment, box.id, "next");
  return moveNext(graph, enrollment, box.id, "next");
}

/** A wait releases only when the caller says it is due. */
export function releaseWait(graph: Graph, enrollment: EnrollmentState): StepResult {
  const box = boxById(graph, enrollment.boxId);
  if (!box || box.type !== "wait" || enrollment.status !== "active") return { enrollment, effects: [], moved: false };
  return moveNext(graph, enrollment, box.id, "next");
}

function takeCheck(graph: Graph, enrollment: EnrollmentState, box: Box, signals: LeadSignals): StepResult {
  if (box.config.type !== "check") return { enrollment, effects: [], moved: false };
  const yes = checkPasses(box, signals);
  if (yes) return moveNext(graph, enrollment, box.id, "yes");
  const loop = edgesFrom(graph, box.id, "loop")[0];
  const used = enrollment.passes[loop?.id ?? ""] ?? 0;
  if (loop && loop.maxPasses && used < loop.maxPasses) {
    return {
      enrollment: { ...enrollment, boxId: loop.target, acted: false, passes: { ...enrollment.passes, [loop.id]: used + 1 } },
      effects: [],
      moved: true,
    };
  }
  return moveNext(graph, enrollment, box.id, "no");
}

function checkPasses(box: Box, signals: LeadSignals): boolean {
  if (box.config.type !== "check") return false;
  const config = box.config;
  switch (config.check) {
    case "replied":
      return signals.repliedSinceStep;
    case "booking":
      if (config.booking === "missed") return signals.booking === "missed";
      if (config.booking === "completed") return signals.booking === "completed";
      return signals.booking === "in_place" || signals.booking === "completed";
    case "stage":
      return signals.stage === config.stage;
    case "tier":
      if (!signals.tier || !config.tier) return false;
      return TIER_RANK[signals.tier] >= TIER_RANK[config.tier];
    case "field":
      if (config.field === "source") return signals.source === config.value;
      if (config.field === "service") return signals.service === config.value;
      return false;
    case "owner":
      return signals.hasOwner;
    case "human":
      return signals.humanTouchedRecently;
    default:
      return false;
  }
}

function takeDraft(graph: Graph, enrollment: EnrollmentState, box: Box, signals: LeadSignals, draftState: "none" | "pending" | "approved" | "expired" | "skipped"): StepResult {
  if (box.config.type !== "draft") return { enrollment, effects: [], moved: false };
  if (!enrollment.acted) {
    if (signals.pendingDraft) {
      return { enrollment: { ...enrollment, acted: true }, effects: [{ type: "reuse_draft", boxId: box.id }], moved: false };
    }
    return {
      enrollment: { ...enrollment, acted: true },
      effects: [{ type: "draft", channel: box.config.channel, snippetKey: box.config.snippetKey, boxId: box.id }],
      moved: false,
    };
  }
  if (draftState === "pending" || draftState === "none") return { enrollment, effects: [], moved: false };
  if (draftState === "approved") return moveNext(graph, enrollment, box.id, "next");
  if (box.config.expiry === "stop") return finish(enrollment, "stopped");
  return moveNext(graph, enrollment, box.id, "expired");
}

function takeTask(graph: Graph, enrollment: EnrollmentState, box: Box, signals: LeadSignals): StepResult {
  if (box.config.type !== "task") return { enrollment, effects: [], moved: false };
  const purpose = `workflow:${box.id}`;
  const effect: Effect = signals.openTaskPurpose
    ? { type: "reuse_task", purpose }
    : {
        type: "task",
        title: box.config.title,
        assignee: box.config.assignee,
        role: box.config.role,
        personId: box.config.personId,
        dueHours: box.config.dueHours,
        notify: box.config.notify,
        purpose,
      };
  const moved = moveNext(graph, enrollment, box.id, "next");
  return { enrollment: moved.enrollment, effects: [effect, ...moved.effects], moved: true };
}

function takeRoute(graph: Graph, enrollment: EnrollmentState, box: Box, signals: LeadSignals): StepResult {
  if (box.config.type !== "route") return { enrollment, effects: [], moved: false };
  let effect: Effect;
  if (!signals.hasOwner) {
    effect = { type: "route", mode: "assign_unowned" };
  } else if (box.config.mode === "assign_unowned") {
    const moved = moveNext(graph, enrollment, box.id, "next");
    return moved;
  } else if (signals.autoReassign) {
    effect = { type: "route", mode: "reassign" };
  } else {
    effect = {
      type: "task",
      title: "Confirm a new owner for this lead",
      assignee: "owner",
      role: "owner",
      personId: null,
      dueHours: 8,
      notify: true,
      purpose: `workflow:${box.id}:reassign`,
    };
  }
  const moved = moveNext(graph, enrollment, box.id, "next");
  return { enrollment: moved.enrollment, effects: [effect, ...moved.effects], moved: true };
}

function moveNext(graph: Graph, enrollment: EnrollmentState, boxId: string, port: "next" | "yes" | "no" | "expired"): StepResult {
  const edge = edgesFrom(graph, boxId, port)[0];
  if (!edge) return { enrollment: { ...enrollment, status: "needs_attention", acted: false }, effects: [], moved: false };
  const target = boxById(graph, edge.target);
  if (target?.type === "end" && target.config.type === "end") {
    return finish({ ...enrollment, boxId: target.id, acted: false }, target.config.reason);
  }
  return { enrollment: { ...enrollment, boxId: edge.target, acted: false }, effects: [], moved: true };
}

function finish(enrollment: EnrollmentState, reason: EndReason): StepResult {
  return {
    enrollment: { ...enrollment, status: "finished", endReason: reason, acted: false },
    effects: [{ type: "finish", reason }],
    moved: true,
  };
}

export function signalsAllowEntry(signals: Pick<LeadSignals, "optedOut" | "doNotContact" | "closed">): boolean {
  return !signals.optedOut && !signals.doNotContact && !signals.closed;
}
