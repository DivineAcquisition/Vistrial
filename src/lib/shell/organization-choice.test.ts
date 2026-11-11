import { describe, expect, it } from "vitest";

import { chooseOrganization, validScope } from "./organization-choice";

const organizations = [{ workspaceId: "w1" }, { workspaceId: "w2" }];

describe("which organization opens", () => {
  it("opens the remembered one while the person can still open it", () => {
    expect(chooseOrganization(organizations, "w2")).toEqual({ workspaceId: "w2" });
  });
  it("falls back to the first when the remembered one is gone or nothing is remembered", () => {
    expect(chooseOrganization(organizations, "w9")).toEqual({ workspaceId: "w1" });
    expect(chooseOrganization(organizations, null)).toEqual({ workspaceId: "w1" });
  });
  it("opens nothing for a person with no organization", () => {
    expect(chooseOrganization([], "w1")).toBeNull();
  });
});

describe("the client picker's remembered choice", () => {
  const clients = [{ id: "c1" }, { id: "c2" }];
  it("keeps a client the person can still see", () => {
    expect(validScope("c2", clients, true)).toBe("c2");
  });
  it("falls back to everything when the client is gone or was never theirs", () => {
    expect(validScope("c9", clients, true)).toBe("all");
    expect(validScope("all", clients, true)).toBe("all");
  });
  it("only offers the organization itself to someone who may see its own work", () => {
    expect(validScope("own", clients, true)).toBe("own");
    expect(validScope("own", clients, false)).toBe("all");
  });
});
