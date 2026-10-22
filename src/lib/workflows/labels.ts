import type { WorkflowRow } from "@/lib/workflows/store";

export const STATUS_LABEL: Record<WorkflowRow["status"], string> = {
  draft: "Draft",
  proposed: "Drawn for you",
  published: "Published",
  paused: "Paused",
  archived: "Archived",
};

export const STATUS_VARIANT: Record<WorkflowRow["status"], "outline" | "info" | "success" | "warning" | "secondary"> = {
  draft: "outline",
  proposed: "info",
  published: "success",
  paused: "warning",
  archived: "secondary",
};
