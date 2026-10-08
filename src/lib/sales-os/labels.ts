import type { Tone } from "@/components/ui/tone";

/** How a step or an execution ended, said the way a person would say it. */
export const TOOL_STATE_LABELS: Record<string, { label: string; tone: Tone }> = {
  running: { label: "Working", tone: "brand" },
  done: { label: "Done", tone: "good" },
  failed: { label: "Failed", tone: "critical" },
  permission: { label: "Not allowed for this person", tone: "warning" },
  insufficient_data: { label: "Not enough data", tone: "warning" },
  awaiting_approval: { label: "Waiting for an OK", tone: "brand" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const EXECUTION_STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  awaiting_approval: { label: "Waiting for an OK", tone: "brand" },
  approved: { label: "Approved", tone: "brand" },
  running: { label: "Running", tone: "brand" },
  succeeded: { label: "Sent", tone: "good" },
  failed: { label: "Failed, not retried", tone: "critical" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const TIER_LABELS: Record<string, string> = {
  analysis: "Read your data",
  asset: "Wrote an asset",
  execution: "Outside Vistrial",
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "owner",
  admin: "admin",
  closer: "closer",
  setter: "setter",
  client_viewer: "viewer",
  da_operator: "Vistrial team",
};
