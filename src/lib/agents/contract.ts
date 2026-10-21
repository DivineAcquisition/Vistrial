import type { WorkspaceRole } from "@/lib/auth/types";

/**
 * The agent contract: what every agent provides so no screen has to know it
 * by name. Registry data (names, area, plans, availability) lives in the
 * database and roster.ts; this file holds the parts that are code: the pages
 * it provides, its quick actions, and the plain words for what waits on a
 * person.
 *
 * An agent registered with no entry here still works everywhere through
 * DEFAULT_CONTRACT. It reports through the shared activity record, so its
 * presence, step, last action, waiting count and outputs come from the shared
 * summary like everyone else's.
 */

export type AgentPage = {
  kind: "agent" | "work";
  label: string;
  href: string;
  /** Roles that can already open the page. The sidebar never widens this. */
  roles: WorkspaceRole[];
};

export type RunNowAction = {
  label: string;
  /** What happens, in plain words, shown before it runs. */
  description: string;
  cooldownMinutes: number;
  dailyCap: number;
};

export type AgentContract = {
  pages: (agentId: string) => AgentPage[];
  quickActions: {
    /** Roles that may pause and resume (Prompt 3). Everyone else sees the state only. */
    pause: WorkspaceRole[];
    /** Only for agents that are safe to run on demand. Never sends anything. */
    runNow: RunNowAction | null;
  };
  /** Singular and plural words for what waits on a person. */
  waiting: { approval: [string, string]; question: [string, string] };
};

export const PAUSE_ROLES: WorkspaceRole[] = ["owner", "service_team", "platform_admin"];
const AGENT_PAGE_ROLES: WorkspaceRole[] = ["owner", "service_team", "platform_admin"];

const RUN_NOW_COOLDOWN_MINUTES = 10;
const RUN_NOW_DAILY_CAP = 6;

export const DEFAULT_CONTRACT: AgentContract = {
  pages: (agentId) => [{ kind: "agent", label: "Agent page", href: `/app/agents/${agentId}`, roles: AGENT_PAGE_ROLES }],
  quickActions: { pause: PAUSE_ROLES, runNow: null },
  waiting: { approval: ["item waiting", "items waiting"], question: ["question", "questions"] },
};

const CONTRACTS: Record<string, Partial<AgentContract>> = {
  relay: {
    quickActions: {
      pause: PAUSE_ROLES,
      runNow: {
        label: "Look for follow-ups now",
        description: "Relay checks for leads that need a follow-up and drafts them. Every draft waits for approval. Nothing is sent.",
        cooldownMinutes: RUN_NOW_COOLDOWN_MINUTES,
        dailyCap: RUN_NOW_DAILY_CAP,
      },
    },
    waiting: { approval: ["draft waiting", "drafts waiting"], question: ["question", "questions"] },
  },
  sentry: {
    quickActions: {
      pause: PAUSE_ROLES,
      runNow: {
        label: "Re-check response windows now",
        description: "Sentry re-checks every open reply window against the true time. It only alerts your team. Nothing goes to a lead.",
        cooldownMinutes: RUN_NOW_COOLDOWN_MINUTES,
        dailyCap: RUN_NOW_DAILY_CAP,
      },
    },
  },
  assay: {
    quickActions: {
      pause: PAUSE_ROLES,
      runNow: {
        label: "Re-score open leads now",
        description: "Assay scores your open leads again with today's rules. Scores and order may change. Nothing goes to a lead.",
        cooldownMinutes: RUN_NOW_COOLDOWN_MINUTES,
        dailyCap: RUN_NOW_DAILY_CAP,
      },
    },
  },
};

export function agentContract(agentId: string): AgentContract {
  const own = CONTRACTS[agentId] ?? {};
  return {
    pages: own.pages ?? DEFAULT_CONTRACT.pages,
    quickActions: own.quickActions ?? DEFAULT_CONTRACT.quickActions,
    waiting: own.waiting ?? DEFAULT_CONTRACT.waiting,
  };
}

/** "3 drafts waiting", "1 question". */
export function waitingPhrase(agentId: string, counts: { approvals: number; questions: number }): string | null {
  const words = agentContract(agentId).waiting;
  const parts: string[] = [];
  if (counts.approvals > 0) parts.push(`${counts.approvals} ${counts.approvals === 1 ? words.approval[0] : words.approval[1]}`);
  if (counts.questions > 0) parts.push(`${counts.questions} ${counts.questions === 1 ? words.question[0] : words.question[1]}`);
  return parts.length ? parts.join(", ") : null;
}
