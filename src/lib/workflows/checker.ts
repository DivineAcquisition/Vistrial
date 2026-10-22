import { edgesFrom, entryKey, startBox } from "@/lib/workflows/graph";
import { LIMITS, type Box, type Edge, type Graph, type PlaybookDocument } from "@/lib/workflows/types";

export type CheckIssue = { boxId: string | null; message: string };

export type CheckContext = {
  snippetKeys: string[];
  stages: string[];
  people: string[];
  textAllowed: boolean;
  emailAllowed: boolean;
  /** Other published workflows, so a shared entry can be named. */
  published: Array<{ id: string; name: string; entryKey: string; priority: number }>;
  priority: number;
};

export const EMPTY_CONTEXT: CheckContext = {
  snippetKeys: [],
  stages: [],
  people: [],
  textAllowed: true,
  emailAllowed: true,
  published: [],
  priority: 100,
};

export type CheckResult = { ok: boolean; errors: CheckIssue[]; warnings: CheckIssue[] };

export function checkDocument(doc: PlaybookDocument, context: CheckContext = EMPTY_CONTEXT): CheckResult {
  const withSnippets: CheckContext = {
    ...context,
    snippetKeys: [...new Set([...context.snippetKeys, ...doc.snippets.map((snippet) => snippet.key)])],
  };
  return checkGraph(doc.graph, withSnippets);
}

