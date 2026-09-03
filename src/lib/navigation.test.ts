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

describe("the three screens", () => {
  it("puts only To call, Report, and More in the sidebar", () => {
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual(["To call", "Report", "More"]);
    expect(PRIMARY_NAV.map((item) => item.href)).toEqual(["/app/queue", "/portal", "/app/more"]);
  });

  it("keeps the list off the owner's sidebar and the report off the setter's", () => {
    const list = PRIMARY_NAV.find((item) => item.href === "/app/queue");
    const report = PRIMARY_NAV.find((item) => item.href === "/portal");
    if (!list || !report) throw new Error("missing primary nav");
    expect(navVisibleTo(list, "setter")).toBe(true);
    expect(navVisibleTo(list, "closer")).toBe(true);
    expect(navVisibleTo(list, "owner")).toBe(false);
    expect(navVisibleTo(report, "owner")).toBe(true);
    expect(navVisibleTo(report, "setter")).toBe(false);
  });

  it("does not put the door destinations, ops, or tracking in the sidebar", () => {
    const hrefs = PRIMARY_NAV.map((item) => item.href);
    expect(hrefs).not.toContain("/app/ops");
    expect(hrefs).not.toContain("/app/log");
    expect(hrefs).not.toContain("/app/cases");
    expect(hrefs).not.toContain("/app/calls");
    expect(hrefs).not.toContain("/app/coaching");
    expect(hrefs).not.toContain("/app/activity");
    expect(hrefs).not.toContain("/app/reporting");
    expect(hrefs).not.toContain(FORSIGHT_PATH);
    expect(hrefs).not.toContain("/app/settings");
    expect(PRIMARY_NAV.map((item) => item.label)).not.toContain("Operator");
    expect(PRIMARY_NAV.map((item) => item.label)).not.toContain("Forsight");
    expect(PRIMARY_NAV.map((item) => item.label)).not.toContain("Queue");
  });

  it("keeps the list behind More for the owner, who does not work leads", () => {
    const list = MORE_NAV.find((item) => item.href === "/app/queue");
    if (!list) throw new Error("To call missing from More");
    expect(navVisibleTo(list, "owner")).toBe(true);
  });

  it("keeps People, Calls, Tracking, and Settings behind More", () => {
    expect(MORE_NAV.map((item) => item.href)).toEqual([
      "/app/queue",
      "/app/log",
      "/app/cases",
      "/app/calls",
      "/app/coaching",
      "/app/activity",
      "/app/reporting",
      FORSIGHT_PATH,
      "/app/settings",
    ]);
    const tracking = MORE_NAV.find((item) => item.href === FORSIGHT_PATH);
    if (!tracking) throw new Error("Tracking missing from More");
    expect(tracking.label).toBe("Tracking");
    expect(navVisibleTo(tracking, "owner")).toBe(true);
    expect(navVisibleTo(tracking, "setter")).toBe(false);
  });

  it("keeps the DA console out of the client door", () => {
    expect(MORE_NAV.map((item) => item.href)).not.toContain("/app/ops");
    expect(DA_CONSOLE_LINKS.map((item) => item.href)).toContain("/app/ops");
    expect(DA_CONSOLE_LINKS.map((item) => item.href)).toContain("/app/settings/agents");
    expect(DA_CONSOLE_LINKS.map((item) => item.href)).toContain(`${FORSIGHT_PATH}/sources`);
  });

  it("lands the owner on the report and everyone who works leads on the list", () => {
    expect(landingPath("portal", "owner")).toBe("/portal");
    expect(landingPath("operator", "owner")).toBe("/portal");
    expect(landingPath("operator", "setter")).toBe("/app/queue");
    expect(landingPath("operator", "closer")).toBe("/app/queue");
    expect(landingPath("operator", "admin")).toBe("/app/queue");
  });
});
