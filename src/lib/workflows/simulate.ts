import { computeSendAt, nextLocalTime } from "@/lib/follow-up/quiet-hours";
import { describeBox } from "@/lib/workflows/describe";
import { boxById, outgoing, waitHours } from "@/lib/workflows/graph";
import type { Assignee, BoxConfig, BoxKind, EdgeExit, EndReason, WorkflowGraph } from "@/lib/workflows/types";

/** Locked. Messages to a lead go out only between 8 am and 8 pm in the lead's local time. */
export const QUIET_HOURS = { start: "20:00", end: "08:00" } as const;

export type SampleLead = { name: string; timeZone: string };

export type SimulationChoices = {
  /** The exit each Check takes. A Check with no choice takes its "no" exit. */
  checks?: Record<string, "yes" | "no">;
  /** Whether each draft is approved in time. A draft with no choice is approved. */
  drafts?: Record<string, "approved" | "expired">;
};

export type SimulationStep = {
  boxId: string;
  kind: BoxKind;
  title: string;
  /** When this box runs for the sample lead. */
  at: Date;
  sentence: string;
  exit: EdgeExit | null;
  exitLabel: string | null;
  /** Drafts only: when the approved message would go out. */
  sendAt: Date | null;
  heldForQuietHours: boolean;
  /** Set when the lead arrived here on a counted loop, starting at 1. */
  pass: number | null;
};

export type SimulationEnd =
  | { kind: "end"; at: Date; reason: EndReason; handOffTo: string | null; sentence: string }
  | { kind: "loop_limit"; at: Date; boxId: string; sentence: string }
  | { kind: "stuck"; at: Date; boxId: string; sentence: string };

export type Simulation = {
  steps: SimulationStep[];
  end: SimulationEnd;
  /** What would have been made. The test run itself creates nothing. */
  wouldCreate: { drafts: number; tasks: number; alerts: number; routes: number };
};

const END_WORDS: Record<EndReason, string> = {
  won: "Won",
  lost: "Lost",
  booked: "Booked and handed on",
  replied: "Replied and handed to a person",
  stopped: "Stopped",
};

export function formatLeadTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

