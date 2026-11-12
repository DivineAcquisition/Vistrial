import { describe, expect, it } from "vitest";

import { chatPageOf } from "./chat-page";

describe("what the side chat panel is told about the page", () => {
  it("names the screen from the address", () => {
    expect(chatPageOf("/app")).toEqual({ page: "home", record: null });
    expect(chatPageOf("/app/tasks")).toEqual({ page: "tasks", record: null });
    expect(chatPageOf("/app/briefing?kind=trend")).toEqual({ page: "briefing", record: null });
    expect(chatPageOf("/app/settings")).toEqual({ page: "settings", record: null });
    expect(chatPageOf("/app/agents/growth-architect/work/offers")).toEqual({ page: "offers", record: null });
    expect(chatPageOf("/app/agents/growth-architect/work/chat")).toEqual({ page: "chats", record: null });
  });

  it("names the open record by kind and id only", () => {
    expect(chatPageOf("/app/assets/k17abc123def")).toEqual({ page: "asset", record: { kind: "asset", id: "k17abc123def" } });
    expect(chatPageOf("/app/agents/growth-architect/work/research/j57session01")).toEqual({ page: "research", record: { kind: "project", id: "j57session01" } });
    expect(chatPageOf("/app/agents/growth-architect/work/diagnostics/j57session02")).toEqual({ page: "diagnostics", record: { kind: "project", id: "j57session02" } });
    // Not an id: nothing is passed on.
    expect(chatPageOf("/app/assets/<script>")).toEqual({ page: "asset", record: null });
  });

  it("says nothing for a screen it does not know, or outside the app", () => {
    expect(chatPageOf("/app/leads")).toEqual({ page: null, record: null });
    expect(chatPageOf("/pricing")).toEqual({ page: null, record: null });
  });
});
