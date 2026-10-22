import {
  boxById,
  forwardEdges,
  hasCycle,
  outgoing,
  reachableFrom,
  requiredExits,
  waitHours,
} from "@/lib/workflows/graph";
import {
  DEFAULT_LIMITS,
  type Box,
  type CheckContext,
  type CheckIssue,
  type CheckResult,
  type WorkflowGraph,
} from "@/lib/workflows/types";

export const QUIET_HOURS_NOTE =
  "Messages send only between 8 am and 8 pm in the lead's local time. This is a locked rule.";

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Deterministic validation. Runs while editing and again at publish. A graph
 * with any error cannot be published, whether a person or the AI drew it.
 */
export function checkWorkflow(graph: WorkflowGraph, ctx: CheckContext): CheckResult {
  const limits = { ...DEFAULT_LIMITS, ...(ctx.limits ?? {}) };
  const issues: CheckIssue[] = [];

  const ids = new Set<string>();
  for (const box of graph.boxes) {
    if (ids.has(box.id)) issues.push(error("duplicate_box", "Two boxes share the same id.", box.id));
    ids.add(box.id);
  }
  for (const edge of graph.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      issues.push(error("dangling_edge", "A line points at a box that does not exist."));
    }
  }
  if (issues.length > 0) return finish(issues);

  if (graph.boxes.length > limits.maxBoxes) {
    issues.push(error("too_many_boxes", `A workflow can have at most ${limits.maxBoxes} boxes. This one has ${graph.boxes.length}.`));
  }

  const starts = graph.boxes.filter((box) => box.config.kind === "start");
  if (starts.length !== 1) {
    issues.push(
      error("one_start", starts.length === 0 ? "Add a Start box. Every workflow needs exactly one." : "A workflow can have only one Start box.")
    );
    return finish(issues);
  }
  const start = starts[0];

  for (const edge of graph.edges) {
    if (boxById(graph, edge.from)?.config.kind === "note" || boxById(graph, edge.to)?.config.kind === "note") {
      issues.push(error("note_connected", "Notes are labels only. Remove the line that touches this note.", edge.from));
    }
    if (edge.to === start.id) issues.push(error("into_start", "Nothing can lead back into Start.", edge.from));
  }

  const reachable = reachableFrom(graph, start.id);
  for (const box of graph.boxes) {
    if (box.config.kind !== "note" && !reachable.has(box.id)) {
      issues.push(error("unreachable", "No path reaches this box from Start. Connect it or remove it.", box.id));
    }
  }

  checkExits(graph, issues);
  checkLoops(graph, limits.maxLoopPasses, issues);
  checkEndsReachable(graph, reachable, issues);
  for (const box of graph.boxes) checkBox(box, ctx, issues, limits.longWaitDays);
  checkMessageSpacing(graph, limits.minMessageGapHours, issues);

  return finish(issues);
}

function error(code: string, message: string, boxId: string | null = null): CheckIssue {
  return { severity: "error", code, boxId, message };
}

function warning(code: string, message: string, boxId: string | null = null): CheckIssue {
  return { severity: "warning", code, boxId, message };
}

function finish(issues: CheckIssue[]): CheckResult {
  return { ok: !issues.some((issue) => issue.severity === "error"), issues };
}

function exitLabel(box: Box, exit: string): string {
  if (box.config.kind === "check") return exit === "yes" ? box.config.yesLabel : box.config.noLabel;
  return exit === "expired" ? "Expired" : "the next step";
}

function checkExits(graph: WorkflowGraph, issues: CheckIssue[]): void {
  for (const box of graph.boxes) {
    const out = outgoing(graph, box.id);
    const needed = requiredExits(box.config);
    for (const exit of needed) {
      if (!out.some((edge) => edge.exit === exit)) {
        issues.push(error("missing_exit", `Connect "${exitLabel(box, exit)}" to a next box or to an End.`, box.id));
      }
    }
    for (const exit of needed) {
      if (out.filter((edge) => edge.exit === exit).length > 1) {
        issues.push(error("double_exit", "Each exit can lead to only one box.", box.id));
      }
    }
    for (const edge of out) {
      if (!needed.includes(edge.exit)) {
        issues.push(error("extra_exit", "This box has a line it should not have.", box.id));
      }
    }
  }
}

