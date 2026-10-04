"use client";

import { makeAssistantToolUI, type ToolCallMessagePartProps } from "@assistant-ui/react";

import { ExecutionToolCard } from "@/components/sales-os/execution-card";
import { ToolCallRow } from "@/components/sales-os/tool-call";
import { ANALYSIS_TOOLS, ASSET_TOOLS, EXECUTION_TOOLS } from "@/lib/sales-os/catalog";

function ExecutionRender(props: ToolCallMessagePartProps) {
  if (props.approval && props.approval.approved === undefined) return <ExecutionToolCard {...props} />;
  return <ToolCallRow {...props} />;
}

const TOOL_UIS = [
  ...ANALYSIS_TOOLS.map((toolName) => makeAssistantToolUI({ toolName, render: ToolCallRow })),
  ...ASSET_TOOLS.map((toolName) => makeAssistantToolUI({ toolName, render: ToolCallRow })),
  ...EXECUTION_TOOLS.map((toolName) => makeAssistantToolUI({ toolName, render: ExecutionRender })),
];

export function SalesOsToolUIs() {
  return (
    <>
      {TOOL_UIS.map((ToolUI, index) => (
        <ToolUI key={index} />
      ))}
    </>
  );
}

export const PlainToolFallback = ToolCallRow;
