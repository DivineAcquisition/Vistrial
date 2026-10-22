"use client";

import { Handle, Position, type NodeProps, type Node as FlowNode } from "@xyflow/react";
import { CircleAlertIcon, ShieldCheckIcon } from "lucide-react";
import { memo } from "react";

import { Node, NodeContent, NodeDescription, NodeFooter, NodeHeader, NodeTitle } from "@/components/ai-elements/node";
import { AgentName } from "@/components/live/agent-identity";
import { BOX_ICONS } from "@/components/workflows/box-icons";
import { kindLabel } from "@/lib/workflows/describe";
import { BOX_SIZE, type BoxNodeData } from "@/lib/workflows/flow";
import { cn } from "@/lib/utils";

/**
 * One box on the canvas, built on the AI Elements node: the type's icon and
 * name, a plain title, one summary line, and the agent that does the work.
 * A draft always says it needs approval on its face.
 */
function BoxNodeView({ data, selected }: NodeProps<FlowNode<BoxNodeData>>) {
  const kind = data.box.config.kind;
  const Icon = BOX_ICONS[kind];
  const note = kind === "note";
  const draft = kind === "draft";
  const lr = data.direction === "LR";
  const hasErrors = data.errors.length > 0;

  return (
    <Node
      direction={data.direction}
      handles={{ target: kind !== "start" && !note, source: false }}
      style={{ width: BOX_SIZE.width }}
      className={cn(
        "text-left",
        note && "border-dashed bg-muted shadow-none",
        hasErrors && "border-destructive/50",
        selected && "border-primary/60"
      )}
    >
      <NodeHeader className="flex flex-row items-center gap-2 border-b-0 bg-transparent pb-0!">
        <span
          aria-hidden
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md",
            kind === "start" || kind === "end" ? "bg-primary/14 text-brand-300" : "bg-overlay/6 text-muted-foreground"
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {kindLabel(kind)}
        </span>
        {hasErrors ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive-foreground">
            <CircleAlertIcon className="size-3" aria-hidden />
            {data.errors.length === 1 ? "1 to fix" : `${data.errors.length} to fix`}
          </span>
        ) : null}
      </NodeHeader>
      <NodeContent className="space-y-1 pt-2!">
        <NodeTitle className={cn("text-sm leading-snug font-medium text-card-foreground", note && "font-normal")}>{data.title}</NodeTitle>
        {!note ? <NodeDescription className="line-clamp-2 text-xs leading-snug">{data.summary}</NodeDescription> : null}
        {note ? <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">{data.summary}</p> : null}
      </NodeContent>
      {data.agent || draft ? (
        <NodeFooter className="flex items-center justify-between gap-2 border-t bg-transparent px-3! py-2!">
          {data.agent ? <AgentName agentId={data.agent} size="xs" className="text-xs" /> : <span />}
          {draft ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-1.5 py-0.5 text-[10px] font-medium text-warning-foreground">
              <ShieldCheckIcon className="size-3" aria-hidden />
              Needs approval
            </span>
          ) : null}
        </NodeFooter>
      ) : null}
      {data.exits.map((item, index) => {
        const share = `${((index + 1) / (data.exits.length + 1)) * 100}%`;
        return (
          <Handle
            key={item.exit}
            id={item.exit}
            type="source"
            position={lr ? Position.Right : Position.Bottom}
            isConnectable={data.editable}
            title={item.label}
            aria-label={`${item.label} exit${item.connected ? "" : ", not connected yet"}`}
            style={lr ? { top: share } : { left: share }}
            className={cn(!item.connected && "border-destructive! bg-destructive/20!")}
          />
        );
      })}
    </Node>
  );
}

export const BoxNode = memo(BoxNodeView);
