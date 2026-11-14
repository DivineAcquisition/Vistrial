import { SKILL_TAB, type WorkTab } from "../../../convex/lib/workTabs";
import type { RailAgent } from "@/lib/shell/rail";

/** The customer journey the sidebar groups agents by. */
export const JOURNEY_TABS = [
  { value: "attract", label: "Attract" },
  { value: "convert", label: "Convert" },
  { value: "keep", label: "Keep" },
] as const;

export type JourneyTab = (typeof JOURNEY_TABS)[number]["value"];

/** Each catalog lifecycle and the stage of the journey it belongs to. "Run" (operations) belongs to none. */
const TAB_BY_LIFECYCLE: Record<string, JourneyTab> = {
  attract: "attract",
  convert: "convert",
  onboard: "keep",
  keep: "keep",
  grow: "keep",
};

export function journeyTabOf(lifecycle: string | null | undefined): JourneyTab | null {
  return lifecycle ? (TAB_BY_LIFECYCLE[lifecycle.toLowerCase()] ?? null) : null;
}

export function isJourneyTab(value: unknown): value is JourneyTab {
  return JOURNEY_TABS.some((tab) => tab.value === value);
}

/**
 * The sidebar tab an agent sits under. It is its journey stage, except that Operator
 * ("Run"), which belongs to no stage, sits under Convert. The public page keeps its own grouping.
 */
export function sidebarTabOf(lifecycle: string | null | undefined): JourneyTab | null {
  return journeyTabOf(lifecycle) ?? (lifecycle?.toLowerCase() === "run" ? "convert" : null);
}

export function agentsForTab(agents: RailAgent[], tab: JourneyTab) {
  return agents
    .filter((agent) => sidebarTabOf(agent.lifecycle) === tab)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Agents with no journey tab. None today: every catalog lifecycle has one. Kept so a new lifecycle still shows somewhere. */
export function agentsOffJourney(agents: RailAgent[]) {
  return agents.filter((agent) => sidebarTabOf(agent.lifecycle) === null);
}

const WORK_TAB_LABEL: Record<WorkTab, string> = { research: "Research", offers: "Offers", diagnostics: "Diagnostics" };

/**
 * A live agent's work tabs, one per live skill that has a workspace, named for the outcome: Research
 * (Market Intelligence), Offers (Offer Intelligence), Diagnostics (Growth Diagnostics). No coming-soon tabs.
 */
export function workTabsFor(agent: RailAgent) {
  if (agent.status !== "live") return [];
  return liveSkills(agent).flatMap((skill) => {
    const tab = SKILL_TAB[skill.slug];
    return tab ? [{ tab, skillSlug: skill.slug, label: WORK_TAB_LABEL[tab], href: `/app/agents/${agent.slug}/work/${tab}` }] : [];
  });
}

export type AgentTab = { tab: "chat" | "creative" | "pages" | WorkTab; skillSlug: string | null; label: string; href: string };

/** Where business memory lives: in Settings, for the whole organization, not under one agent. */
export const MEMORY_HREF = "/app/settings?section=memory";

/** The three places a person starts from, above the agents. */
export const MAIN_ITEMS = [
  { key: "home", label: "Home", href: "/app" },
  { key: "tasks", label: "Tasks", href: "/app/tasks" },
  { key: "briefing", label: "Briefing", href: "/app/briefing" },
] as const;

/** Where the one chat with an agent lives. Only an agent with a work tab has one; nothing may assume every agent does. */
export function chatHref(agentSlug: string) {
  return `/app/agents/${agentSlug}/work/chat`;
}

/** Where the brand kits live: in Settings, one for the business and one per client. Creative work reads them. */
export const BRAND_HREF = "/app/settings?section=brand";

const CREATIVE_SKILL = "creative-production";
const PAGES_SKILL = "landing-page-teardown";

/**
 * The tabs under an agent in the sidebar: Chat first (the one place to talk to it), then its work tabs,
 * then Creative and Pages when those skills are live. Brands live in Settings (BRAND_HREF). An agent with no work tab has no chat either, so it has no tabs.
 */
export function agentTabs(agent: RailAgent): AgentTab[] {
  const work = workTabsFor(agent);
  if (work.length === 0) return [];
  // Creative Production has its own workspace: it starts from a form, not from the chat, so it is not a work tab above.
  const creative: AgentTab[] = liveSkills(agent).some((skill) => skill.slug === CREATIVE_SKILL)
    ? [{ tab: "creative", skillSlug: CREATIVE_SKILL, label: "Creative", href: `/app/agents/${agent.slug}/work/creative` }]
    : [];
  // Landing page teardowns start from a form too: links to read, with the plan and budget shown first.
  const pages: AgentTab[] = liveSkills(agent).some((skill) => skill.slug === PAGES_SKILL)
    ? [{ tab: "pages", skillSlug: PAGES_SKILL, label: "Pages", href: `/app/agents/${agent.slug}/work/pages` }]
    : [];
  return [{ tab: "chat", skillSlug: null, label: "Chat", href: chatHref(agent.slug) }, ...work, ...creative, ...pages];
}

/** The skills a person can start today. */
export function liveSkills(agent: RailAgent) {
  return (agent.skills ?? []).filter((skill) => skill.status === "available").sort((a, b) => a.sort - b.sort);
}

export type AgentActivity = { working: number; waiting: number };

export type AgentDot = "working" | "waiting" | "idle";

/** Waiting on a person wins over working: it is the one that needs them. */
export function agentDot(activity: AgentActivity | undefined): AgentDot {
  if (activity?.waiting) return "waiting";
  if (activity?.working) return "working";
  return "idle";
}

/** A glyph and accent per catalog agent, from the shared agent mark. */
export const AGENT_MARK: Record<string, { glyph: "compass" | "send" | "scale" | "spark" | "shield" | "scroll"; accent: "brand" | "chart-2" | "info" | "chart-4" | "chart-3" | "neutral" }> = {
  "growth-architect": { glyph: "compass", accent: "brand" },
  "campaign-execution": { glyph: "send", accent: "info" },
  "sales-conversion": { glyph: "scale", accent: "chart-4" },
  activation: { glyph: "spark", accent: "chart-2" },
  retention: { glyph: "shield", accent: "chart-3" },
  expansion: { glyph: "scroll", accent: "chart-2" },
};

/** The first lifecycle tab that holds a live agent; otherwise Attract. */
export function defaultTab(agents: RailAgent[]): JourneyTab {
  for (const tab of JOURNEY_TABS) {
    if (agentsForTab(agents, tab.value).some((agent) => agent.status === "live")) return tab.value;
  }
  return "attract";
}

/** The tab that holds the agent whose page is open, so the sidebar shows where a person is. */
export function tabForPath(pathname: string, agents: RailAgent[]): JourneyTab | null {
  const match = pathname.match(/^\/app\/agents\/([^/]+)/);
  if (!match) return null;
  const agent = agents.find((row) => row.slug === match[1]);
  return agent ? sidebarTabOf(agent.lifecycle) : null;
}
