import type { WorkspaceRole } from "@/lib/auth/types";
import { AGENTS, type LiveAgentId } from "@/lib/agents/roster";
import { STATE_COPY } from "@/lib/workspace/voice";
import { WELCOME_DAYS } from "../../../convex/homeRules";

/**
 * Which version of the workspace a person sees, decided from real records
 * only. Nothing here fakes a state: each branch names the data behind it.
 */

export type Lifecycle = "setup" | "importing" | "quiet" | "steady";

export type Problem =
  | { kind: "reconnect"; connector: string; href: string }
  | { kind: "agent_stopped"; agentId: LiveAgentId; href: string }
  | { kind: "delayed"; connector: string; href: string };

export type Attention = { text: string; href: string; action: string; others: number; kind: Problem["kind"] };

export type StateInput = {
  role: WorkspaceRole;
  workspaceStatus: string;
  /** workspace_onboarding_status.went_live_at */
  wentLiveAt: string | null;
  /** An onboarding_import_runs row is queued or running. */
  importRunning: boolean;
  imported: number;
  /** Agent runs since go-live, capped by the caller. */
  runsSinceLive: number;
  /** No lead source has 20 closed deals yet. */
  learning: boolean;
  problems: Problem[];
  welcome: { firstSeenAt: number | null; dismissedAt: number | null };
  now: number;
};

export type WorkspaceState = {
  lifecycle: Lifecycle;
  showWelcome: boolean;
  learning: boolean;
  attention: Attention | null;
  workspacePaused: boolean;
  liveDays: number | null;
  /** Decisions, due now, and work next are hidden until the workspace is live. */
  showWork: boolean;
};

const PRIORITY: Record<Problem["kind"], number> = { reconnect: 0, agent_stopped: 1, delayed: 2 };

export function attentionFor(problems: Problem[]): Attention | null {
  if (!problems.length) return null;
  const sorted = [...problems].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  const top = sorted[0];
  const others = sorted.length - 1;
  switch (top.kind) {
    case "reconnect":
      return { kind: top.kind, text: STATE_COPY.reconnect(top.connector), href: top.href, action: "Reconnect", others };
    case "agent_stopped":
      return { kind: top.kind, text: STATE_COPY.agentStopped(AGENTS[top.agentId].name), href: top.href, action: "Take a look", others };
    case "delayed":
      return { kind: top.kind, text: STATE_COPY.dataDelayed(top.connector), href: top.href, action: "See connections", others };
  }
}

export function detectWorkspaceState(input: StateInput): WorkspaceState {
  const live = Boolean(input.wentLiveAt);
  const liveDays = input.wentLiveAt ? Math.max(0, Math.floor((input.now - Date.parse(input.wentLiveAt)) / 86_400_000)) : null;
  let lifecycle: Lifecycle;
  if (input.importRunning) lifecycle = "importing";
  else if (!live) lifecycle = "setup";
  else if ((liveDays ?? 0) < 7 && input.runsSinceLive < 20) lifecycle = "quiet";
  else lifecycle = "steady";

  const withinWelcome =
    input.welcome.firstSeenAt === null || input.now - input.welcome.firstSeenAt < WELCOME_DAYS * 86_400_000;
  const showWelcome = input.role === "owner" && input.welcome.dismissedAt === null && withinWelcome;

  return {
    lifecycle,
    showWelcome,
    learning: input.learning && input.role !== "operator",
    attention: attentionFor(input.problems),
    workspacePaused: input.workspaceStatus === "paused" || input.workspaceStatus === "closed",
    liveDays,
    showWork: lifecycle !== "importing",
  };
}

/** True when a source has reached the closed-deal count Assay needs before it learns from sources. */
export function sourceLearningStarted(closedBySource: Record<string, number>, threshold = 20): boolean {
  return Object.values(closedBySource).some((count) => count >= threshold);
}
