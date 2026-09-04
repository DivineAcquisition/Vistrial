import { describe, expect, it } from "vitest";

import {
  ADVANCED_SETTINGS_PAGES,
  DA_CONSOLE_LINKS,
  FORSIGHT_PATH,
  MORE_NAV,
  PRIMARY_NAV,
  SETTINGS_TABS,
  advancedSettingsBreadcrumbs,
  advancedSettingsVisibleTo,
  landingPath,
  navVisibleTo,
  settingsTabActiveHref,
} from "@/lib/navigation";

describe("settings IA", () => {
  it("keeps day-to-day tabs to You, Notifications, Workspace, People, Integrations, and Advanced", () => {
    expect(SETTINGS_TABS.map((tab) => tab.label)).toEqual([
      "You",
      "Notifications",
      "Workspace",
      "People",
      "Integrations",
      "Advanced",
    ]);
  });

  it("does not put scoring, follow-up, data, or business on the main tabs", () => {
    const hrefs = SETTINGS_TABS.map((tab) => tab.href);
    expect(hrefs).not.toContain("/app/settings/scoring");
    expect(hrefs).not.toContain("/app/settings/follow-up");
    expect(hrefs).not.toContain("/app/settings/data");
    expect(hrefs).not.toContain("/app/settings/business-profile");
  });

  it("keeps integration diagnostics under the Integrations tab", () => {
    expect(settingsTabActiveHref("/app/settings/integrations")).toBe("/app/settings/integrations");
    expect(settingsTabActiveHref("/app/settings/integrations/advanced")).toBe(
      "/app/settings/integrations"
    );
  });

  it("highlights Advanced for specialist pages", () => {
    expect(settingsTabActiveHref("/app/settings/scoring")).toBe("/app/settings/advanced");
    expect(settingsTabActiveHref("/app/settings/business-profile")).toBe("/app/settings/advanced");
    expect(settingsTabActiveHref("/app/settings/organization")).toBe("/app/settings/organization");
  });

  it("lists the specialist pages behind Advanced", () => {
    expect(ADVANCED_SETTINGS_PAGES.map((page) => page.label)).toEqual([
      "Business",
      "Scoring",
      "Follow-up",
      "Data",
    ]);
    expect(advancedSettingsBreadcrumbs("Scoring", "/app/settings/scoring")[0]?.href).toBe(
      "/app/settings/advanced"
    );
  });

  it("does not put Agents on Advanced for anyone", () => {
    expect(advancedSettingsVisibleTo(false).map((page) => page.label)).toEqual([
      "Business",
      "Scoring",
      "Follow-up",
      "Data",
    ]);
    expect(advancedSettingsVisibleTo(true).map((page) => page.label)).toEqual([
      "Business",
      "Scoring",
      "Follow-up",
      "Data",
    ]);
  });
});

describe("Forsight and the client portal", () => {
  it("puts Forsight, Portal, To call, and More in the sidebar map", () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual(["Forsight", "Portal", "To call", "More"]);
    expect(PRIMARY_NAV.map((item) => item.href)).toEqual([
      FORSIGHT_PATH,
      "/portal",
      "/app/queue",
      "/app/more",
    ]);
  });

  it("shows the owner Forsight and Portal, and the setter the list", () => {
    const forsight = PRIMARY_NAV.find((item) => item.href === FORSIGHT_PATH);
    const portal = PRIMARY_NAV.find((item) => item.href === "/portal");
    const list = PRIMARY_NAV.find((item) => item.href === "/app/queue");
    if (!forsight || !portal || !list) throw new Error("missing primary nav");
    expect(navVisibleTo(forsight, "owner")).toBe(true);
    expect(navVisibleTo(forsight, "admin")).toBe(true);
    expect(navVisibleTo(forsight, "setter")).toBe(false);
    expect(navVisibleTo(portal, "owner")).toBe(true);
    expect(navVisibleTo(portal, "setter")).toBe(false);
    expect(navVisibleTo(list, "setter")).toBe(true);
    expect(navVisibleTo(list, "closer")).toBe(true);
    expect(navVisibleTo(list, "owner")).toBe(false);
    expect(navVisibleTo(list, "admin")).toBe(false);
  });

  it("does not put the door destinations or ops in the sidebar", () => {
    const hrefs = PRIMARY_NAV.map((item) => item.href);
    expect(hrefs).not.toContain("/app/ops");
    expect(hrefs).not.toContain("/app/log");
    expect(hrefs).not.toContain("/app/cases");
    expect(hrefs).not.toContain("/app/calls");
    expect(hrefs).not.toContain("/app/coaching");
    expect(hrefs).not.toContain("/app/activity");
    expect(hrefs).not.toContain("/app/reporting");
    expect(hrefs).not.toContain("/app/settings");
    expect(PRIMARY_NAV.map((item) => item.label)).not.toContain("Operator");
    expect(PRIMARY_NAV.map((item) => item.label)).not.toContain("Queue");
    expect(PRIMARY_NAV.map((item) => item.label)).not.toContain("Report");
    expect(PRIMARY_NAV.map((item) => item.label)).not.toContain("Tracking");
  });

  it("keeps the list behind More for the owner, who does not work leads", () => {
    const list = MORE_NAV.find((item) => item.href === "/app/queue");
    if (!list) throw new Error("To call missing from More");
    expect(navVisibleTo(list, "owner")).toBe(true);
  });

  it("keeps People, Calls, and Settings on the client door, and parks the rest", () => {
    expect(MORE_NAV.filter((item) => !item.platformAdminOnly).map((item) => item.href)).toEqual([
      "/app/queue",
      "/app/log",
      "/app/cases",
      "/app/calls",
      "/app/settings",
    ]);
    expect(MORE_NAV.map((item) => item.href)).not.toContain(FORSIGHT_PATH);
    const coaching = MORE_NAV.find((item) => item.href === "/app/coaching");
    const activity = MORE_NAV.find((item) => item.href === "/app/activity");
    const numbers = MORE_NAV.find((item) => item.href === "/app/reporting");
    if (!coaching || !activity || !numbers) throw new Error("parked tools missing from More");
    expect(navVisibleTo(coaching, "owner")).toBe(false);
    expect(navVisibleTo(activity, "owner")).toBe(false);
    expect(navVisibleTo(numbers, "owner")).toBe(false);
    expect(navVisibleTo(coaching, "owner", true)).toBe(true);
    expect(navVisibleTo(activity, "admin", true)).toBe(true);
  });

  it("keeps the DA console out of the client door", () => {
    expect(MORE_NAV.map((item) => item.href)).not.toContain("/app/ops");
    expect(DA_CONSOLE_LINKS.map((item) => item.href)).toContain("/app/ops");
    expect(DA_CONSOLE_LINKS.map((item) => item.href)).toContain("/app/settings/agents");
    expect(DA_CONSOLE_LINKS.map((item) => item.href)).toContain(`${FORSIGHT_PATH}/sources`);
    expect(DA_CONSOLE_LINKS.map((item) => item.href)).toContain(`${FORSIGHT_PATH}/workspaces`);
  });

  it("lands the owner and admin on Forsight, and everyone who works leads on the list", () => {
    expect(landingPath("portal", "owner")).toBe("/portal");
    expect(landingPath("operator", "owner")).toBe(FORSIGHT_PATH);
    expect(landingPath("operator", "admin")).toBe(FORSIGHT_PATH);
    expect(landingPath("operator", "setter")).toBe("/app/queue");
    expect(landingPath("operator", "closer")).toBe("/app/queue");
  });
});
