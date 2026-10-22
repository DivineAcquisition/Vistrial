"use client";

import { Background, Controls, MiniMap, ReactFlow, type Edge as FlowEdge, type Node, type NodeProps } from "@xyflow/react";
import { MessageSquareIcon } from "lucide-react";
import "@xyflow/react/dist/style.css";

import { AGENT_FOR_BOX, QUIET_HOURS_NOTE, type Graph } from "@/lib/workflows/types";

type NodeData = { title: string; summary: string; kind: string; agent: string | null; approval: boolean; count: number | null; stalled: boolean; selected: boolean };

function FlowBox({ data }: NodeProps) {
  const row = data as NodeData;
  return (
    <div className={`w-56 rounded-xl border bg-card px-3 py-2 text-card-foreground shadow-sm ${row.selected ? "border-brand-400" : "border-border"} ${row.stalled ? "ring-2 ring-warning" : ""}`}>
      <div className="flex items-center gap-2">
        {row.approval ? <MessageSquareIcon className="size-3.5 text-info" aria-hidden /> : null}
        <p className="truncate text-sm font-medium">{row.title}</p>
      </div>
      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.summary}</p>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{row.agent ?? row.kind}</span>
        {row.count !== null ? <span className="rounded-full bg-muted px-2 py-0.5 text-card-foreground">{row.count} now</span> : null}
      </div>
      {row.approval ? <p className="mt-1 text-[11px] text-info">Needs approval</p> : null}
    </div>
  );
}

const nodeTypes = { workflow: FlowBox };

export function WorkflowCanvas({
  graph,
  selectedId,
  onSelect,
  counts,
  readOnly,
}: {
  graph: Graph;
  selectedId: string | null;
  onSelect: (id: string) => void;
  counts?: Record<string, { now: number; stalled: boolean }>;
  readOnly?: boolean;
}) {
  const nodes: Node[] = graph.boxes.map((box) => ({
    id: box.id,
    type: "workflow",
    position: box.position,
    data: {
      title: box.title,
      summary: box.summary,
      kind: box.type,
      agent: AGENT_FOR_BOX[box.type],
      approval: box.type === "draft",
      count: counts?.[box.id]?.now ?? null,
      stalled: counts?.[box.id]?.stalled ?? false,
      selected: box.id === selectedId,
    },
    draggable: !readOnly,
  }));
  const edges: FlowEdge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.maxPasses ? `${edge.label} (up to ${edge.maxPasses})` : edge.label,
    style: { stroke: "var(--border)" },
  }));
  return (
    <div className="h-[70vh] min-h-80 w-full overflow-hidden rounded-xl border border-border bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        onNodeClick={(_, node) => onSelect(node.id)}
      >
        <Background />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      <p className="sr-only">{QUIET_HOURS_NOTE}</p>
    </div>
  );
}