function checkLoops(graph: WorkflowGraph, maxPasses: number, issues: CheckIssue[]): void {
  for (const edge of graph.edges.filter((item) => item.maxPasses !== undefined)) {
    const target = boxById(graph, edge.to);
    const source = boxById(graph, edge.from);
    if (!target || (target.config.kind !== "wait" && target.config.kind !== "check")) {
      issues.push(error("loop_target", "A loop can only return to a Wait or a Check.", edge.from));
    }
    if (!source || !["check", "draft", "task", "route"].includes(source.config.kind)) {
      issues.push(error("loop_source", "Loops start from a Check, a Draft, a Task or a Route.", edge.from));
    }
    if (!Number.isInteger(edge.maxPasses) || (edge.maxPasses as number) < 1) {
      issues.push(error("loop_unbounded", "A loop needs a maximum number of passes.", edge.from));
    } else if ((edge.maxPasses as number) > maxPasses) {
      issues.push(error("loop_too_long", `A loop can run at most ${maxPasses} times.`, edge.from));
    }
  }
  if (hasCycle(graph.boxes.map((box) => box.id), forwardEdges(graph))) {
    issues.push(
      error("endless_loop", "These boxes lead back to themselves with no limit. Use a counted loop with a maximum number of passes.")
    );
  }
}

function checkEndsReachable(graph: WorkflowGraph, reachable: Set<string>, issues: CheckIssue[]): void {
  if (!graph.boxes.some((box) => box.config.kind === "end")) {
    issues.push(error("no_end", "Add an End box. Every path must finish."));
    return;
  }
  // Walk backwards from every End. Anything reachable from Start that cannot
  // reach an End is on a dead path.
  const toEnd = new Set<string>(graph.boxes.filter((box) => box.config.kind === "end").map((box) => box.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const edge of graph.edges) {
      if (toEnd.has(edge.to) && !toEnd.has(edge.from)) {
        toEnd.add(edge.from);
        grew = true;
      }
    }
  }
  for (const box of graph.boxes) {
    if (box.config.kind !== "note" && reachable.has(box.id) && !toEnd.has(box.id)) {
      issues.push(error("path_without_end", "A path from this box never reaches an End.", box.id));
    }
  }
}

