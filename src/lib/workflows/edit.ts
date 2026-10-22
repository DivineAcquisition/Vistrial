import { forwardEdges, hasCycle, incoming, outgoing, requiredExits } from "@/lib/workflows/graph";
import type { Box, BoxConfig, BoxKind, EdgeExit, WorkflowGraph } from "@/lib/workflows/types";

/** Box kinds a person can add. Start exists once and is never added by hand. */
export const ADDABLE_KINDS = ["wait", "check", "draft", "task", "route", "end", "note"] as const satisfies readonly BoxKind[];
export type AddableKind = (typeof ADDABLE_KINDS)[number];

/** The settings a new box starts with. Plain and safe: a draft has no content until one is chosen. */
export function defaultConfig(kind: AddableKind): BoxConfig {
  switch (kind) {
    case "wait":
      return { kind, amount: 1, unit: "days" };
    case "check":
      return { kind, check: "replied_since", yesLabel: "Replied", noLabel: "No reply" };
    case "draft":
      return { kind, channel: "text", contentKind: "talk_track", contentRef: null, windowHours: 24 };
    case "task":
      return { kind, text: "", dueHours: 4, assignee: { kind: "lead_owner" }, alert: false };
    case "route":
      return { kind, mode: "assign_unowned" };
    case "end":
      return { kind, reason: "stopped" };
    case "note":
      return { kind, text: "A note for the team." };
  }
}

/** Plain words for each exit a box has, in the order the diagram shows them. */
export function exitsOf(config: BoxConfig): Array<{ exit: EdgeExit; label: string }> {
  return requiredExits(config).map((exit) => ({
    exit,
    label:
      config.kind === "check"
        ? exit === "yes"
          ? config.yesLabel || "Yes"
          : config.noLabel || "No"
        : exit === "expired"
          ? "Expired"
          : config.kind === "draft"
            ? "Approved"
            : "Next",
  }));
}

/** Add a box of a kind on an exit. Notes stand on their own and join nothing. */
export function addBox(graph: WorkflowGraph, kind: AddableKind, after?: { fromId: string; exit: EdgeExit }): { graph: WorkflowGraph; id: string } {
  const box: Box = { id: newId("b"), config: defaultConfig(kind) };
  if (kind === "note" || !after) return { graph: { ...graph, boxes: [...graph.boxes, box] }, id: box.id };
  return { graph: insertAfter(graph, after.fromId, after.exit, box), id: box.id };
}

/**
 * Point an exit at a box. A line that would lead back to an earlier box becomes
 * a counted loop that runs once, which the person can raise up to the limit.
 */
export function connectExit(graph: WorkflowGraph, fromId: string, exit: EdgeExit, toId: string): WorkflowGraph {
  if (fromId === toId) return graph;
  const kept = graph.edges.filter((edge) => !(edge.from === fromId && edge.exit === exit));
  const candidate = { id: newId("e"), from: fromId, to: toId, exit };
  const loops = hasCycle(
    graph.boxes.map((box) => box.id),
    forwardEdges({ ...graph, edges: [...kept, candidate] })
  );
  return { ...graph, edges: [...kept, loops ? { ...candidate, maxPasses: 1 } : candidate] };
}

export function removeEdge(graph: WorkflowGraph, edgeId: string): WorkflowGraph {
  return { ...graph, edges: graph.edges.filter((edge) => edge.id !== edgeId) };
}

export function setLoopPasses(graph: WorkflowGraph, edgeId: string, maxPasses: number): WorkflowGraph {
  return { ...graph, edges: graph.edges.map((edge) => (edge.id === edgeId && edge.maxPasses !== undefined ? { ...edge, maxPasses } : edge)) };
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}

export function updateBox(graph: WorkflowGraph, id: string, config: BoxConfig): WorkflowGraph {
  return { ...graph, boxes: graph.boxes.map((box) => (box.id === id && box.config.kind === config.kind ? { ...box, config } : box)) };
}

/**
 * Put a new box on an exit. Whatever the exit led to now follows the new box,
 * so adding a step in the middle never leaves a gap.
 */
export function insertAfter(graph: WorkflowGraph, fromId: string, exit: "next" | "yes" | "no" | "expired", box: Box): WorkflowGraph {
  const existing = outgoing(graph, fromId).find((edge) => edge.exit === exit);
  const edges = graph.edges.filter((edge) => edge !== existing);
  edges.push({ id: newId("e"), from: fromId, to: box.id, exit });
  if (existing) {
    const continues = box.config.kind === "check" ? "yes" : box.config.kind === "end" || box.config.kind === "note" ? null : "next";
    if (continues) edges.push({ id: newId("e"), from: box.id, to: existing.to, exit: continues });
  }
  return { boxes: [...graph.boxes, box], edges };
}

/** Remove a box. A single-exit box is bypassed so its neighbours stay joined. */
export function removeBox(graph: WorkflowGraph, id: string): WorkflowGraph {
  const box = graph.boxes.find((item) => item.id === id);
  if (!box || box.config.kind === "start") return graph;
  const out = outgoing(graph, id);
  const forward = out.length === 1 ? out[0] : null;
  const edges = graph.edges.filter((edge) => edge.from !== id && edge.to !== id);
  if (forward) {
    for (const edge of incoming(graph, id)) {
      edges.push({ ...edge, id: newId("e"), to: forward.to });
    }
  }
  return { boxes: graph.boxes.filter((item) => item.id !== id), edges };
}

const MOVABLE = new Set(["wait", "task", "route"]);

/** Swap a box with its neighbour on the same single-line stretch. */
export function moveWithinBranch(graph: WorkflowGraph, id: string, direction: "up" | "down"): WorkflowGraph {
  const kindOf = (boxId: string) => graph.boxes.find((item) => item.id === boxId)?.config.kind ?? "";
  const single = (boxId: string) => outgoing(graph, boxId).length === 1 && outgoing(graph, boxId)[0].exit === "next";
  const swap = (firstId: string, secondId: string): WorkflowGraph => {
    // first -> second -> after   becomes   first's parents -> second -> first -> after
    const parents = incoming(graph, firstId);
    const after = outgoing(graph, secondId)[0];
    const edges = graph.edges.filter((edge) => edge.to !== firstId && edge.from !== firstId && edge.from !== secondId);
    for (const parent of parents) edges.push({ ...parent, to: secondId });
    edges.push({ id: newId("e"), from: secondId, to: firstId, exit: "next" });
    edges.push({ id: newId("e"), from: firstId, to: after.to, exit: after.exit });
    return { ...graph, edges };
  };

  if (!MOVABLE.has(kindOf(id)) || !single(id)) return graph;
  if (direction === "down") {
    const nextId = outgoing(graph, id)[0].to;
    if (!MOVABLE.has(kindOf(nextId)) || !single(nextId) || incoming(graph, nextId).length !== 1 || incoming(graph, id).length < 1) return graph;
    return swap(id, nextId);
  }
  const parents = incoming(graph, id);
  if (parents.length !== 1) return graph;
  const previous = parents[0].from;
  if (!MOVABLE.has(kindOf(previous)) || !single(previous) || incoming(graph, previous).length < 1) return graph;
  return swap(previous, id);
}
