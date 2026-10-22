"use client";

import { MiniMap, useReactFlow, type Connection as FlowConnection, type EdgeChange, type NodeChange } from "@xyflow/react";
import { LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Canvas } from "@/components/ai-elements/canvas";
import { Connection } from "@/components/ai-elements/connection";
import { Controls } from "@/components/ai-elements/controls";
import { Edge } from "@/components/ai-elements/edge";
import { Panel } from "@/components/ai-elements/panel";
import { Toolbar } from "@/components/ai-elements/toolbar";
import { Button } from "@/components/ui/button";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "@/components/ui/menu";
import { BoxNode } from "@/components/workflows/box-node";
import { AddBoxItems } from "@/components/workflows/add-box-menu";
import { boxById } from "@/lib/workflows/graph";
import { exitsOf, type AddableKind } from "@/lib/workflows/edit";
import { homeViewport, toFlow, type Positions } from "@/lib/workflows/flow";
import type { CheckIssue, EdgeExit, WorkflowGraph } from "@/lib/workflows/types";

const NODE_TYPES = { box: BoxNode };
const EDGE_TYPES = { labeled: Edge.Labeled };

/** Ask the canvas to move: "home" opens on Start at a readable size, "fit" shows everything. */
export type ViewRequest = { kind: "home" | "fit"; n: number };

export type CanvasHandlers = {
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: { x: number; y: number }) => void;
  onConnect: (fromId: string, exit: EdgeExit, toId: string) => void;
  onAdd: (kind: AddableKind, after: { fromId: string; exit: EdgeExit }) => void;
  onRemoveBox: (id: string) => void;
  onRemoveEdge: (id: string) => void;
};

/**
 * The picture of a workflow on the AI Elements canvas. Everything on it is
 * derived from the graph, the checker and the person's own drag positions, so
 * the canvas and the outline can never show two different workflows.
 */
export function WorkflowCanvas({
  graph,
  issues,
  direction,
  editable,
  positions,
  selectedId,
  handlers,
  viewRequest,
  className,
}: {
  graph: WorkflowGraph;
  issues: CheckIssue[];
  direction: "LR" | "TB";
  editable: boolean;
  positions: Positions;
  selectedId: string | null;
  handlers: CanvasHandlers;
  viewRequest?: ViewRequest;
  className?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const instance = useReactFlow();
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);

  const flow = useMemo(() => toFlow(graph, { direction, issues, positions, editable }), [graph, direction, issues, positions, editable]);
  const nodes = useMemo(
    () => flow.nodes.map((node) => ({ ...node, selected: node.id === selectedId, measured: measured[node.id] })),
    [flow.nodes, measured, selectedId]
  );
  const edges = useMemo(() => flow.edges.map((edge) => ({ ...edge, selected: edge.id === selectedEdge })), [flow.edges, selectedEdge]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const sizes: Record<string, { width: number; height: number }> = {};
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions) sizes[change.id] = change.dimensions;
        if (change.type === "position" && change.position && editable) handlers.onMove(change.id, change.position);
        if (change.type === "select") {
          if (change.selected) {
            setSelectedEdge(null);
            handlers.onSelect(change.id);
          } else if (change.id === selectedId) {
            handlers.onSelect(null);
          }
        }
        if (change.type === "remove" && editable) handlers.onRemoveBox(change.id);
      }
      if (Object.keys(sizes).length > 0) setMeasured((prev) => ({ ...prev, ...sizes }));
    },
    [editable, handlers, selectedId]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      for (const change of changes) {
        if (change.type === "select") setSelectedEdge(change.selected ? change.id : null);
        if (change.type === "remove" && editable) handlers.onRemoveEdge(change.id);
      }
    },
    [editable, handlers]
  );

  const onConnect = useCallback(
    (connection: FlowConnection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle) return;
      handlers.onConnect(connection.source, connection.sourceHandle as EdgeExit, connection.target);
    },
    [handlers]
  );

  const isValidConnection = useCallback(
    (connection: FlowConnection | { source: string; target: string; sourceHandle?: string | null }) => {
      const target = boxById(graph, connection.target);
      return Boolean(connection.sourceHandle) && connection.source !== connection.target && !!target && target.config.kind !== "start" && target.config.kind !== "note";
    },
    [graph]
  );

  const selected = selectedId ? boxById(graph, selectedId) : undefined;
  const startId = graph.boxes.find((box) => box.config.kind === "start")?.id ?? null;

  const goHome = useCallback(() => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect) return;
    void instance.setViewport(homeViewport(flow.nodes, startId, { width: rect.width, height: rect.height }, direction));
  }, [instance, flow.nodes, startId, direction]);

  const lastRequest = useRef(viewRequest?.n ?? 0);
  useEffect(() => {
    if (!viewRequest || viewRequest.n === lastRequest.current) return;
    lastRequest.current = viewRequest.n;
    if (viewRequest.kind === "fit") void instance.fitView({ padding: 0.12, minZoom: 0.2, maxZoom: 1 });
    else window.requestAnimationFrame(goHome);
  }, [viewRequest, instance, goHome]);

  return (
    <div ref={frame} className={className}>
      <Canvas
        fitView={false}
        onInit={goHome}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        connectionLineComponent={Connection}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onPaneClick={() => {
          setSelectedEdge(null);
          handlers.onSelect(null);
        }}
        nodesDraggable={editable}
        nodesConnectable={editable}
        elementsSelectable
        deleteKeyCode={editable ? ["Backspace", "Delete"] : null}
        panOnDrag={!editable}
        selectionOnDrag={editable}
        minZoom={0.2}
        maxZoom={1.6}
        fitViewOptions={{ padding: 0.12, minZoom: 0.2, maxZoom: 1 }}
        aria-label="Workflow diagram"
      >
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable className="hidden! rounded-lg border lg:block!" position="top-right" ariaLabel="Overview of the whole workflow" />
        <Panel position="bottom-left" className="hidden max-w-xs items-start gap-2 px-3 py-2 text-xs text-muted-foreground sm:flex">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>Every message waits for approval. Sends happen only from 8 am to 8 pm in the lead&apos;s time.</span>
        </Panel>
        {editable && selected ? (
          <Toolbar nodeId={selected.id} isVisible className="gap-1 rounded-lg shadow-sm">
            {exitsOf(selected.config).map((item) => (
              <Menu key={item.exit}>
                <MenuTrigger render={<Button size="xs" variant="ghost" />}>
                  <PlusIcon aria-hidden />
                  {exitsOf(selected.config).length > 1 ? `After ${item.label}` : "Add next"}
                </MenuTrigger>
                <MenuPopup side="bottom" align="start" className="w-64">
                  <MenuGroup>
                    <MenuGroupLabel>Add a box</MenuGroupLabel>
                    <AddBoxItems
                      render={(kind, body) => (
                        <MenuItem key={kind} onClick={() => handlers.onAdd(kind, { fromId: selected.id, exit: item.exit })}>
                          {body}
                        </MenuItem>
                      )}
                    />
                  </MenuGroup>
                </MenuPopup>
              </Menu>
            ))}
            {selected.config.kind !== "start" ? (
              <Button size="xs" variant="ghost" onClick={() => handlers.onRemoveBox(selected.id)} aria-label="Remove this box">
                <Trash2Icon aria-hidden />
                Remove
              </Button>
            ) : null}
          </Toolbar>
        ) : null}
      </Canvas>
    </div>
  );
}
