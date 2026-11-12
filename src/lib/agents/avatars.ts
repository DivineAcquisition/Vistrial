/**
 * The face each agent wears in the app. The pictures are cut from the owner's avatar sheet and live in
 * `public/agents/`. An agent with no entry keeps its glyph, so adding an agent never breaks a screen.
 *
 * `avatar-07` and `avatar-08` are not assigned yet.
 */
const AVATAR_FILE: Record<string, string> = {
  "growth-architect": "avatar-02",
  "campaign-execution": "avatar-01",
  "sales-conversion": "avatar-03",
  activation: "avatar-04",
  retention: "avatar-06",
  expansion: "avatar-09",
  "operations-intelligence": "avatar-05",
};

/** The picture's path for an agent, or null when it has none. */
export function agentAvatarSrc(slug: string | null | undefined): string | null {
  const file = slug ? AVATAR_FILE[slug] : undefined;
  return file ? `/agents/${file}.webp` : null;
}

export const AGENTS_WITH_AVATARS = Object.keys(AVATAR_FILE);
