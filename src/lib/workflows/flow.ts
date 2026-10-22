import { MarkerType, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";

import { boxAgent, describeBox } from "@/lib/workflows/describe";
import { exitsOf } from "@/lib/workflows/edit";
import { boxById } from "@/lib/workflows/graph";
import { autoLayout } from "@/lib/workflows/layout";
import type { Box, CheckIssue, EdgeExit, WorkflowGraph } from "@/lib/workflows/types";

export const BOX_SIZE = { width: 248, height: 128 } as const;

export type BoxNodeData = {
  box: Box;
  title: string;
  summary: string;
  agent: ReturnType<typeof boxAgent>;
  exits: Array<{ exit: EdgeExit; label: string; connected: boolean }>;
  errors: string[];
  warnings: string[];
  direction: "LR" | "TB";
  editable: boolean;
};

export type FlowEdgeData = {
  label: string | null;
  detail: string | null;
  loop: boolean;
  tone: "default" | "muted" | "warning";
};

export type Positions = Record<string, { x: number; y: number }>;

/** Where every box sits after Tidy up. The same graph always lays out the same way. */
export function tidyPositions(graph: WorkflowGraph, direction: "LR" | "TB"): Positions {
  const placed = autoLayout(graph, { direction, boxWidth: BOX_SIZE.width, boxHeight: BOX_SIZE.height, gap: 72 });
  return Object.fromEntries(placed.map((item) => [item.id, { x: item.x, y: item.y }]));
}

/** Below this zoom a box's words are too small to read, so the canvas opens on Start instead. */
export const READABLE_ZOOM = 0.72;

/**
 * Where the canvas opens: the whole workflow when it fits at a readable size,
 * otherwise Start at a readable size with the rest a pan away. The minimap and
 * Fit still show everything at once.
 */
export function homeViewport(
  nodes: Array<{ id: string; position: { x: number; y: number } }>,
  startId: string | null,
  frame: { width: number; height: number },
  direction: "LR" | "TB"
): { x: number; y: number; zoom: number } {
  if (nodes.length === 0 || frame.width === 0 || frame.height === 0) return { x: 0, y: 0, zoom: 1 };
  const pad = 48;
  const minX = Math.min(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));
  const maxX = Math.max(...nodes.map((node) => node.position.x + BOX_SIZE.width));
  const maxY = Math.max(...nodes.map((node) => node.position.y + BOX_SIZE.height));
  const width = maxX - minX;
  const height = maxY - minY;
  const fit = Math.min((frame.width - pad * 2) / width, (frame.height - pad * 2) / height, 1);
  if (fit >= READABLE_ZOOM) {
    return { zoom: fit, x: (frame.width - width * fit) / 2 - minX * fit, y: (frame.height - height * fit) / 2 - minY * fit };
  }
  const zoom = Math.min(1, Math.max(READABLE_ZOOM, fit));
  const start = nodes.find((node) => node.id === startId)?.position ?? { x: minX, y: minY };
  if (direction === "LR") {
    const y = height * zoom <= frame.height - pad * 2 ? (frame.height - height * zoom) / 2 - minY * zoom : pad - minY * zoom;
    return { zoom, x: pad - start.x * zoom, y };
  }
  const x = width * zoom <= frame.width - pad * 2 ? (frame.width - width * zoom) / 2 - minX * zoom : pad - start.x * zoom;
  return { zoom, x, y: pad - start.y * zoom };
}

function edgeLabel(graph: WorkflowGraph, from: string, exit: EdgeExit): string | null {
  const box = boxById(graph, from);
  if (!box) return null;
  if (box.config.kind === "check") return exit === "yes" ? box.config.yesLabel : box.config.noLabel;
  if (exit === "expired") return "Expired";
  return null;
}

/**
 * The canvas form of a workflow. It reads the same graph as the outline, so
 * the two cannot disagree. Boxes keep a dragged position until Tidy up.
 */
export function toFlow(
  graph: WorkflowGraph,
  options: { direction: "LR" | "TB"; issues: CheckIssue[]; positions?: Positions; editable: boolean }
): { nodes: FlowNode<BoxNodeData>[]; edges: FlowEdge<FlowEdgeData>[] } {
  const tidy = tidyPositions(graph, options.direction);
  const nodes: FlowNode<BoxNodeData>[] = graph.boxes.map((box) => {
    const { title, summary } = describeBox(box);
    const mine = options.issues.filter((issue) => issue.boxId === box.id);
    const connected = new Set(graph.edges.filter((edge) => edge.from === box.id).map((edge) => edge.exit));
    return {
      id: box.id,
      type: "box",
      position: options.positions?.[box.id] ?? tidy[box.id] ?? { x: 0, y: 0 },
      draggable: options.editable,
      connectable: options.editable && box.config.kind !== "note",
      deletable: options.editable && box.config.kind !== "start",
      ariaLabel: `${title}. ${summary}`,
      data: {
        box,
        title,
        summary,
        agent: boxAgent(box.config),
        exits: exitsOf(box.config).map((item) => ({ ...item, connected: connected.has(item.exit) })),
        errors: [...new Set(mine.filter((issue) => issue.severity === "error").map((issue) => issue.message))],
        warnings: [...new Set(mine.filter((issue) => issue.severity === "warning").map((issue) => issue.message))],
        direction: options.direction,
        editable: options.editable,
      },
    };
  });

  const edges: FlowEdge<FlowEdgeData>[] = graph.edges.map((edge) => {
    const loop = edge.maxPasses !== undefined;
    const label = loop ? (edgeLabel(graph, edge.from, edge.exit) ?? "Again") : edgeLabel(graph, edge.from, edge.exit);
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      sourceHandle: edge.exit,
      type: "labeled",
      deletable: options.editable,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      data: {
        label,
        detail: loop ? `Up to ${edge.maxPasses} ${edge.maxPasses === 1 ? "time" : "times"}` : null,
        loop,
        tone: edge.exit === "expired" ? "warning" : "default",
      },
    };
  });

  return { nodes, edges };
}
