/**
 * How the app names an agent's work. Inside the app a skill is part of its agent and is never named
 * ("Market Intelligence" stays on the public site and future agent pages): work is labelled by the agent
 * and by what it does or hands back, "Strategist · Research", "a market report". One place for every
 * screen, message and email, read from the catalog, so a new agent's skills follow the same rule.
 */
import { CATALOG } from "../catalog";

const AGENTS = new Map(CATALOG.map((agent) => [agent.slug, agent]));
const SKILLS = new Map(CATALOG.flatMap((agent) => agent.skills.map((skill) => [skill.slug, { ...skill, agentSlug: agent.slug }] as const)));

/** The agent's name today: "Strategist". An unknown slug reads "An agent". */
export function agentName(agentSlug: string | null | undefined): string {
  return (agentSlug && AGENTS.get(agentSlug)?.name) || "An agent";
}

/** The work, in a word or two: "Research". An unknown or missing skill reads "Work". */
export function workLabel(skillSlug: string | null | undefined): string {
  return (skillSlug && SKILLS.get(skillSlug)?.work) || "Work";
}

/** What the work hands back, for a sentence: "a market report". */
export function workOutput(skillSlug: string | null | undefined): string {
  return (skillSlug && SKILLS.get(skillSlug)?.output) || "a result";
}

/** The agent this skill belongs to, by its slug. */
export function agentOfSkill(skillSlug: string | null | undefined): string | null {
  return (skillSlug && SKILLS.get(skillSlug)?.agentSlug) || null;
}

/** The label work carries everywhere in the app: "Strategist · Research". The agent alone when the work is not known. */
export function agentWork(agentSlug: string | null | undefined, skillSlug: string | null | undefined): string {
  const agent = agentName(agentSlug ?? agentOfSkill(skillSlug));
  return skillSlug && SKILLS.has(skillSlug) ? `${agent} · ${workLabel(skillSlug)}` : agent;
}
