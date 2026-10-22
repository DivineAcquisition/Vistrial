import type { ConnectionLineComponent } from "@xyflow/react";

const HALF = 0.5;

/** The line drawn while a person drags from one box to another. Still, not animated. */
export const Connection: ConnectionLineComponent = ({
  fromX,
  fromY,
  toX,
  toY,
}) => (
  <g>
    <path
      d={`M${fromX},${fromY} C ${fromX + (toX - fromX) * HALF},${fromY} ${fromX + (toX - fromX) * HALF},${toY} ${toX},${toY}`}
      fill="none"
      stroke="var(--color-ring)"
      strokeDasharray="5 5"
      strokeWidth={1.5}
    />
    <circle
      cx={toX}
      cy={toY}
      fill="var(--background)"
      r={3}
      stroke="var(--color-ring)"
      strokeWidth={1.5}
    />
  </g>
);
