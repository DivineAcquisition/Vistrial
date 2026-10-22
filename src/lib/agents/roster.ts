/**
 * The agent registry: the one list of every agent Vistrial hosts, and the
 * areas of work they serve.
 *
 * This file holds the seed. The database copy (agent_registry, agent_areas)
 * is what Platform Admins edit and what the server enforces; it starts from
 * exactly these values, and a test fails if the two drift apart in the
 * migration. Behavior that needs code (pages, quick actions, how counts read)
 * lives in contract.ts, with a generic default so a registered agent with no
 * code of its own still shows up everywhere.
 *
 * Accents use existing color tokens. The glyph and name always accompany the
 * accent, so an agent is never identified by color alone.
 */

export const LIVE_AGENT_IDS = ["scribe", "sentry", "relay", "compass", "assay"] as const;

/** The Sales room order. Pipeline order on a lead stays Scribe, Sentry, Relay. */
export const SALES_ROOM_IDS = ["compass", "scribe", "assay", "sentry", "relay"] as const;

export type LiveAgentId = (typeof LIVE_AGENT_IDS)[number];

export const AGENT_GLYPHS = ["scroll", "shield", "send", "compass", "scale", "spark"] as const;
export type AgentGlyph = (typeof AGENT_GLYPHS)[number];

export const AGENT_ACCENT_KEYS = ["brand", "chart-2", "info", "chart-4", "chart-3", "neutral"] as const;
export type AgentAccentKey = (typeof AGENT_ACCENT_KEYS)[number];

export type AgentAccent = { text: string; soft: string; ring: string; dot: string };

/** Tailwind classes built from existing tokens, one set per accent key. */
export const AGENT_ACCENTS: Record<AgentAccentKey, AgentAccent> = {
  brand: { text: "text-brand-300", soft: "bg-brand-500/12", ring: "ring-brand-500/40", dot: "bg-brand-400" },
  "chart-2": { text: "text-chart-2", soft: "bg-chart-2/12", ring: "ring-chart-2/40", dot: "bg-chart-2" },
  info: { text: "text-info", soft: "bg-info/12", ring: "ring-info/40", dot: "bg-info" },
  "chart-4": { text: "text-chart-4", soft: "bg-chart-4/12", ring: "ring-chart-4/40", dot: "bg-chart-4" },
  "chart-3": { text: "text-chart-3", soft: "bg-chart-3/12", ring: "ring-chart-3/40", dot: "bg-chart-3" },
  neutral: { text: "text-silver", soft: "bg-overlay/8", ring: "ring-overlay/20", dot: "bg-silver" },
};

/** The kinds of record an agent acts on. Later areas add customer, account, renewal. */
export const RECORD_KINDS = ["lead", "case_file", "call", "booking", "task", "customer", "account", "renewal"] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export type AgentAvailability = "available" | "beta" | "coming_soon";

/** Checked against real workspace state on the server. */
export const AGENT_PREREQUISITES = ["crm_connected", "call_source"] as const;
export type AgentPrerequisite = (typeof AGENT_PREREQUISITES)[number];

/**
 * Where an agent's "last action" and working state come from: its runs in
 * the shared activity record, or (Assay) the scores it writes.
 */
export type AgentActivitySource = "runs" | "scores";

/** What "its work" means in the sidebar. Each kind has one generic line. */
export type AgentOutputSource = "activity" | "requests" | "windows" | "tiers";

export type AgentArea = {
  id: string;
  name: string;
  description: string;
  /** The record this area's work is about. */
  recordKind: RecordKind;
  /** Pinned under the area header. Roles are the roles that can already open it. */
  workPage: { label: string; href: string; roles: string[] } | null;
  /** Where the area header goes. */
  homePage: { href: string; roles: string[] } | null;
  availability: "available" | "coming_soon";
  order: number;
};

export const AGENT_AREAS: AgentArea[] = [
  {
    id: "sales",
    name: "Sales",
    description: "Agents that turn new leads into booked work.",
    recordKind: "lead",
    workPage: { label: "Case Files", href: "/app/cases", roles: ["owner", "operator", "service_team", "platform_admin"] },
    homePage: { href: "/app/agents", roles: ["owner", "service_team", "platform_admin"] },
    availability: "available",
    order: 1,
  },
  {
    id: "client_retention",
    name: "Client Retention",
    description: "Agents that keep your clients coming back.",
    recordKind: "customer",
    workPage: null,
    homePage: null,
    availability: "coming_soon",
    order: 2,
  },
];

