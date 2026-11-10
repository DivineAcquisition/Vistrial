import { describe, expect, it } from "vitest";

import { newSessionLink, oldChatLink } from "./old-links";

const base = "/app/agents/growth-architect";
const query = (rows: Record<string, string>) => new URLSearchParams(rows);

describe("links from before the Chat tab", () => {
  it("opens a conversation in progress in Chat", () => {
    expect(oldChatLink(base, "market-intelligence", query({ intake: "abc123" }))).toBe(`${base}/work/chat?c=abc123`);
  });

  it("carries a filled-in question to Chat, preset for the tab's skill", () => {
    expect(oldChatLink(base, "offer-intelligence", query({ ask: "Analyse my offer & price" }))).toBe(`${base}/work/chat?skill=offer-intelligence&ask=Analyse%20my%20offer%20%26%20price`);
    expect(oldChatLink(base, "market-intelligence", query({ objective: "Who leads on price?" }))).toBe(`${base}/work/chat?skill=market-intelligence&ask=Who%20leads%20on%20price%3F`);
  });

  it("leaves a plain tab link alone", () => {
    expect(oldChatLink(base, "growth-diagnostics", query({}))).toBeNull();
    expect(oldChatLink(base, "offer-intelligence", query({ analysis: "a1" }))).toBeNull();
  });

  it("sends the old new-session page to Chat", () => {
    expect(newSessionLink(base, {})).toBe(`${base}/work/chat`);
    expect(newSessionLink(base, { intake: "abc123", objective: "ignored" })).toBe(`${base}/work/chat?c=abc123`);
    expect(newSessionLink(base, { objective: "Roofing leads", other: ["x"] })).toBe(`${base}/work/chat?skill=market-intelligence&ask=Roofing%20leads`);
  });
});
