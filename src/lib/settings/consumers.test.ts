import { describe, expect, it } from "vitest";

import { SETTINGS_CONSUMERS } from "@/lib/settings/consumers";

describe("settings consumers", () => {
  it("lists a reader for every stored setting this prompt touches", () => {
    expect(SETTINGS_CONSUMERS.length).toBeGreaterThan(10);
    for (const row of SETTINGS_CONSUMERS) {
      expect(row.readBy.length).toBeGreaterThan(0);
    }
  });
});
