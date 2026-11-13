import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOG } from "../../../convex/catalog";
import { AGENTS_WITH_AVATARS, agentAvatarSrc, agentSlugForName } from "./avatars";

describe("agent avatars", () => {
  it("gives every catalog agent its own picture, and the file is there", () => {
    const seen = new Set<string>();
    for (const agent of CATALOG) {
      const src = agentAvatarSrc(agent.slug);
      expect(src, agent.slug).not.toBeNull();
      expect(seen.has(src!), `${agent.slug} shares a picture`).toBe(false);
      seen.add(src!);
      expect(existsSync(join(process.cwd(), "public", src!)), src!).toBe(true);
    }
  });

  it("names no agent that is not in the catalog, and has none for an unknown one", () => {
    const slugs = new Set(CATALOG.map((agent) => agent.slug));
    for (const slug of AGENTS_WITH_AVATARS) expect(slugs.has(slug), slug).toBe(true);
    expect(agentAvatarSrc("no-such-agent")).toBeNull();
    expect(agentAvatarSrc(null)).toBeNull();
  });

  it("finds an agent by the name a screen prints", () => {
    for (const agent of CATALOG) expect(agentSlugForName(agent.name)).toBe(agent.slug);
    expect(agentSlugForName("  strategist ")).toBe("growth-architect");
    expect(CATALOG.map((agent) => agent.name)).toEqual(["Strategist", "Marketer", "Dealmaker", "Starter", "Keeper", "Expander", "Operator"]);
    // A name saved before the agents were renamed still finds the same agent.
    expect(agentSlugForName("  growth architect ")).toBe("growth-architect");
    expect(agentSlugForName("Retention")).toBe("retention");
    expect(agentSlugForName("Someone else")).toBeNull();
    expect(agentSlugForName(undefined)).toBeNull();
  });
});
