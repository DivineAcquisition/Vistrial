import { boxById } from "@/lib/workflows/graph";
import { releaseWait, stepEnrollment, type EnrollmentState, type LeadSignals } from "@/lib/workflows/engine";
import type { Graph } from "@/lib/workflows/types";

const QUIET: LeadSignals = {
  optedOut: false,
  doNotContact: false,
  closed: false,
  closedWon: false,
  repliedSinceStep: false,
  booking: "none",
  stage: null,
  tier: null,
  source: null,
  service: null,
  hasOwner: true,
  humanTouchedRecently: false,
  pendingDraft: false,
  openTaskPurpose: false,
  autoReassign: false,
};

/** A labeled sample. No draft, task, or notice is created. */
export function walkSample(graph: Graph, enrollment: EnrollmentState, choices: Record<string, boolean>): { path: string[]; enrollment: EnrollmentState } {
  const path: string[] = [];
  let current = enrollment;
  for (let i = 0; i < 40 && current.status === "active"; i += 1) {
    const box = boxById(graph, current.boxId);
    if (!box) break;
    path.push(box.title);
    if (box.type === "wait") {
      const released = releaseWait(graph, current);
      current = released.enrollment;
      continue;
    }
    const signals: LeadSignals = { ...QUIET, repliedSinceStep: Boolean(choices[box.id]) };
    const draftState = box.type === "draft" ? (current.acted ? "approved" : "none") : "none";
    const result = stepEnrollment(graph, current, signals, draftState);
    if (!result.moved && result.effects.some((effect) => effect.type === "draft")) {
      current = { ...result.enrollment, acted: true };
      const approved = stepEnrollment(graph, current, signals, "approved");
      current = approved.enrollment;
      continue;
    }
    if (!result.moved) break;
    current = result.enrollment;
  }
  return { path, enrollment: current };
}
