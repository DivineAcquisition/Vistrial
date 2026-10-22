"use client";

import type { ReactFlowProps } from "@xyflow/react";
import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";
import type { ReactNode } from "react";

import "@xyflow/react/dist/style.css";

type CanvasProps = ReactFlowProps & {
  children?: ReactNode;
};

const deleteKeyCode = ["Backspace", "Delete"];

/**
 * AI Elements canvas on React Flow, on Vistrial's tokens. Colours come from the
 * `--xy-*` variables in globals.css, so both themes follow without a prop. The
 * library attribution is hidden because the interface names no other company.
 */
export const Canvas = ({ children, ...props }: CanvasProps) => (
  <ReactFlow
    deleteKeyCode={deleteKeyCode}
    fitView
    panOnDrag={false}
    panOnScroll
    selectionOnDrag={true}
    zoomOnDoubleClick={false}
    proOptions={{ hideAttribution: true }}
    {...props}
  >
    <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} />
    {children}
  </ReactFlow>
);
