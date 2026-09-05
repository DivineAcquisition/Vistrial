import { describe, expect, it } from "vitest";

import { FIRST_RUN, firstRunStorageKey } from "@/lib/first-run";

const BANNED = [
  /readiness/i,
  /\btrack\b/i,
  /speed.to.lead/i,
  /\bghost/i,
  /\bdispatch/i,
  /extraction/i,
  /\bcohort/i,
  /\bbacklog/i,
  /\bholdout/i,
  /\bbreach/i,
  /model version/i,
  /HighLevel/i,
  /\bGHL\b/,
];

describe("first-run explanation", () => {
  it("has a version for every role", () => {
    expect(Object.keys(FIRST_RUN).sort()).toEqual([
      "admin",
      "client_viewer",
      "closer",
      "da_operator",
      "owner",
      "setter",
    ]);
  });

  it("uses no internal vocabulary", () => {
    for (const [role, copy] of Object.entries(FIRST_RUN)) {
      const blob = `${copy.title} ${copy.body}`;
      for (const pattern of BANNED) {
        expect(blob, `${role} still uses ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("stores dismissal per role so a new job sees a new explanation", () => {
    expect(firstRunStorageKey("setter")).not.toBe(firstRunStorageKey("owner"));
  });
});