export function checkGraph(graph: Graph, context: CheckContext = EMPTY_CONTEXT): CheckResult {
  const errors: CheckIssue[] = [];
  const warnings: CheckIssue[] = [];
  const starts = graph.boxes.filter((box) => box.type === "start");
  if (starts.length !== 1) errors.push({ boxId: starts[0]?.id ?? null, message: "A workflow needs exactly one start." });
  if (graph.boxes.length > LIMITS.boxes) {
    errors.push({ boxId: null, message: `This workflow has ${graph.boxes.length} steps. The limit is ${LIMITS.boxes}.` });
  }

  const ids = new Set(graph.boxes.map((box) => box.id));
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      errors.push({ boxId: edge.source, message: "A line points at a step that is not on this workflow." });
    }
    if (edge.port === "loop") {
      if (!edge.maxPasses || edge.maxPasses < 1 || edge.maxPasses > LIMITS.loopPasses) {
        errors.push({ boxId: edge.source, message: `A loop needs a maximum from 1 to ${LIMITS.loopPasses}.` });
      }
      const target = graph.boxes.find((box) => box.id === edge.target);
      if (target && target.type !== "wait" && target.type !== "check") {
        errors.push({ boxId: edge.source, message: "A loop can return only to a wait or a check." });
      }
    }
  }

  for (const box of graph.boxes) {
    errors.push(...boxErrors(box, graph, context));
    warnings.push(...boxWarnings(box, context));
  }

  if (starts.length === 1) {
    errors.push(...pathErrors(graph, starts[0]));
    const key = entryKey(starts[0]);
    const clash = context.published.find((item) => item.entryKey === key);
    if (clash) {
      const winner = context.priority < clash.priority ? "This workflow" : clash.name;
      warnings.push({
        boxId: starts[0].id,
        message: `${clash.name} starts on the same entry. ${winner} has the higher priority, and the other waits.`,
      });
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function boxErrors(box: Box, graph: Graph, context: CheckContext): CheckIssue[] {
  const issues: CheckIssue[] = [];
  if (box.config.type !== box.type) {
    issues.push({ boxId: box.id, message: "This step's settings do not match its type." });
    return issues;
  }
  if ("quietHours" in box.config) {
    issues.push({ boxId: box.id, message: "Quiet hours are not a setting. They stay locked." });
  }
  const config = box.config;
  if (config.type === "check") {
    const yes = edgesFrom(graph, box.id, "yes");
    const no = edgesFrom(graph, box.id, "no");
    if (yes.length !== 1 || no.length !== 1) {
      issues.push({ boxId: box.id, message: "A check needs both exits connected." });
    }
    if (!config.yesLabel.trim() || !config.noLabel.trim()) {
      issues.push({ boxId: box.id, message: "Name both exits in plain words." });
    }
  }
  if (config.type === "draft") {
    if (config.channel !== "sms" && config.channel !== "email") {
      issues.push({ boxId: box.id, message: "Pick text or email." });
    }
    if (!config.snippetKey || !context.snippetKeys.includes(config.snippetKey)) {
      issues.push({ boxId: box.id, message: "Pick a snippet or talk track that still exists." });
    }
    if (config.windowHour < 0 || config.windowHour > 23) {
      issues.push({ boxId: box.id, message: "Pick a time of day for this draft." });
    }
    if (config.channel === "sms" && !context.textAllowed) {
      issues.push({ boxId: box.id, message: "Text is not available until this workspace is registered and the lead has consented." });
    }
    if (config.channel === "email" && !context.emailAllowed) {
      issues.push({ boxId: box.id, message: "Email needs a connected sender." });
    }
    if (config.expiry === "exit" && edgesFrom(graph, box.id, "expired").length !== 1) {
      issues.push({ boxId: box.id, message: "This draft needs an Expired exit, or it should stop when it expires." });
    }
    if (edgesFrom(graph, box.id, "next").length !== 1 && config.expiry !== "stop") {
      issues.push({ boxId: box.id, message: "Connect what happens after this draft is approved." });
    }
  }
  if (config.type === "task") {
    if (!config.title.trim()) issues.push({ boxId: box.id, message: "Name the task in plain words." });
    if (config.assignee === "person" && (!config.personId || !context.people.includes(config.personId))) {
      issues.push({ boxId: box.id, message: "Pick a person who is still on this workspace." });
    }
    if (config.assignee === "role" && config.role !== "owner" && config.role !== "operator") {
      issues.push({ boxId: box.id, message: "Pick a role for this task." });
    }
  }
  if (config.type === "route" && config.mode !== "assign_unowned" && config.mode !== "reassign") {
    issues.push({ boxId: box.id, message: "Pick a routing rule that is available." });
  }
  if (config.type === "wait" && (config.hours < 1 || config.hours > 24 * 90)) {
    issues.push({ boxId: box.id, message: "A wait is between 1 hour and 90 days." });
  }
  if (config.type === "start" && config.entry.kind === "stage" && context.stages.length && !context.stages.includes(config.entry.stage)) {
    issues.push({ boxId: box.id, message: "That stage is no longer on this workspace." });
  }
  if (config.type === "start" && config.entry.kind === "quiet_days" && (config.entry.days < 1 || config.entry.days > 180)) {
    issues.push({ boxId: box.id, message: "Quiet days are between 1 and 180." });
  }
  return issues;
}

function boxWarnings(box: Box, context: CheckContext): CheckIssue[] {
  const warnings: CheckIssue[] = [];
  if (box.config.type === "draft" && box.config.channel === "sms" && !context.textAllowed) {
    warnings.push({ boxId: box.id, message: "Text sending is not healthy for this workspace right now." });
  }
  if (box.config.type === "wait" && box.config.hours >= 24 * 14) {
    warnings.push({ boxId: box.id, message: "This wait is longer than two weeks." });
  }
  if (box.config.type === "draft" && !box.config.snippetKey) {
    warnings.push({ boxId: box.id, message: "This draft has no matching talk track." });
  }
  return warnings;
}

function pathErrors(graph: Graph, start: Box): CheckIssue[] {
  const errors: CheckIssue[] = [];
  const stack = new Set<string>();
  const visit = (id: string, draftsInDay: number, hoursSinceDraft: number) => {
    if (stack.has(id)) {
      errors.push({ boxId: id, message: "This path loops without a maximum. Add a counted loop or an end." });
      return;
    }
    const box = graph.boxes.find((item) => item.id === id);
    if (!box) return;
    if (box.type === "end" || box.type === "note") return;
    if (box.type === "draft" && box.config.type === "draft" && box.config.expiry === "stop" && edgesFrom(graph, id).every((edge) => edge.port === "loop")) {
      return;
    }
    stack.add(id);
    const outs = edgesFrom(graph, id);
    const forward = outs.filter((edge) => edge.port !== "loop");
    if (forward.length === 0) {
      errors.push({ boxId: id, message: "This path does not reach an end." });
    }
    let nextDrafts = draftsInDay;
    let nextHours = hoursSinceDraft;
    if (box.type === "wait") {
      nextHours += box.config.type === "wait" ? box.config.hours : 0;
      if (nextHours >= 24) {
        nextDrafts = 0;
        nextHours = nextHours % 24;
      }
    }
    if (box.type === "draft") {
      nextDrafts += 1;
      if (nextDrafts > 2) {
        errors.push({ boxId: id, message: "This path would send more messages in a day than the limit of 2." });
      }
      const previous = hoursSinceDraft;
      if (previous < LIMITS.minHoursBetweenDrafts && draftsInDay > 0) {
        errors.push({ boxId: id, message: "Two messages on this path are too close. Add a wait of at least a day between them." });
      }
      nextHours = 0;
    }
    for (const edge of forward) visit(edge.target, nextDrafts, nextHours);
    stack.delete(id);
  };
  visit(start.id, 0, LIMITS.minHoursBetweenDrafts);

  const seen = new Set<string>();
  const reachable = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const edge of edgesFrom(graph, id)) {
      if (edge.port === "loop") {
        const target = graph.boxes.find((box) => box.id === edge.target);
        if (!edge.maxPasses) errors.push({ boxId: id, message: "This loop has no maximum." });
        if (target && seen.has(edge.target) && target.type !== "wait" && target.type !== "check") {
          errors.push({ boxId: id, message: "This path loops without a maximum." });
        }
        continue;
      }
      reachable(edge.target);
    }
  };
  reachable(start.id);
  for (const box of graph.boxes) {
    if (box.type === "note" || box.type === "start") continue;
    if (!seen.has(box.id) && box.type !== "end") {
      const incoming = graph.edges.some((edge) => edge.target === box.id);
      if (!incoming) errors.push({ boxId: box.id, message: "This step is not connected from the start." });
    }
  }
  return dedupe(errors);
}

