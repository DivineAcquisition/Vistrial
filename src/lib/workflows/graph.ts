import type { Box, Edge, Graph, PlaybookDocument, Port } from "@/lib/workflows/types";

export function boxById(graph: Graph, id: string): Box | null {
  return graph.boxes.find((box) => box.id === id) ?? null;
}

export function edgesFrom(graph: Graph, id: string, port?: Port): Edge[] {
  return graph.edges.filter((edge) => edge.source === id && (port === undefined || edge.port === port));
}

export function edgesInto(graph: Graph, id: string): Edge[] {
  return graph.edges.filter((edge) => edge.target === id);
}

export function startBox(graph: Graph): Box | null {
  return graph.boxes.find((box) => box.type === "start") ?? null;
}

/** Stable comparison of connections, ignoring position and title edits. */
export function connectionKey(graph: Graph): string {
  const edges = [...graph.edges]
    .map((edge) => `${edge.source}|${edge.port}|${edge.target}|${edge.maxPasses ?? ""}`)
    .sort();
  const ids = graph.boxes.map((box) => box.id).sort();
  return `${ids.join(",")}\n${edges.join("\n")}`;
}

export function documentKey(doc: PlaybookDocument): string {
  const snippets = [...doc.snippets].map((snippet) => snippet.key).sort();
  return `${connectionKey(doc.graph)}\n${snippets.join(",")}`;
}

const COLUMN = 280;
const ROW = 150;

/**
 * Left to right layers. Loop edges do not add a column. The person can drag
 * after this; Fit and Tidy call it again.
 */
export function tidy(graph: Graph, direction: "horizontal" | "vertical" = "horizontal"): Graph {
  const start = startBox(graph);
  if (!start) return graph;
  const depth = new Map<string, number>();
  depth.set(start.id, 0);
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    const nextDepth = (depth.get(id) ?? 0) + 1;
    for (const edge of edgesFrom(graph, id)) {
      if (edge.port === "loop") continue;
      const seen = depth.get(edge.target);
      if (seen === undefined || nextDepth > seen) {
        depth.set(edge.target, Math.min(nextDepth, 40));
        queue.push(edge.target);
      }
    }
  }
  for (const box of graph.boxes) {
    if (!depth.has(box.id)) depth.set(box.id, 0);
  }
  const columns = new Map<number, string[]>();
  for (const [id, column] of depth) {
    const list = columns.get(column) ?? [];
    list.push(id);
    columns.set(column, list);
  }
  const position = new Map<string, { x: number; y: number }>();
  for (const [column, ids] of columns) {
    ids.sort();
    ids.forEach((id, row) => {
      position.set(
        id,
        direction === "horizontal" ? { x: column * COLUMN, y: row * ROW } : { x: row * COLUMN, y: column * ROW },
      );
    });
  }
  return {
    boxes: graph.boxes.map((box) => ({ ...box, position: position.get(box.id) ?? box.position })),
    edges: graph.edges,
  };
}

export type OutlineBranch = { label: string; port: Port; boxId: string; children: OutlineNode[] };
export type OutlineNode = { box: Box; branches: OutlineBranch[] };

/** The list view. The same boxes and branches as the picture, in entry order. */
export function toOutline(graph: Graph): OutlineNode | null {
  const start = startBox(graph);
  if (!start) return null;
  return walkOnce(graph, start.id, new Set());
}

function walkOnce(graph: Graph, id: string, stack: Set<string>): OutlineNode | null {
  if (stack.has(id)) return null;
  const box = boxById(graph, id);
  if (!box || box.type === "note") return null;
  const next = new Set(stack);
  next.add(id);
  const branches: OutlineBranch[] = edgesFrom(graph, id)
    .filter((edge) => edge.port !== "loop")
    .map((edge) => {
      const child = walkOnce(graph, edge.target, next);
      return { label: edge.label, port: edge.port, boxId: edge.target, children: child ? [child] : [] };
    });
  const loops = edgesFrom(graph, id).filter((edge) => edge.port === "loop");
  for (const edge of loops) {
    branches.push({
      label: edge.maxPasses ? `${edge.label} (up to ${edge.maxPasses})` : edge.label,
      port: edge.port,
      boxId: edge.target,
      children: [],
    });
  }
  return { box, branches };
}

export function outlineText(node: OutlineNode | null, depth = 0): string[] {
  if (!node) return [];
  const pad = "  ".repeat(depth);
  const lines = [`${pad}${node.box.title}. ${node.box.summary}`];
  for (const branch of node.branches) {
    lines.push(`${pad}  ${branch.label}`);
    for (const child of branch.children) lines.push(...outlineText(child, depth + 2));
    if (branch.port === "loop") lines.push(`${pad}    returns to ${branch.boxId}`);
  }
  return lines;
}

export function updateBox(graph: Graph, boxId: string, patch: Partial<Pick<Box, "title" | "summary" | "config" | "origin" | "fact">>): Graph {
  return {
    boxes: graph.boxes.map((box) => (box.id === boxId ? { ...box, ...patch, config: patch.config ?? box.config } : box)),
    edges: graph.edges,
  };
}

