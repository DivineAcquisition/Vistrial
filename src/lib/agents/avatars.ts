import { CATALOG } from "../../../convex/catalog";

/**
 * The face each agent wears in the app. The pictures are cut from the owner's avatar sheet and live in
 * `public/agents/`. An agent with no entry keeps its glyph, so adding an agent never breaks a screen.
 *
 * `avatar-01` is not assigned yet; it is kept for the Vistrial assistant.
 */
const AVATAR_FILE: Record<string, string> = {
  "growth-architect": "avatar-04",
  "campaign-execution": "avatar-03",
  "sales-conversion": "avatar-05",
  activation: "avatar-06",
  retention: "avatar-08",
  expansion: "avatar-07",
  "operations-intelligence": "avatar-02",
};

/** The picture's path for an agent, or null when it has none. */
export function agentAvatarSrc(slug: string | null | undefined): string | null {
  const file = slug ? AVATAR_FILE[slug] : undefined;
  return file ? `/agents/${file}.webp` : null;
}

export const AGENTS_WITH_AVATARS = Object.keys(AVATAR_FILE);

/** Some screens only know an agent by the name they print. The catalog's names are unique. */
export function agentSlugForName(name: string | null | undefined): string | null {
  if (!name) return null;
  const wanted = name.trim().toLowerCase();
  return CATALOG.find((agent) => agent.name.toLowerCase() === wanted)?.slug ?? null;
}
