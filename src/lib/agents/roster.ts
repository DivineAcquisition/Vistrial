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

export const LIVE_AGENT_IDS = ["scribe", "sentry", "relay", "compass"] as const;

export type LiveAgentId = (typeof LIVE_AGENT_IDS)[number];

export type AgentGlyph = "scroll" | "shield" | "send" | "compass";

export type AgentIdentity = {
  id: LiveAgentId;
  name: string;
  /** One line, plain language. */
  role: string;
  /** Longer description for the agent page. */
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
    role: "Builds case files from calls and context.",
    description:
      "Scribe reads call transcripts and notes, then writes a case file: a summary, key facts, objections, how ready the lead is and why, and the next best step. Every claim links to where it came from.",
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
    role: "Catches missed follow-ups.",
    description:
      "Sentry watches each lead's response window and raises it when a follow-up is at risk or missed, so nothing slips.",
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
    role: "Drafts follow-ups for your approval.",
    description:
      "Relay writes follow-up messages in your voice from what Scribe learned. Every draft waits for a person to approve it.",
    glyph: "send",
    accent: {
      text: "text-info",
      soft: "bg-info/12",
      ring: "ring-info/40",
      dot: "bg-info",
    },
    promise: "Relay never sends a message without your approval.",
    configSections: ["tone", "approval", "compliance"],
    order: 3,
  },
  compass: {
    id: "compass",
    name: "Compass",
    role: "Answers questions about your sales.",
    description:
      "Compass is the sales chat. Ask it about your calls, objections, and pipeline; it shows each step it takes and cites the records it used.",
    glyph: "compass",
    accent: {
      text: "text-chart-4",
      soft: "bg-chart-4/12",
      ring: "ring-chart-4/40",
      dot: "bg-chart-4",
    },
    promise: "Compass asks before anything leaves Vistrial.",
    configSections: ["approval", "integrations"],
    order: 4,
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

/** "Drafted by Relay", "Scored by Scribe". */
export function producedBy(id: LiveAgentId, verb: string): string {
  return `${verb} by ${AGENTS[id].name}`;
}
