import type { EdgeProps } from "@xyflow/react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSimpleBezierPath,
  getSmoothStepPath,
} from "@xyflow/react";

import { cn } from "@/lib/utils";

const Temporary = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) => {
  const [edgePath] = getSimpleBezierPath({
    sourcePosition,
    sourceX,
    sourceY,
    targetPosition,
    targetX,
    targetY,
  });

  return (
    <BaseEdge
      className="stroke-1 stroke-ring"
      id={id}
      path={edgePath}
      style={{
        strokeDasharray: "5, 5",
      }}
    />
  );
};

export type LabeledEdgeData = {
  /** Plain words on the line, for example "Replied" or "No reply". */
  label?: string | null;
  /** A second line under the label, for example "Up to 3 times". */
  detail?: string | null;
  /** A counted loop back to an earlier box. Drawn dashed. */
  loop?: boolean;
  tone?: "default" | "muted" | "warning";
};

/**
 * A still line with an optional label. AI Elements ships an animated edge with a
 * dot running along it; Vistrial does not use it, because a moving dot implies
 * leads are flowing when nothing may be happening.
 */
const Labeled = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
  data,
}: EdgeProps) => {
  const info = (data ?? {}) as LabeledEdgeData;
  const [edgePath, labelX, labelY] = info.loop
    ? getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 14, offset: 28 })
    : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });

  return (
    <>
      <BaseEdge
        id={id}
        markerEnd={markerEnd}
        path={edgePath}
        className={cn(selected && "stroke-primary!")}
        style={{ strokeWidth: 1.5, strokeDasharray: info.loop ? "6 5" : undefined }}
      />
      {info.label ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "nodrag nopan pointer-events-auto absolute flex max-w-40 flex-col items-center rounded-full border bg-background px-2 py-0.5 text-center text-[11px] leading-4 font-medium shadow-xs",
              info.tone === "warning" ? "border-warning/40 text-warning-foreground" : "border-border text-card-foreground",
              info.tone === "muted" && "text-muted-foreground"
            )}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            <span className="truncate">{info.label}</span>
            {info.detail ? <span className="text-[10px] font-normal text-muted-foreground">{info.detail}</span> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};

export const Edge = {
  Labeled,
  Temporary,
};
