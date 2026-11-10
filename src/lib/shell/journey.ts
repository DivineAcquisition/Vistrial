import { SKILL_TAB, type WorkTab } from "../../../convex/lib/workTabs";
import type { RailAgent } from "@/lib/shell/rail";

/** The customer journey the sidebar groups agents by. */
export const JOURNEY_TABS = [
  { value: "attract", label: "Attract" },
  { value: "convert", label: "Convert" },
  { value: "keep", label: "Keep" },
] as const;

export type JourneyTab = (typeof JOURNEY_TABS)[number]["value"];

/** Each catalog lifecycle and the tab it sits under. "Run" (operations) sits in the Library instead. */
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

export function agentsForTab(agents: RailAgent[], tab: JourneyTab) {
  return agents
    .filter((agent) => journeyTabOf(agent.lifecycle) === tab)
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
}

/** Agents with no journey tab (Operations Intelligence), shown in the Library. */
export function agentsOffJourney(agents: RailAgent[]) {
  return agents.filter((agent) => journeyTabOf(agent.lifecycle) === null);
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
  return agent ? journeyTabOf(agent.lifecycle) : null;
}
