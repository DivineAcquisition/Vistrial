import { describe, expect, it } from "vitest";

import {
  HIDDEN_NAV,
  isPlatformRoute,
  isShellItemActive,
  layoutKindForPath,
  shellNavigation,
} from "@/lib/shell/nav";

const labels = (role: Parameters<typeof shellNavigation>[0]["role"], extra?: Partial<Parameters<typeof shellNavigation>[0]>) =>
  shellNavigation({
    role,
    templateAccess: extra?.templateAccess ?? false,
    workspaceName: extra?.workspaceName,
  }).groups.flatMap((group) => group.items.map((item) => item.label));

describe("shell navigation", () => {
  it("shows an owner Overview, Case Files, Results, Agents, and Settings, with Forsight nested", () => {
    const nav = shellNavigation({ role: "owner", templateAccess: false });
    expect(labels("owner")).toEqual(["Overview", "Case Files", "Results", "Agents", "Settings"]);
    expect(nav.phone.map((item) => item.label)).toEqual(["Overview", "Case Files", "Results", "Settings"]);
    expect(nav.groups[0]?.items.find((item) => item.id === "results")?.children?.map((item) => item.label)).toEqual([
      "Forsight",
    ]);
    expect(labels("owner")).not.toContain("Approvals");
  });

  it("shows a member only Overview and Results", () => {
    expect(labels("member")).toEqual(["Overview", "Results"]);
    const nav = shellNavigation({ role: "member", templateAccess: false });
    expect(nav.groups[0]?.items.find((item) => item.id === "results")?.children ?? []).toEqual([]);
    expect(nav.phone.map((item) => item.label)).toEqual(["Overview", "Results"]);
    expect(nav.more).toEqual([]);
  });

  it("keeps an operator on My Leads, Today, Case Files, and Profile", () => {
    const nav = shellNavigation({ role: "operator", templateAccess: false });
    expect(labels("operator")).toEqual(["My Leads", "Today", "Case Files", "Profile"]);
    expect(nav.phone.map((item) => item.label)).toEqual(["My Leads", "Today", "Case Files", "Profile"]);
    expect(nav.more).toEqual([]);
    expect(labels("operator")).not.toContain("Settings");
    expect(labels("operator")).not.toContain("Results");
  });

  it("hides Templates from service team without template access", () => {
    expect(labels("service_team", { templateAccess: false })).not.toContain("Templates");
    expect(labels("service_team", { templateAccess: true })).toContain("Templates");
  });

  it("keeps the staff workspace group on every page, named for the current workspace", () => {
    const nav = shellNavigation({ role: "service_team", templateAccess: true, workspaceName: "Acme Roofing" });
    const here = nav.groups.find((group) => group.id === "here");
    expect(here?.label).toBe("Acme Roofing");
    expect(here?.items.map((item) => item.label)).toEqual(["Overview", "Case Files", "Results", "Agents", "Configuration"]);
    expect(nav.phone.map((item) => item.label)).toEqual(["Client Roster", "Templates", "Overview", "Case Files"]);
    expect(shellNavigation({ role: "service_team", templateAccess: true }).groups.find((g) => g.id === "here")?.label).toBe(
      "This workspace",
    );
  });

  it("gives a platform admin the team list plus the platform pages, and not Billing", () => {
    const labelsForAdmin = labels("platform_admin", { templateAccess: true });
    expect(labelsForAdmin).toContain("Client Roster");
    expect(labelsForAdmin).toContain("Templates");
    expect(labelsForAdmin).toContain("Activity Log");
    expect(labelsForAdmin).toContain("Platform Defaults");
    expect(labelsForAdmin).toContain("Layouts");
    expect(labelsForAdmin).toContain("Agent Health");
    expect(labelsForAdmin).not.toContain("Billing");
    expect(labelsForAdmin).not.toContain("Assignments");
  });

  it("keeps the hidden list for later prompts", () => {
    expect(HIDDEN_NAV.map((item) => item.id)).toEqual([
      "approvals",
      "member-cases",
      "member-approvals",
      "member-agents",
      "ask",
      "escalations",
      "operator-logs",
      "onboarding",
      "assignments",
      "billing",
      "template-library",
      "workspaces-duplicate",
    ]);
  });

  it("treats team, system, and the layout reference as platform routes", () => {
    expect(isPlatformRoute("/app/team")).toBe(true);
    expect(isPlatformRoute("/app/team/templates/platform")).toBe(true);
    expect(isPlatformRoute("/app/ops")).toBe(true);
    expect(isPlatformRoute("/app/layouts")).toBe(true);
    expect(isPlatformRoute("/app/home")).toBe(false);
    expect(isPlatformRoute("/portal")).toBe(false);
  });

  it("highlights member Overview on Home and Results on the portal", () => {
    const results = shellNavigation({ role: "member", templateAccess: false }).groups[0]?.items[1];
    const overview = shellNavigation({ role: "member", templateAccess: false }).groups[0]?.items[0];
    if (!results || !overview) throw new Error("member nav missing");
    expect(isShellItemActive("/portal", "", results)).toBe(true);
    expect(isShellItemActive("/portal", "", overview)).toBe(false);
    expect(isShellItemActive("/app/home", "", results)).toBe(false);
    expect(isShellItemActive("/app/home", "", overview)).toBe(true);
  });

  it("maps routes onto the eight layouts", () => {
    expect(layoutKindForPath("/app/settings/profile")).toBe("standard");
    expect(layoutKindForPath("/app/home")).toBe("dashboard");
    expect(layoutKindForPath("/app/cases")).toBe("list-detail");
    expect(layoutKindForPath("/app/cases/abc")).toBe("record");
    expect(layoutKindForPath("/app/team")).toBe("table");
    expect(layoutKindForPath("/app/onboarding")).toBe("workflow");
    expect(layoutKindForPath("/app/ask")).toBe("chat");
    expect(layoutKindForPath("/login")).toBe("message");
  });
});