function dedupe(issues: CheckIssue[]): CheckIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.boxId}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One repair. If the graph is still invalid, the caller discards it. */
export function repairOnce(graph: Graph): Graph | null {
  const start = startBox(graph);
  if (!start) return null;
  const boxes = graph.boxes.filter((box) => box.config.type === box.type);
  let edges = graph.edges.filter((edge) => boxes.some((box) => box.id === edge.source) && boxes.some((box) => box.id === edge.target));
  const endId = boxes.find((box) => box.type === "end")?.id ?? "end_repair";
  const withEnd: Box[] = boxes.some((box) => box.type === "end")
    ? boxes
    : [
        ...boxes,
        {
          id: endId,
          type: "end",
          title: "Stopped",
          summary: "The lead leaves this workflow.",
          origin: "template",
          fact: null,
          position: { x: 0, y: 0 },
          config: { type: "end", reason: "stopped", handoffKey: null },
        },
      ];
  const dangling = withEnd.filter((box) => box.type !== "end" && box.type !== "note" && !edges.some((edge) => edge.source === box.id && edge.port === "next" || (box.type === "check" && edge.source === box.id)));
  for (const box of withEnd) {
    if (box.type === "end" || box.type === "note") continue;
    const outs = edges.filter((edge) => edge.source === box.id);
    if (outs.length === 0) {
      edges = [...edges, { id: `repair_${box.id}`, source: box.id, target: endId, label: "Next", port: "next", maxPasses: null }];
    }
  }
  edges = separateDrafts(withEnd, edges);
  void dangling;
  return { boxes: withEnd, edges };
}

function separateDrafts(boxes: Box[], edges: Edge[]): Edge[] {
  let next = [...edges];
  let guard = 0;
  while (guard < 20) {
    guard += 1;
    const pair = next.find((edge) => {
      const source = boxes.find((box) => box.id === edge.source);
      const target = boxes.find((box) => box.id === edge.target);
      return source?.type === "draft" && target?.type === "draft" && edge.port === "next";
    });
    if (!pair) break;
    const waitId = `wait_${pair.id}`;
    boxes.push({
      id: waitId,
      type: "wait",
      title: "Wait 1 day",
      summary: "A day between messages.",
      origin: "template",
      fact: null,
      position: { x: 0, y: 0 },
      config: { type: "wait", hours: 24, untilHour: 9 },
    });
    next = next.filter((edge) => edge.id !== pair.id);
    next.push(
      { id: `${pair.id}_a`, source: pair.source, target: waitId, label: pair.label, port: "next", maxPasses: null },
      { id: `${pair.id}_b`, source: waitId, target: pair.target, label: "Next", port: "next", maxPasses: null },
    );
  }
  return next;
}
