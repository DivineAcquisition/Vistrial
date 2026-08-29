import { describe, expect, it } from "vitest";

import {
  CASE_FILE,
  CRM,
  HERO,
  MOMENTS,
  OUTCOME,
  PROBLEM,
  SITE_DESCRIPTION,
  WAITLIST,
} from "@/lib/marketing/copy";

describe("landing copy", () => {
  it("keeps the specified headlines in argument order", () => {
    expect(HERO.headline).toBe("Give every closer the file before the call.");
    expect(PROBLEM.headline).toBe("Leads stall where context is missing.");
    expect(CASE_FILE.headline).toBe("One file per lead. Everything known, in one place.");
    expect(MOMENTS.headline).toBe("Where it sits in the workflow.");
    expect(OUTCOME.headline).toBe("The number we track is clients closed per hundred leads.");
    expect(CRM.headline).toBe("It runs on the CRM you already have.");
    expect(WAITLIST.headline).toBe("Request access.");
  });

  it("does not use the phrase AI-powered", () => {
    const blob = JSON.stringify({
      SITE_DESCRIPTION,
      HERO,
      PROBLEM,
      CASE_FILE,
      MOMENTS,
      OUTCOME,
      CRM,
      WAITLIST,
    });
    expect(blob).not.toMatch(/AI-powered/i);
    expect(blob).not.toMatch(/ai powered/i);
    expect(blob).not.toMatch(/HighLevel/i);
    expect(blob).not.toMatch(/\bGHL\b/);
  });

  it("uses existing product language for the hero eyebrow", () => {
    expect(SITE_DESCRIPTION).toContain(HERO.eyebrow);
  });

  it("keeps the honesty line unsoftened", () => {
    expect(OUTCOME.honesty).toBe(
      "We do not make the calls. Your team does. Vistrial makes sure every lead gets worked, and that whoever works it knows what they are walking into."
    );
  });

  it("names who this is not for, specifically", () => {
    expect(WAITLIST.notFor).toBe(
      "Not for businesses under roughly $8K a month, anything that closes without a conversation, or lead volume small enough to work by memory."
    );
  });

  it("keeps the headline accent as a substring of the headline", () => {
    expect(HERO.headline).toContain(HERO.headlineAccent);
  });
});