function assigneeWords(assignee: Assignee): string {
  if (assignee.kind === "lead_owner") return "the lead's owner";
  if (assignee.kind === "role") return `the ${assignee.role} role`;
  return "the chosen person";
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/**
 * Walks a workflow for one labeled fake lead, as "Test with a sample lead" does.
 * It is a pure function: nothing is drafted, sent, assigned or notified. Times
 * are worked out in the lead's own time zone, and drafts respect the locked
 * quiet hours, so the person sees exactly when each step would happen.
 *
 * When a counted loop has run its maximum, the lead leaves the workflow as
 * Stopped. A loop never sends more than it says on the diagram.
 */
export function simulateWorkflow(
  graph: WorkflowGraph,
  input: { start: Date; lead: SampleLead; choices?: SimulationChoices; maxSteps?: number }
): Simulation {
  const { lead } = input;
  const checks = input.choices?.checks ?? {};
  const drafts = input.choices?.drafts ?? {};
  const maxSteps = input.maxSteps ?? 200;
  const local = (at: Date) => `${formatLeadTime(at, lead.timeZone)}, ${possessive(lead.name)} time`;
  const steps: SimulationStep[] = [];
  const wouldCreate = { drafts: 0, tasks: 0, alerts: 0, routes: 0 };
  const loopPasses = new Map<string, number>();

  let now = new Date(input.start.getTime());
  const start = graph.boxes.find((box) => box.config.kind === "start");
  if (!start) {
    return { steps, wouldCreate, end: { kind: "stuck", at: now, boxId: "", sentence: "This workflow has no Start box yet." } };
  }

  let currentId: string = start.id;
  let arrivedPass: number | null = null;

  for (let guard = 0; guard < maxSteps; guard++) {
    const box = boxById(graph, currentId);
    if (!box) {
      return { steps, wouldCreate, end: { kind: "stuck", at: now, boxId: currentId, sentence: "A line points at a box that does not exist." } };
    }
    const c = box.config;
    const { title, summary } = describeBox(box);
    const base = { boxId: box.id, kind: c.kind, title, at: now, sendAt: null, heldForQuietHours: false, pass: arrivedPass };

    if (c.kind === "end") {
      const sentence = `${lead.name} leaves the workflow: ${END_WORDS[c.reason]}.${c.handOffTo ? " The lead is handed to another workflow." : ""}`;
      steps.push({ ...base, sentence, exit: null, exitLabel: null });
      return { steps, wouldCreate, end: { kind: "end", at: now, reason: c.reason, handOffTo: c.handOffTo ?? null, sentence } };
    }

    let exit: EdgeExit = "next";
    let exitLabel: string | null = null;
    let sentence: string;
    let sendAt: Date | null = null;
    let held = false;

    switch (c.kind) {
      case "start":
        sentence = `${lead.name} enters when this happens: ${summary.toLowerCase()}. Starts ${local(now)}.`;
        break;
      case "wait": {
        now = new Date(now.getTime() + waitHours(c) * 3_600_000);
        if (c.atTime) now = nextLocalTime(now, lead.timeZone, c.atTime);
        const length = c.unit === "days" ? plural(c.amount, "day") : plural(c.amount, "hour");
        sentence = `Waits ${length}${c.atTime ? `, then until ${c.atTime}` : ""}. The next step is due ${local(now)}.`;
        break;
      }
      case "check": {
        exit = checks[box.id] ?? "no";
        exitLabel = exit === "yes" ? c.yesLabel : c.noLabel;
        sentence = `${title} For this run you chose "${exitLabel}".`;
        break;
      }
      case "draft": {
        wouldCreate.drafts += 1;
        const channel = c.channel ?? "message";
        const content = c.contentKind === "talk_track" ? "talk track" : "snippet";
        const outcome = drafts[box.id] ?? "approved";
        if (outcome === "expired") {
          exit = "expired";
          exitLabel = "Expired";
          now = new Date(now.getTime() + c.windowHours * 3_600_000);
          sentence = `Relay drafts a ${channel} from the chosen ${content}. Nobody approves it within ${plural(c.windowHours, "hour")}, so it expires and nothing is sent.`;
        } else {
          sendAt = computeSendAt({ now, timeZone: lead.timeZone, enabled: true, startHm: QUIET_HOURS.start, endHm: QUIET_HOURS.end });
          held = sendAt.getTime() !== now.getTime();
          sentence = held
            ? `Relay drafts a ${channel} from the chosen ${content} ${local(now)}. That is inside quiet hours, so once you approve it, it sends ${local(sendAt)}.`
            : `Relay drafts a ${channel} from the chosen ${content}. You approve it before it sends. It would send ${local(sendAt)}.`;
          now = sendAt;
        }
        break;
      }
      case "task": {
        wouldCreate.tasks += 1;
        if (c.alert) wouldCreate.alerts += 1;
        const due = new Date(now.getTime() + c.dueHours * 3_600_000);
        sentence = `Would create a task for ${assigneeWords(c.assignee)}${c.alert ? " and send an alert" : ""}: ${c.text.trim() || "no wording yet"}. Due ${local(due)}.`;
        break;
      }
      case "route":
        wouldCreate.routes += 1;
        sentence =
          c.mode === "assign_unowned"
            ? "Would assign an owner through your routing rules."
            : "Would ask the owner to confirm a reassignment. Nothing changes until they do.";
        break;
      case "note":
        sentence = c.text;
        break;
    }

    steps.push({ ...base, sentence, exit, exitLabel, sendAt, heldForQuietHours: held });

    const edge = outgoing(graph, box.id).find((item) => item.exit === exit);
    if (!edge) {
      return {
        steps,
        wouldCreate,
        end: { kind: "stuck", at: now, boxId: box.id, sentence: "This step has nowhere to go next. Connect it before publishing." },
      };
    }
    if (edge.maxPasses !== undefined) {
      const taken = (loopPasses.get(edge.id) ?? 0) + 1;
      if (taken > edge.maxPasses) {
        return {
          steps,
          wouldCreate,
          end: {
            kind: "loop_limit",
            at: now,
            boxId: box.id,
            sentence: `This loop has run the most it allows (${plural(edge.maxPasses, "time")}). ${lead.name} leaves the workflow as Stopped.`,
          },
        };
      }
      loopPasses.set(edge.id, taken);
      arrivedPass = taken;
    } else {
      arrivedPass = null;
    }
    currentId = edge.to;
  }

  return { steps, wouldCreate, end: { kind: "stuck", at: now, boxId: currentId, sentence: "The test run stopped after too many steps." } };
}

/** Every Check and Draft a person can set by hand in the test run, in path order. */
export function simulationControls(graph: WorkflowGraph): Array<{ boxId: string; kind: Extract<BoxConfig["kind"], "check" | "draft"> }> {
  return graph.boxes
    .filter((box) => box.config.kind === "check" || box.config.kind === "draft")
    .map((box) => ({ boxId: box.id, kind: box.config.kind as "check" | "draft" }));
}