export function moveBox(graph: Graph, boxId: string, direction: "up" | "down"): { graph: Graph; error: string | null } {
  const box = boxById(graph, boxId);
  if (!box) return { graph, error: "That step is not on this workflow." };
  if (box.type === "start") return { graph, error: "The start stays first." };
  if (box.type === "note") return { graph, error: "A note is a label. Move it on the picture." };
  const incoming = edgesInto(graph, boxId).filter((edge) => edge.port !== "loop");
  const outgoing = edgesFrom(graph, boxId).filter((edge) => edge.port !== "loop");
  if (incoming.length !== 1 || outgoing.length !== 1) {
    return { graph, error: "This step has more than one branch. Move it on the picture." };
  }
  if (direction === "down") {
    const nextId = outgoing[0].target;
    const next = boxById(graph, nextId);
    if (!next || next.type === "end") return { graph, error: "There is no later step in this branch." };
    const nextOut = edgesFrom(graph, nextId).filter((edge) => edge.port !== "loop");
    const nextIn = edgesInto(graph, nextId).filter((edge) => edge.port !== "loop");
    if (nextOut.length !== 1 || nextIn.length !== 1) return { graph, error: "The next step has more than one branch." };
    return { graph: swapChain(graph, incoming[0], outgoing[0], nextOut[0]), error: null };
  }
  const previous = incoming[0];
  const prevBox = boxById(graph, previous.source);
  if (!prevBox || prevBox.type === "start") return { graph, error: "This step is already first in the branch." };
  const prevIn = edgesInto(graph, prevBox.id).filter((edge) => edge.port !== "loop");
  if (prevIn.length !== 1) return { graph, error: "The earlier step has more than one branch." };
  return { graph: swapChain(graph, prevIn[0], previous, outgoing[0]), error: null };
}

/** P -> A -> B -> R becomes P -> B -> A -> R. */
function swapChain(graph: Graph, intoA: Edge, aToB: Edge, bOut: Edge): Graph {
  const edges = graph.edges.map((edge) => {
    if (edge.id === intoA.id) return { ...edge, target: aToB.target };
    if (edge.id === aToB.id) return { ...edge, source: aToB.target, target: aToB.source };
    if (edge.id === bOut.id) return { ...edge, source: aToB.source };
    return edge;
  });
  return { boxes: graph.boxes, edges };
}

export type GraphDiff = { added: string[]; removed: string[]; changed: string[] };

export function diffGraphs(before: Graph, after: Graph): GraphDiff {
  const old = new Map(before.boxes.map((box) => [box.id, box]));
  const next = new Map(after.boxes.map((box) => [box.id, box]));
  const added = [...next.keys()].filter((id) => !old.has(id));
  const removed = [...old.keys()].filter((id) => !next.has(id));
  const changed = [...next.keys()].filter((id) => {
    const left = old.get(id);
    const right = next.get(id);
    if (!left || !right) return false;
    return JSON.stringify({ ...left, position: undefined }) !== JSON.stringify({ ...right, position: undefined });
  });
  return { added, removed, changed };
}

export function stepPlace(graph: Graph, boxId: string): { index: number; total: number } {
  const order: string[] = [];
  const start = startBox(graph);
  if (!start) return { index: 1, total: 1 };
  const seen = new Set<string>();
  const queue = [start.id];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const box = boxById(graph, id);
    if (box && box.type !== "note") order.push(id);
    for (const edge of edgesFrom(graph, id)) {
      if (edge.port !== "loop") queue.push(edge.target);
    }
  }
  const index = Math.max(1, order.indexOf(boxId) + 1);
  return { index, total: Math.max(1, order.length) };
}

export function previewLine(box: Box, leadName = "the lead"): string {
  const config = box.config;
  if (config.type === "draft") {
    const channel = config.channel === "sms" ? "text" : "email";
    const hour = formatHour(config.windowHour);
    return `Relay will draft a ${channel} for ${leadName}. You will approve it before it sends. The draft is due at ${hour} in the lead's time.`;
  }
  if (config.type === "wait") {
    const hours = config.hours;
    const span = hours % 24 === 0 ? `${hours / 24} day${hours === 24 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"}`;
    const clock = config.untilHour === null ? "" : ` It waits until ${formatHour(config.untilHour)} in the lead's time.`;
    return `This step waits ${span}.${clock}`;
  }
  if (config.type === "task") return `A task is created: ${config.title}`;
  if (config.type === "route" && config.mode === "reassign") {
    return "If this lead already has an owner, the Owner gets a task to confirm. Nothing is reassigned quietly.";
  }
  if (config.type === "route") return "If this lead has no owner, the usual routing rules assign them.";
  if (config.type === "end") return `This lead leaves the workflow: ${endLabel(config.reason)}.`;
  if (config.type === "check") return `Yes means ${config.yesLabel}. No means ${config.noLabel}.`;
  if (config.type === "start") return "Only leads who arrive after you publish, and after go-live, enter here.";
  return box.summary;
}

export function endLabel(reason: string): string {
  switch (reason) {
    case "won":
      return "Won";
    case "lost":
      return "Lost";
    case "booked":
      return "Booked and handed on";
    case "replied":
      return "Replied and handed to a person";
    default:
      return "Stopped";
  }
}

export function formatHour(hour: number): string {
  const safe = ((hour % 24) + 24) % 24;
  const suffix = safe >= 12 ? "PM" : "AM";
  const twelve = safe % 12 === 0 ? 12 : safe % 12;
  return `${twelve}:00 ${suffix}`;
}

export function entryKey(box: Box): string {
  if (box.config.type !== "start") return "none";
  const entry = box.config.entry;
  if (entry.kind === "stage") return `stage:${entry.stage}`;
  if (entry.kind === "quiet_days") return `quiet:${entry.days}`;
  if (entry.kind === "booking") return `booking:${entry.event}`;
  if (entry.kind === "tier") return `tier:${entry.tier}`;
  return entry.kind;
}
