import type { Tone } from "@/components/ui/tone";
import type { WorkspaceStatus } from "@/types/database";

/** One label and one tone per status, used everywhere a status is shown. */
export const WORKSPACE_STATUS: Record<WorkspaceStatus, { label: string; tone: Tone; detail: string }> = {
  onboarding: {
    label: "Onboarding",
    tone: "brand",
    detail: "Being set up. Not live yet.",
  },
  active: {
    label: "Active",
    tone: "good",
    detail: "Live.",
  },
  paused: {
    label: "Paused",
    tone: "warning",
    detail: "Data kept. Every automation and outbound send is stopped.",
  },
  closed: {
    label: "Closed",
    tone: "critical",
    detail: "Read-only for the team. The customer no longer has access.",
  },
};

export function workspaceStatus(status: WorkspaceStatus) {
  return WORKSPACE_STATUS[status] ?? WORKSPACE_STATUS.active;
}

/** Automation, scheduled jobs and outbound sends run only for these. Paused and closed stop them all. */
export const AUTOMATION_STATUSES: WorkspaceStatus[] = ["onboarding", "active"];

export function automationRunsFor(status: WorkspaceStatus | null | undefined): boolean {
  return status === "onboarding" || status === "active";
}
