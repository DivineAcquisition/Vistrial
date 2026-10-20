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
  | { kind: "delayed"; connector: string; href: string }
  | { kind: "billing"; level: "restricted" | "past_due"; href: string; canOpen: boolean };

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

/** One banner. A payment block outranks a broken connection. A late payment waits behind both. */
function problemRank(problem: Problem): number {
  if (problem.kind === "billing") return problem.level === "restricted" ? 0 : 4;
  return { reconnect: 1, agent_stopped: 2, delayed: 3 }[problem.kind];
}

export function attentionFor(problems: Problem[]): Attention | null {
  if (!problems.length) return null;
  const sorted = [...problems].sort((a, b) => problemRank(a) - problemRank(b));
  const top = sorted[0];
  const others = sorted.length - 1;
  switch (top.kind) {
    case "reconnect":
      return { kind: top.kind, text: STATE_COPY.reconnect(top.connector), href: top.href, action: "Reconnect", others };
    case "agent_stopped":
      return { kind: top.kind, text: STATE_COPY.agentStopped(AGENTS[top.agentId].name), href: top.href, action: "Take a look", others };
    case "delayed":
      return { kind: top.kind, text: STATE_COPY.dataDelayed(top.connector), href: top.href, action: "See connections", others };
    case "billing": {
      const base = top.level === "restricted" ? STATE_COPY.billingRestricted : STATE_COPY.billingPastDue;
      return {
        kind: top.kind,
        text: top.canOpen ? base : `${base} ${STATE_COPY.billingAskOwner}`,
        href: top.canOpen ? top.href : "",
        action: top.canOpen ? "Open Billing" : "",
        others,
      };
    }
  }
}

/** The Help menu keeps the tour for 14 days after the Owner dismisses the welcome. */
export function welcomeTourLink(input: {
  role: WorkspaceRole;
  enabled: boolean;
  firstSeenAt: number | null;
  dismissedAt: number | null;
  now: number;
}): boolean {
  if (!input.enabled || input.role !== "owner") return false;
  if (input.dismissedAt === null || input.firstSeenAt === null) return false;
  return input.now - input.firstSeenAt < WELCOME_DAYS * 86_400_000;
}

export function welcomeWindowOpen(firstSeenAt: number | null, now: number): boolean {
  return firstSeenAt === null || now - firstSeenAt < WELCOME_DAYS * 86_400_000;
}

/** Home and Today are the only pages that carry the workspace banner, so other pages keep their own. */
export function isAgenticSurface(pathname: string): boolean {
  return pathname === "/app/home" || pathname.startsWith("/app/home/") || pathname === "/app/today" || pathname.startsWith("/app/today/");
}

export function detectWorkspaceState(input: StateInput): WorkspaceState {
  const live = Boolean(input.wentLiveAt);
  const liveDays = input.wentLiveAt ? Math.max(0, Math.floor((input.now - Date.parse(input.wentLiveAt)) / 86_400_000)) : null;
  let lifecycle: Lifecycle;
  if (input.importRunning) lifecycle = "importing";
  else if (!live) lifecycle = "setup";
  else if ((liveDays ?? 0) < 7 && input.runsSinceLive < 20) lifecycle = "quiet";
  else lifecycle = "steady";

  const showWelcome = input.role === "owner" && input.welcome.dismissedAt === null && welcomeWindowOpen(input.welcome.firstSeenAt, input.now);

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
