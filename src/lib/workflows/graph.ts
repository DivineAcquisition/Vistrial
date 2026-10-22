import type { Box, BoxConfig, Edge, EdgeExit, WorkflowGraph } from "@/lib/workflows/types";

export function waitHours(config: Extract<BoxConfig, { kind: "wait" }>): number {
  return config.unit === "days" ? config.amount * 24 : config.amount;
}

export function boxById(graph: WorkflowGraph, id: string): Box | undefined {
  return graph.boxes.find((box) => box.id === id);
}

export function outgoing(graph: WorkflowGraph, id: string): Edge[] {
  return graph.edges.filter((edge) => edge.from === id);
}

export function incoming(graph: WorkflowGraph, id: string): Edge[] {
  return graph.edges.filter((edge) => edge.to === id);
}

/** The exits a box kind must have connected. Note and end have none. */
export function requiredExits(config: BoxConfig): EdgeExit[] {
  switch (config.kind) {
    case "check":
      return ["yes", "no"];
    case "draft":
      return ["next", "expired"];
    case "start":
    case "wait":
    case "task":
    case "route":
      return ["next"];
    default:
      return [];
  }
}

/** Boxes reachable from the start, following every edge. Notes are never on a path. */
export function reachableFrom(graph: WorkflowGraph, startId: string): Set<string> {
  const seen = new Set<string>([startId]);
  const stack = [startId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const edge of outgoing(graph, current)) {
      if (!seen.has(edge.to)) {
        seen.add(edge.to);
        stack.push(edge.to);
      }
    }
  }
  return seen;
}

/** Edges that are not counted loop lines. These must form a graph with no cycle. */
export function forwardEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.filter((edge) => edge.maxPasses === undefined);
}

export function hasCycle(boxIds: string[], edges: Edge[]): boolean {
  const adjacency = new Map<string, string[]>();
  for (const id of boxIds) adjacency.set(id, []);
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);
  const state = new Map<string, 1 | 2>();
  const visit = (id: string): boolean => {
    state.set(id, 1);
    for (const next of adjacency.get(id) ?? []) {
      const seen = state.get(next);
      if (seen === 1) return true;
      if (!seen && visit(next)) return true;
    }
    state.set(id, 2);
    return false;
  };
  return boxIds.some((id) => !state.has(id) && visit(id));
}
