import { describe, expect, it } from "vitest";

import {
  ADVANCED_SETTINGS_PAGES,
  SETTINGS_TABS,
  advancedSettingsBreadcrumbs,
  settingsTabActiveHref,
} from "@/lib/navigation";

describe("settings IA", () => {
  it("keeps day-to-day tabs to You, Notifications, Workspace, People, and Advanced", () => {
    expect(SETTINGS_TABS.map((tab) => tab.label)).toEqual([
      "You",
      "Notifications",
      "Workspace",
      "People",
      "Advanced",
    ]);
  });

  it("does not put scoring, follow-up, integrations, data, or business on the main tabs", () => {
    const hrefs = SETTINGS_TABS.map((tab) => tab.href);
    expect(hrefs).not.toContain("/app/settings/scoring");
    expect(hrefs).not.toContain("/app/settings/follow-up");
    expect(hrefs).not.toContain("/app/settings/integrations");
    expect(hrefs).not.toContain("/app/settings/data");
    expect(hrefs).not.toContain("/app/settings/business-profile");
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
      "Integrations",
      "Data",
    ]);
    expect(advancedSettingsBreadcrumbs("Scoring", "/app/settings/scoring")[0]?.href).toBe(
      "/app/settings/advanced"
    );
  });
});
