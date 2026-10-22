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

/** What pausing stops, what keeps going, and what resuming does. Written from the real code. */
export type PauseText = { stops: string; continues: string; resume: string };

export type AgentContract = {
  pages: (agentId: string) => AgentPage[];
  pause: (name: string) => PauseText;
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
  pause: (name) => ({
    stops: `${name} stops starting new work.`,
    continues: "Anything already waiting for a person stays waiting. Nothing is deleted.",
    resume: `Resume ${name} here or on its page at any time.`,
  }),
  quickActions: { pause: PAUSE_ROLES, runNow: null },
  waiting: { approval: ["item waiting", "items waiting"], question: ["question", "questions"] },
};

const CONTRACTS: Record<string, Partial<AgentContract>> = {
  scribe: {
    pause: () => ({
      stops: "Scribe stops reading new calls.",
      continues: "Calls that come in while it is paused wait in line. Case files already built stay as they are, and nothing is deleted.",
      resume: "When you resume, Scribe reads the calls that waited.",
    }),
  },
  compass: {
    pause: () => ({
      stops: "Compass stops answering questions in this workspace.",
      continues: "Past conversations stay saved.",
      resume: "When you resume, anyone can ask again.",
    }),
  },
  relay: {
    pause: () => ({
      stops: "Relay stops drafting follow-ups. Follow-ups it would have drafted while paused are skipped, not saved for later.",
      continues:
        "Drafts already waiting for approval stay waiting. Anything Vistrial sends for you, such as approved messages and team posts, waits until you resume.",
      resume: "When you resume, Relay drafts new follow-ups again and anything waiting to send goes out.",
    }),
    quickActions: {
      pause: PAUSE_ROLES,
      runNow: {
        label: "Look for follow-ups now",
        description:
          "Relay drafts the follow-ups already waiting in its queue now, instead of at its next retry. Every draft waits for approval. Nothing is sent.",
        cooldownMinutes: RUN_NOW_COOLDOWN_MINUTES,
        dailyCap: RUN_NOW_DAILY_CAP,
      },
    },
    waiting: { approval: ["draft waiting", "drafts waiting"], question: ["question", "questions"] },
  },
  sentry: {
    pause: () => ({
      stops: "Sentry stops checking reply windows, sending alerts, and asking Relay for missed-window drafts.",
      continues: "Windows that are already open keep their true deadlines. Nothing is deleted.",
      resume:
        "When you resume, Sentry checks again from the true time. After a long pause, leads that missed their window are grouped into one alert per person.",
    }),
    quickActions: {
      pause: PAUSE_ROLES,
      runNow: {
        label: "Re-check response windows now",
        description: "Sentry checks this workspace's reply windows now instead of at its next pass. It only alerts your team. Nothing goes to a lead.",
        cooldownMinutes: RUN_NOW_COOLDOWN_MINUTES,
        dailyCap: RUN_NOW_DAILY_CAP,
      },
    },
  },
  assay: {
    pause: () => ({
      stops: "Assay stops scoring leads.",
      continues: "The last scores and the order of your list stay as they are.",
      resume: "When you resume, Assay catches up quietly, with no tasks or notices for the paused period.",
    }),
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
    pause: own.pause ?? DEFAULT_CONTRACT.pause,
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
