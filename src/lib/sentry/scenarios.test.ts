import { describe, expect, it } from "vitest";

import { CONFIG_FIELDS } from "@/lib/config/registry";
import { SEED_TEMPLATES } from "@/lib/config/seeds";
import { runSentryScenarios } from "@/lib/sentry/scenarios";

const platform = Object.fromEntries(CONFIG_FIELDS.filter((field) => field.platformDefault !== undefined).map((field) => [field.key, field.platformDefault]));

describe("Sentry scenario check", () => {
  for (const template of SEED_TEMPLATES) {
    it(`passes every scenario for ${template.slug}`, () => {
      const results = runSentryScenarios({ ...platform, ...template.values });
      expect(results.length).toBeGreaterThan(20);
      expect(results.filter((row) => !row.passed)).toEqual([]);
    });
  }

  it("catches a clock that counts automated messages", () => {
    const results = runSentryScenarios({ ...platform, "response.first_touch_minutes": 15 });
    expect(results.find((row) => row.id === "system_touch")?.expected).toBe("missed");
  });
});
