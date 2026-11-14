/**
 * The per-agent table that replaced "the Strategist is the only agent with a chat". Behaviour is unchanged:
 * the Strategist keeps its three chat routes and three work tabs; every other catalog agent has neither.
 */
import { describe, expect, it } from "vitest";

import { CATALOG, GROWTH_ARCHITECT } from "../catalog";
import { AGENT_SURFACES, DEFAULT_CHAT_AGENT, chatAgentOf, chatRoutesOf, hasChat, hasWorkTabs, isChatRouteOf, surfaceOf } from "./agentSurfaces";
import { CHAT_ROUTES } from "./chatRouting";
import { WORK_TABS } from "./workTabs";

describe("agent surfaces", () => {
  it("gives the Strategist exactly the chat and tabs it had", () => {
    expect(DEFAULT_CHAT_AGENT).toBe(GROWTH_ARCHITECT);
    expect(chatRoutesOf(GROWTH_ARCHITECT)).toEqual([...CHAT_ROUTES]);
    expect(surfaceOf(GROWTH_ARCHITECT)?.workTabs).toEqual([...WORK_TABS]);
    expect(hasChat(GROWTH_ARCHITECT)).toBe(true);
    expect(hasWorkTabs(GROWTH_ARCHITECT)).toBe(true);
  });

  it("gives every other agent, and nonsense, no chat and no tabs", () => {
    for (const agent of CATALOG.filter((row) => row.slug !== GROWTH_ARCHITECT)) {
      expect(hasChat(agent.slug), agent.slug).toBe(false);
      expect(hasWorkTabs(agent.slug), agent.slug).toBe(false);
      expect(chatRoutesOf(agent.slug)).toEqual([]);
    }
    for (const slug of [undefined, null, "", "toString", "constructor", "__proto__"]) {
      expect(surfaceOf(slug)).toBeNull();
      expect(hasChat(slug)).toBe(false);
    }
  });

  it("maps each chat skill to the one agent whose chat starts it", () => {
    for (const skill of CHAT_ROUTES) {
      expect(chatAgentOf(skill)).toBe(GROWTH_ARCHITECT);
      expect(isChatRouteOf(GROWTH_ARCHITECT, skill)).toBe(true);
      expect(isChatRouteOf("sales-conversion", skill)).toBe(false);
    }
    expect(chatAgentOf("creative-production")).toBeNull();
    expect(chatAgentOf(undefined)).toBeNull();
    expect(isChatRouteOf(GROWTH_ARCHITECT, 3)).toBe(false);
  });

  it("only lists agents that are in the catalog, and no skill is routed by two agents", () => {
    const known = new Set(CATALOG.map((row) => row.slug));
    const seen = new Set<string>();
    for (const [slug, surface] of Object.entries(AGENT_SURFACES)) {
      expect(known.has(slug), slug).toBe(true);
      for (const skill of surface.chatRoutes) {
        expect(seen.has(skill), skill).toBe(false);
        seen.add(skill);
      }
    }
  });
});
