import { describe, expect, it } from "vitest";

import { describeActivity } from "@/lib/workspaces/activity-labels";

describe("describeActivity", () => {
  it("names known actions", () => {
    expect(describeActivity("auth.signed_in")).toBe("Signed in");
    expect(describeActivity("workspace.entered")).toBe("Entered the workspace");
  });

  it("describes configuration changes by table and verb", () => {
    expect(describeActivity("config.follow_up_settings.update")).toBe("Changed follow up settings");
    expect(describeActivity("config.score_field_rules.insert")).toBe("Added score field rules");
  });

  it("falls back to readable words", () => {
    expect(describeActivity("draft.approved")).toBe("Draft approved");
  });
});
