"use client";

import { makeAssistantToolUI, type ToolCallMessagePartComponent, type ToolCallMessagePartProps } from "@assistant-ui/react";

import { AssetListCard, AssetResultCard } from "@/components/sales-os/asset-card";
import { ExecutionToolCard } from "@/components/sales-os/execution-card";
import { FindingCard } from "@/components/sales-os/finding-card";
import { ToolLine } from "@/components/sales-os/tool-line";
import type { Finding } from "@/lib/sales-os/analysis";
import type { AssetToolResult, AssetView } from "@/lib/sales-os/asset-types";
import {
  ANALYSIS_TOOLS,
  ASSET_TOOLS,
  EXECUTION_TOOLS,
  TOOL_LABELS,
  isSalesOsTool,
  type SalesOsToolName,
} from "@/lib/sales-os/catalog";

function failedText(props: ToolCallMessagePartProps): string {
  const error = (props.result as { error?: unknown } | undefined)?.error;
  return typeof error === "string" && error.trim() ? error : "Something went wrong. Nothing was changed.";
}

type AssetList = { kind: "asset_list"; assets: AssetView[]; message: string };

function AnalysisRender(props: ToolCallMessagePartProps) {
  const labels = TOOL_LABELS[props.toolName as SalesOsToolName];
  if (props.isError) return <ToolLine state="failed">{`${labels.failed}. ${failedText(props)}`}</ToolLine>;
  const result = props.result as Finding | AssetList | undefined;
  if (!result) return <ToolLine state="running">{labels.running}</ToolLine>;
  return (
    <div className="space-y-2">
      <ToolLine state="done">{labels.done}</ToolLine>
      {result.kind === "asset_list" ? <AssetListCard assets={result.assets} message={result.message} /> : <FindingCard finding={result} />}
    </div>
  );
}

function AssetRender(props: ToolCallMessagePartProps) {
  const labels = TOOL_LABELS[props.toolName as SalesOsToolName];
  if (props.isError) return <ToolLine state="failed">{`${labels.failed}. ${failedText(props)}`}</ToolLine>;
  const result = props.result as AssetToolResult | undefined;
  if (!result) return <ToolLine state="running">{labels.running}</ToolLine>;
  return (
    <div className="space-y-2">
      <ToolLine state={result.status === "created" ? "done" : "failed"}>
        {result.status === "created" ? labels.done : labels.failed}
      </ToolLine>
      <AssetResultCard result={result} />
    </div>
  );
}

const TOOL_UIS = [
  ...ANALYSIS_TOOLS.map((toolName) => makeAssistantToolUI({ toolName, render: AnalysisRender })),
  ...ASSET_TOOLS.map((toolName) => makeAssistantToolUI({ toolName, render: AssetRender })),
  ...EXECUTION_TOOLS.map((toolName) => makeAssistantToolUI({ toolName, render: ExecutionToolCard })),
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

/** For anything without its own card. Still plain language. */
export const PlainToolFallback: ToolCallMessagePartComponent = (props) => {
  const labels = isSalesOsTool(props.toolName) ? TOOL_LABELS[props.toolName] : null;
  if (props.isError) return <ToolLine state="failed">{labels?.failed ?? "That step didn't work"}</ToolLine>;
  if (props.result === undefined) return <ToolLine state="running">{labels?.running ?? "Working on it"}</ToolLine>;
  return <ToolLine state="done">{labels?.done ?? "Done"}</ToolLine>;
};
