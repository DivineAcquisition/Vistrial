import { describe, expect, it } from "vitest";

import {
  ADVANCED_SETTINGS_PAGES,
  PRIMARY_NAV,
  SETTINGS_TABS,
  advancedSettingsBreadcrumbs,
  advancedSettingsVisibleTo,
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

  it("does not put Operator in the client sidebar", () => {
    expect(PRIMARY_NAV.map((item) => item.href)).not.toContain("/app/ops");
    expect(PRIMARY_NAV.map((item) => item.label)).not.toContain("Operator");
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
