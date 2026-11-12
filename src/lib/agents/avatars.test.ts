import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CATALOG } from "../../../convex/catalog";
import { AGENTS_WITH_AVATARS, agentAvatarSrc } from "./avatars";

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
});