export type AgentIdentity = {
  id: LiveAgentId;
  name: string;
  /** Title shown under the name. Replaces the old role sentence. */
  sublabel: string;
  /** Same words as sublabel, so older screens that read `role` show the title. */
  role: string;
  /** One sentence, shown on hover or tap. */
  description: string;
  /** A few plain sentences for the agent page and the Agent Library. */
  longDescription: string;
  glyph: AgentGlyph;
  accentKey: AgentAccentKey;
  /** Tailwind classes built from existing tokens. */
  accent: AgentAccent;
  /** What the agent never does on its own, shown where it reassures. */
  promise: string;
  /** Configuration sections that shape its behavior. */
  configSections: string[];
  /** Pipeline order on a lead. */
  order: number;
  /** The area it serves. Null means it works across areas (Compass). */
  area: string | null;
  /** Order within its area, and the stable sort position everywhere it is listed. */
  sort: number;
  worksOn: RecordKind[];
  availability: AgentAvailability;
  /** Plans that include it. Editable data, enforced by entitlement_check. */
  plans: { included: string[]; addOn: boolean; lockedReason: string };
  prerequisites: AgentPrerequisite[];
  /** What it does on its own, what it only suggests, what it never does without approval. */
  autonomy: { automatic: string[]; suggests: string[]; never: string[] };
  /** On for a workspace unless switched off (no staged activation). */
  startsOn: boolean;
  /** Runs are private to the person who asked (Compass conversations). */
  privateRuns: boolean;
  activitySource: AgentActivitySource;
  outputSource: AgentOutputSource;
};

const ALL_PLANS = ["private_access", "custom", "internal", "pilot"];
const LOCKED_REASON = "Not included on your current plan. Request access and the Vistrial team will confirm any plan change with you.";

function identity(entry: Omit<AgentIdentity, "role" | "accent">): AgentIdentity {
  return { ...entry, role: entry.sublabel, accent: AGENT_ACCENTS[entry.accentKey] };
}