function checkBox(box: Box, ctx: CheckContext, issues: CheckIssue[], longWaitDays: number): void {
  const err = (code: string, message: string) => issues.push(error(code, message, box.id));
  const warn = (code: string, message: string) => issues.push(warning(code, message, box.id));
  const c = box.config;
  switch (c.kind) {
    case "start":
      if (c.trigger === "stage_changed" && (!c.stage || !ctx.stages.has(c.stage))) {
        err("missing_stage", "Pick a stage that exists in your pipeline.");
      }
      if (c.trigger === "no_activity" && !(Number.isInteger(c.days) && (c.days as number) >= 1 && (c.days as number) <= 365)) {
        err("bad_days", "Enter a number of days between 1 and 365.");
      }
      if (c.trigger === "booking" && !c.bookingEvent) err("missing_booking_event", "Pick which booking event starts this workflow.");
      if (c.trigger === "tier_changed" && !c.tier) err("missing_tier", "Pick the tier that starts this workflow.");
      return;
    case "wait":
      if (!(Number.isFinite(c.amount) && c.amount >= 1)) err("bad_wait", "Wait at least 1 hour or 1 day.");
      if (c.atTime !== undefined && !HH_MM.test(c.atTime)) err("bad_time", "Enter a time like 09:00.");
      if (Number.isFinite(c.amount) && waitHours(c) > longWaitDays * 24) warn("long_wait", `This wait is longer than ${longWaitDays} days.`);
      return;
    case "check":
      if (!c.yesLabel.trim() || !c.noLabel.trim()) err("missing_label", "Name both exits in plain words.");
      if (c.check === "stage_is" && (!c.value || !ctx.stages.has(c.value))) err("missing_stage", "Pick a stage that exists in your pipeline.");
      if (c.check === "tier_at_least" && !["cold", "warm", "hot"].includes(c.value ?? "")) err("missing_tier", "Pick a tier.");
      if (c.check === "booking_state" && !["in_place", "completed", "missed"].includes(c.value ?? "")) {
        err("missing_booking_state", "Pick a booking state.");
      }
      if (c.check === "field_is" && !c.value?.includes("=")) err("missing_field", "Pick a field and the value to match.");
      return;
    case "draft":
      if (!c.channel) err("missing_channel", "Choose text or email.");
      else if (!ctx.channels.has(c.channel)) {
        err(
          "channel_unavailable",
          c.channel === "text" ? "Text is not available yet: the number is not registered." : "Email is not available: no sender is connected."
        );
      } else if (ctx.unhealthyChannels?.has(c.channel)) {
        warn("connection_unhealthy", "This channel's connection needs attention. Drafts will wait until it is healthy.");
      }
      if (!c.contentRef) err("missing_content", "Choose a snippet or talk track for this message.");
      else if (!(c.contentKind === "snippet" ? ctx.snippetIds : ctx.talkTrackIds).has(c.contentRef)) {
        err("content_deleted", "The snippet or talk track chosen here no longer exists.");
      }
      if (!(Number.isFinite(c.windowHours) && c.windowHours >= 1 && c.windowHours <= 168)) {
        err("bad_window", "Set how long the draft can wait for approval, from 1 hour to 7 days.");
      }
      if (c.contentKind === "snippet") warn("no_talk_track", "This draft uses a snippet, not a talk track.");
      warn("quiet_hours", QUIET_HOURS_NOTE);
      return;
    case "task":
      if (!c.text.trim()) err("missing_text", "Say in plain words what the task is.");
      if (!(Number.isFinite(c.dueHours) && c.dueHours >= 1)) err("bad_due", "Set when the task is due.");
      if (c.assignee.kind === "person" && !ctx.memberIds.has(c.assignee.memberId)) err("assignee_gone", "The person chosen here is no longer on the team.");
      if (c.assignee.kind === "role" && !ctx.roles.has(c.assignee.role)) err("role_gone", "The role chosen here does not exist.");
      return;
    case "route":
      if (!ctx.routingAvailable) err("no_routing", "No routing rule is available. Set one up under routing first.");
      return;
    case "note":
      if (!c.text.trim()) err("empty_note", "A note needs some text.");
      return;
    case "end":
      return;
  }
}

/**
 * Two messages may never go back to back, and the shortest wait between one
 * message and the next one the same lead could get must meet the frequency floor.
 */
function checkMessageSpacing(graph: WorkflowGraph, minGapHours: number, issues: CheckIssue[]): void {
  const found = new Map<string, CheckIssue>();
  for (const origin of graph.boxes.filter((box) => box.config.kind === "draft")) {
    const best = new Map<string, number>();
    const queue: Array<{ id: string; hours: number; passedWait: boolean }> = [];
    // The expired exit sends nothing, so it starts no gap.
    for (const edge of outgoing(graph, origin.id)) {
      if (edge.exit !== "expired") queue.push({ id: edge.to, hours: 0, passedWait: false });
    }
    let guard = 0;
    while (queue.length > 0 && guard++ < 10000) {
      const current = queue.shift() as { id: string; hours: number; passedWait: boolean };
      const box = boxById(graph, current.id);
      if (!box) continue;
      if (box.config.kind === "draft") {
        if (!current.passedWait) {
          found.set(`b:${box.id}`, error("back_to_back", "Two messages in a row. Add a Wait between them.", box.id));
        } else if (current.hours < minGapHours) {
          found.set(
            `f:${box.id}`,
            error("too_frequent", `A lead could get two messages less than ${minGapHours} hours apart. Lengthen the wait before this one.`, box.id)
          );
        }
        continue;
      }
      const hours = current.hours + (box.config.kind === "wait" ? waitHours(box.config) : 0);
      const passedWait = current.passedWait || box.config.kind === "wait";
      const key = `${box.id}:${passedWait ? 1 : 0}`;
      if ((best.get(key) ?? Infinity) <= hours) continue;
      best.set(key, hours);
      for (const edge of outgoing(graph, box.id)) queue.push({ id: edge.to, hours, passedWait });
    }
  }
  issues.push(...found.values());
}
