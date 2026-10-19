/**
 * The one place agent names, roles, and visual identity are defined.
 *
 * Every surface (status strip, panel, feed, run viewer, record pages,
 * approval cards, agent pages) reads from here. Renaming or adding an agent
 * means editing this file and the database check lists only.
 *
 * Accents use existing color tokens. The glyph and name always accompany the
 * accent, so an agent is never identified by color alone.
 */

export const LIVE_AGENT_IDS = ["scribe", "sentry", "relay", "compass", "assay"] as const;

/** The Sales room order. Pipeline order on a lead stays Scribe, Sentry, Relay. */
export const SALES_ROOM_IDS = ["compass", "scribe", "assay", "sentry", "relay"] as const;

export type LiveAgentId = (typeof LIVE_AGENT_IDS)[number];

export type AgentGlyph = "scroll" | "shield" | "send" | "compass" | "scale";

export type AgentIdentity = {
  id: LiveAgentId;
  name: string;
  /** Title shown under the name. Replaces the old role sentence. */
  sublabel: string;
  /** Same words as sublabel, so older screens that read `role` show the title. */
  role: string;
  /** One sentence, shown on hover or tap. */
  description: string;
  glyph: AgentGlyph;
  /** Tailwind classes built from existing tokens. */
  accent: {
    text: string;
    soft: string;
    ring: string;
    dot: string;
  };
  /** What the agent never does on its own, shown where it reassures. */
  promise: string;
  /** Configuration sections that shape its behavior. */
  configSections: string[];
  /** Pipeline order on a lead. */
  order: number;
};

export const AGENTS: Record<LiveAgentId, AgentIdentity> = {
  scribe: {
    id: "scribe",
    name: "Scribe",
    sublabel: "Sales Analyst",
    role: "Sales Analyst",
    description: "Turns your calls, emails and texts into case files.",
    glyph: "scroll",
    accent: {
      text: "text-brand-300",
      soft: "bg-brand-500/12",
      ring: "ring-brand-500/40",
      dot: "bg-brand-400",
    },
    promise: "Scribe never contacts a lead and never changes your CRM.",
    configSections: ["qualification", "industry", "sources"],
    order: 1,
  },
  sentry: {
    id: "sentry",
    name: "Sentry",
    sublabel: "Pipeline Manager",
    role: "Pipeline Manager",
    description: "Watches your response times and flags leads waiting too long.",
    glyph: "shield",
    accent: {
      text: "text-chart-2",
      soft: "bg-chart-2/12",
      ring: "ring-chart-2/40",
      dot: "bg-chart-2",
    },
    promise: "Sentry only alerts your team. It never sends anything to a lead.",
    configSections: ["response", "escalation"],
    order: 2,
  },
  relay: {
    id: "relay",
    name: "Relay",
    sublabel: "Sales Development Rep",
    role: "Sales Development Rep",
    description: "Drafts your follow-ups and sends them once you approve.",
    glyph: "send",
    accent: {
      text: "text-info",
      soft: "bg-info/12",
      ring: "ring-info/40",
      dot: "bg-info",
    },
    promise: "Relay never sends anything. You approve each draft and send it from your CRM.",
    configSections: ["tone", "approval", "compliance"],
    order: 3,
  },
  compass: {
    id: "compass",
    name: "Compass",
    sublabel: "Sales Director",
    role: "Sales Director",
    description: "Answers your questions, coordinates the team, and reports what it did.",
    glyph: "compass",
    accent: {
      text: "text-chart-4",
      soft: "bg-chart-4/12",
      ring: "ring-chart-4/40",
      dot: "bg-chart-4",
    },
    promise: "Compass only reads. It never sends a message, and nothing changes until you confirm a suggestion.",
    configSections: ["approval", "integrations"],
    order: 4,
  },
  assay: {
    id: "assay",
    name: "Assay",
    sublabel: "Lead Qualifier",
    role: "Lead Qualifier",
    description: "Scores your leads and puts your queue in order.",
    glyph: "scale",
    accent: {
      text: "text-chart-3",
      soft: "bg-chart-3/12",
      ring: "ring-chart-3/40",
      dot: "bg-chart-3",
    },
    promise: "Assay is getting ready. It does not score leads or start work yet.",
    configSections: [],
    order: 5,
  },
};

export const AGENT_LIST: AgentIdentity[] = LIVE_AGENT_IDS.map((id) => AGENTS[id]).sort(
  (a, b) => a.order - b.order
);

export function isLiveAgentId(value: unknown): value is LiveAgentId {
  return typeof value === "string" && (LIVE_AGENT_IDS as readonly string[]).includes(value);
}

export function agentIdentity(id: LiveAgentId): AgentIdentity {
  return AGENTS[id];
}

/** "Relay, Sales Development Rep". Name always comes first. */
export function agentCredit(id: LiveAgentId): string {
  const agent = AGENTS[id];
  return `${agent.name}, ${agent.sublabel}`;
}

/** "Drafted by Relay, Sales Development Rep". */
export function producedBy(id: LiveAgentId, verb: string): string {
  return `${verb} by ${agentCredit(id)}`;
}
