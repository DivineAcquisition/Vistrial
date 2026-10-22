import { describe, expect, it } from "vitest";

import { canExport, canSeeMoney, canSeePeople, canSeeResults, mayOpenBilling } from "@/lib/auth/portal-access";
import { settingsTabsVisibleTo } from "@/lib/navigation";

const member = { canSeeMoney: false, canExport: false };
const granted = { canSeeMoney: true, canExport: true };

describe("portal access", () => {
  it("keeps operators off results, money, people, export, and billing", () => {
    const who = { workspaceRole: "operator" as const, member };
    expect(canSeeResults(who)).toBe(false);
    expect(canSeeMoney(who)).toBe(false);
    expect(canSeePeople(who)).toBe(false);
    expect(canExport(who)).toBe(false);
    expect(mayOpenBilling(who)).toBe(false);
    expect(settingsTabsVisibleTo("operator").map((tab) => tab.href)).toEqual([
      "/app/settings/profile",
      "/app/settings/notifications",
      "/app/settings/cookies",
      "/app/settings/history",
    ]);
  });

  it("lets a Member see money and export only when granted", () => {
    expect(canSeeMoney({ workspaceRole: "member", member })).toBe(false);
    expect(canExport({ workspaceRole: "member", member })).toBe(false);
    expect(canSeeMoney({ workspaceRole: "member", member: granted })).toBe(true);
    expect(canExport({ workspaceRole: "member", member: granted })).toBe(true);
    expect(canSeePeople({ workspaceRole: "member" })).toBe(false);
    expect(mayOpenBilling({ workspaceRole: "member" })).toBe(false);
  });

  it("opens billing to owners and staff roles, and money to them without a grant", () => {
    for (const workspaceRole of ["owner", "platform_admin", "service_team"] as const) {
      expect(mayOpenBilling({ workspaceRole })).toBe(true);
      expect(canSeeMoney({ workspaceRole, member })).toBe(true);
      expect(canSeePeople({ workspaceRole })).toBe(true);
    }
  });
});