export const AGENTS: Record<LiveAgentId, AgentIdentity> = {
  scribe: identity({
    id: "scribe",
    name: "Scribe",
    sublabel: "Sales Analyst",
    description: "Turns your calls, emails and texts into case files.",
    longDescription:
      "Scribe reads each sales call and conversation and keeps a case file for every lead: what they want, when, and what is still unclear. It asks you when it is unsure of a fact.",
    glyph: "scroll",
    accentKey: "brand",
    promise: "Scribe never contacts a lead and never changes your CRM.",
    configSections: ["qualification", "industry", "sources"],
    order: 1,
    area: "sales",
    sort: 2,
    worksOn: ["call", "case_file"],
    availability: "available",
    plans: { included: ALL_PLANS, addOn: false, lockedReason: LOCKED_REASON },
    prerequisites: ["call_source"],
    autonomy: {
      automatic: ["Builds and updates case files from your calls"],
      suggests: ["Asks you when it is unsure of a fact"],
      never: ["Contacts a lead", "Changes your CRM"],
    },
    startsOn: false,
    privateRuns: false,
    activitySource: "runs",
    outputSource: "activity",
  }),
  sentry: identity({
    id: "sentry",
    name: "Sentry",
    sublabel: "Pipeline Manager",
    description: "Watches your response times and flags leads waiting too long.",
    longDescription:
      "Sentry starts a reply window when a new lead arrives and watches it against your business hours. When a lead waits too long, it tells the right person on your team.",
    glyph: "shield",
    accentKey: "chart-2",
    promise: "Sentry only alerts your team. It never sends anything to a lead.",
    configSections: ["response", "escalation"],
    order: 2,
    area: "sales",
    sort: 1,
    worksOn: ["lead", "task"],
    availability: "available",
    plans: { included: ALL_PLANS, addOn: false, lockedReason: LOCKED_REASON },
    prerequisites: ["crm_connected"],
    autonomy: {
      automatic: ["Watches reply windows on new leads", "Alerts your team when a lead waits too long"],
      suggests: ["Suggests tasks you accept or dismiss"],
      never: ["Sends anything to a lead", "Chases leads from before you connected"],
    },
    startsOn: false,
    privateRuns: false,
    activitySource: "runs",
    outputSource: "windows",
  }),
  relay: identity({
    id: "relay",
    name: "Relay",
    sublabel: "Sales Development Rep",
    description: "Drafts your follow-ups and sends them once you approve.",
    longDescription:
      "Relay drafts follow-ups after calls and after missed reply windows, in your tone. Every draft waits for a person to approve it, and you send it from your CRM.",
    glyph: "send",
    accentKey: "info",
    promise: "Relay never sends anything. You approve each draft and send it from your CRM.",
    configSections: ["tone", "approval", "compliance"],
    order: 3,
    area: "sales",
    sort: 3,
    worksOn: ["lead"],
    availability: "available",
    plans: { included: ALL_PLANS, addOn: false, lockedReason: LOCKED_REASON },
    prerequisites: ["crm_connected"],
    autonomy: {
      automatic: ["Drafts follow-ups after calls and missed reply windows"],
      suggests: ["Every draft waits under Decisions waiting"],
      never: ["Sends a message. You approve each draft and send it from your CRM"],
    },
    startsOn: false,
    privateRuns: false,
    activitySource: "runs",
    outputSource: "requests",
  }),
  compass: identity({
    id: "compass",
    name: "Compass",
    sublabel: "Sales Director",
    description: "Answers your questions, coordinates the team, and reports what it did.",
    longDescription:
      "Compass answers questions about your leads, calls and numbers from the records you can already open. It can suggest a draft, a task, or a case file refresh, and nothing happens until you confirm.",
    glyph: "compass",
    accentKey: "chart-4",
    promise: "Compass only reads. It never sends a message, and nothing changes until you confirm a suggestion.",
    configSections: ["approval", "integrations"],
    order: 4,
    area: null,
    sort: 0,
    worksOn: ["lead", "case_file", "booking", "task"],
    availability: "available",
    plans: { included: ALL_PLANS, addOn: false, lockedReason: LOCKED_REASON },
    prerequisites: [],
    autonomy: {
      automatic: ["Answers questions from records you can open"],
      suggests: ["Drafts, tasks, and case file refreshes, only after you confirm"],
      never: ["Sends a message", "Changes anything without your tap"],
    },
    startsOn: false,
    privateRuns: true,
    activitySource: "runs",
    outputSource: "activity",
  }),
  assay: identity({
    id: "assay",
    name: "Assay",
    sublabel: "Lead Qualifier",
    description: "Scores your leads and puts your queue in order.",
    longDescription:
      "Assay scores every lead from what they did, what fits your business, and what was said on calls, and keeps your list in order. Each score shows the reasons that raised or lowered it.",
    glyph: "scale",
    accentKey: "chart-3",
    promise: "Assay only scores and orders your leads. It never contacts a lead, and past leads are scored quietly.",
    configSections: [],
    order: 5,
    area: "sales",
    sort: 4,
    worksOn: ["lead", "task"],
    availability: "available",
    plans: { included: ALL_PLANS, addOn: false, lockedReason: LOCKED_REASON },
    prerequisites: [],
    autonomy: {
      automatic: ["Scores leads and puts your list in order"],
      suggests: ["Who to work next, with the reasons"],
      never: ["Contacts a lead", "Alerts you about past leads. They are scored quietly"],
    },
    startsOn: true,
    privateRuns: false,
    activitySource: "scores",
    outputSource: "tiers",
  }),
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

/** Registry rows exactly as the migration seeds them. */
export function registrySeed(): { areas: Array<Record<string, unknown>>; agents: Array<Record<string, unknown>> } {
  return {
    areas: AGENT_AREAS.map((area) => ({
      id: area.id,
      name: area.name,
      description: area.description,
      record_kind: area.recordKind,
      work_page: area.workPage,
      home_page: area.homePage,
      availability: area.availability,
      sort: area.order,
    })),
    agents: LIVE_AGENT_IDS.map((id) => AGENTS[id]).map((agent) => ({
      id: agent.id,
      area_id: agent.area,
      name: agent.name,
      sublabel: agent.sublabel,
      description: agent.description,
      long_description: agent.longDescription,
      glyph: agent.glyph,
      accent: agent.accentKey,
      promise: agent.promise,
      works_on: agent.worksOn,
      availability: agent.availability,
      included_plans: agent.plans.included,
      add_on: agent.plans.addOn,
      locked_reason: agent.plans.lockedReason,
      prerequisites: agent.prerequisites,
      autonomy: agent.autonomy,
      config_sections: agent.configSections,
      sort: agent.sort,
      starts_on: agent.startsOn,
      private_runs: agent.privateRuns,
      activity_source: agent.activitySource,
      output_source: agent.outputSource,
    })),
  };
}
