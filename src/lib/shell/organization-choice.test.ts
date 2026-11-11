import { describe, expect, it } from "vitest";

import { chooseOrganization } from "./organization-choice";

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
