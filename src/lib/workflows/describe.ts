import type { Box, BoxConfig } from "@/lib/workflows/types";

const END_WORDS = {
  won: "Won",
  lost: "Lost",
  booked: "Booked and handed on",
  replied: "Replied and handed to a person",
  stopped: "Stopped",
} as const;

const KIND_WORDS: Record<BoxConfig["kind"], string> = {
  start: "Start",
  wait: "Wait",
  check: "Check",
  draft: "Draft a message",
  task: "Task",
  route: "Route",
  end: "End",
  note: "Note",
};

export function kindLabel(kind: BoxConfig["kind"]): string {
  return KIND_WORDS[kind];
}

function plural(n: number, one: string): string {
  return `${n} ${one}${n === 1 ? "" : "s"}`;
}

/** The agent that does the work in a box, for the glyph and name on its face. */
export function boxAgent(config: BoxConfig): "relay" | "sentry" | "assay" | "compass" | null {
  switch (config.kind) {
    case "draft":
      return "relay";
    case "start":
      return config.trigger === "tier_changed" ? "assay" : null;
    case "check":
      return config.check === "tier_at_least" ? "assay" : null;
    default:
      return null;
  }
}

/** A plain title and a one line summary. No jargon, no dashes. */
export function describeBox(box: Box): { title: string; summary: string } {
  const c = box.config;
  switch (c.kind) {
    case "start": {
      const how: Record<typeof c.trigger, string> = {
        new_lead: "A new lead arrives",
        stage_changed: `A lead moves to ${c.stage ?? "a chosen stage"}`,
        no_activity: `A lead has had no activity for ${plural(c.days ?? 0, "day")}`,
        booking: `A booking is ${c.bookingEvent ?? "changed"}`,
        tier_changed: `A lead becomes ${c.tier ?? "a chosen tier"}`,
        manual: "A person starts it for a lead",
      };
      return { title: "Start", summary: how[c.trigger] };
    }
    case "wait": {
      const length = c.unit === "days" ? plural(c.amount, "day") : plural(c.amount, "hour");
      return {
        title: `Wait ${length}`,
        summary: c.atTime ? `Then until ${c.atTime} in the lead's time` : "Counted from the last step",
      };
    }
    case "check":
      return { title: checkQuestion(c), summary: `${c.yesLabel} or ${c.noLabel}` };
    case "draft":
      return {
        title: `Draft a ${c.channel ?? "message"}`,
        summary: "Needs approval before it sends",
      };
    case "task":
      return { title: c.alert ? "Create a task and alert" : "Create a task", summary: c.text };
    case "route":
      return {
        title: c.mode === "assign_unowned" ? "Assign an owner" : "Ask to reassign",
        summary:
          c.mode === "assign_unowned"
            ? "Uses your routing rules"
            : "Asks the owner to confirm before anything changes",
      };
    case "end":
      return { title: `End: ${END_WORDS[c.reason]}`, summary: c.handOffTo ? "Hands the lead to another workflow" : "The lead leaves this workflow" };
    case "note":
      return { title: "Note", summary: c.text };
  }
}

function checkQuestion(c: Extract<BoxConfig, { kind: "check" }>): string {
  switch (c.check) {
    case "replied_since":
      return "Has the lead replied?";
    case "booking_state":
      return "Is there a booking?";
    case "stage_is":
      return `Is the stage ${c.value ?? "a chosen stage"}?`;
    case "tier_at_least":
      return `Is the tier ${c.value ?? "a chosen tier"} or better?`;
    case "field_is":
      return "Does a field match?";
    case "has_owner":
      return "Does the lead have an owner?";
    case "human_touched_recently":
      return "Has a person touched this lead recently?";
  }
}
