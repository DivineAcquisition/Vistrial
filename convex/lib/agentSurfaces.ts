/**
 * What each live agent offers in the app, as data: the skills its one chat routes to and the work tabs on
 * its page. Every place that used to assume the Strategist is the only agent with a chat or work tabs reads
 * this instead, so a second agent is one more row here (docs/rebuild/dealmaker.md, section 1).
 *
 * Pure: the server, the screens and the tests read the same table.
 */

import { GROWTH_ARCHITECT } from "../catalog";
import { CHAT_ROUTES } from "./chatRouting";
import { WORK_TABS, type WorkTab } from "./workTabs";

export type AgentSurface = {
  /** The skills the agent's chat hands a first message to, in the order the chat offers them. */
  chatRoutes: readonly string[];
  /** The work tabs on the agent's page, in order. */
  workTabs: readonly WorkTab[];
};

/** Agents with a chat and work tabs. An agent missing here has neither, whatever its status. */
export const AGENT_SURFACES: Readonly<Record<string, AgentSurface>> = {
  [GROWTH_ARCHITECT]: { chatRoutes: CHAT_ROUTES, workTabs: WORK_TABS },
};

/** The agent everything falls back to when an older record names none. */
export const DEFAULT_CHAT_AGENT = GROWTH_ARCHITECT;

export function surfaceOf(agentSlug: string | null | undefined): AgentSurface | null {
  return agentSlug && Object.hasOwn(AGENT_SURFACES, agentSlug) ? AGENT_SURFACES[agentSlug] : null;
}

/** Whether the agent has a chat at all. */
export function hasChat(agentSlug: string | null | undefined): boolean {
  return (surfaceOf(agentSlug)?.chatRoutes.length ?? 0) > 0;
}

/** Whether the agent's page has work tabs. */
export function hasWorkTabs(agentSlug: string | null | undefined): boolean {
  return (surfaceOf(agentSlug)?.workTabs.length ?? 0) > 0;
}

/** The skills this agent's chat routes to; empty for an agent with no chat. */
export function chatRoutesOf(agentSlug: string | null | undefined): readonly string[] {
  return surfaceOf(agentSlug)?.chatRoutes ?? [];
}

/** Whether `skillSlug` is work this agent's chat can start. */
export function isChatRouteOf(agentSlug: string | null | undefined, skillSlug: unknown): skillSlug is string {
  return typeof skillSlug === "string" && chatRoutesOf(agentSlug).includes(skillSlug);
}

/** The agent whose chat starts this skill, or null when no chat does. A skill belongs to one agent. */
export function chatAgentOf(skillSlug: string | null | undefined): string | null {
  if (!skillSlug) return null;
  for (const [agentSlug, surface] of Object.entries(AGENT_SURFACES)) if (surface.chatRoutes.includes(skillSlug)) return agentSlug;
  return null;
}
