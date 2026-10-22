import { incoming, outgoing } from "@/lib/workflows/graph";
import type { Box, BoxConfig, WorkflowGraph } from "@/lib/workflows/types";

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
