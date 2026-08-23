import { describe, expect, it } from "vitest";

import {
  CASE_FILE,
  FAQ,
  GHL,
  HERO,
  MOMENTS,
  OUTCOME,
  PROBLEM,
  SITE_DESCRIPTION,
  WAITLIST,
} from "@/lib/marketing/copy";

describe("landing copy", () => {
  it("keeps the specified headlines in argument order", () => {
    expect(HERO.headline).toBe("Your team is calling leads they know nothing about.");
    expect(PROBLEM.headline).toBe("The leads are fine. The follow-up is where the money goes.");
    expect(CASE_FILE.headline).toBe("One file per lead. Everything known, in one place.");
    expect(MOMENTS.headline).toBe("Three moments where it changes the outcome.");
    expect(OUTCOME.headline).toBe("The number we track is clients closed per hundred leads.");
    expect(GHL.headline).toBe("It runs on the CRM you already have.");
    expect(WAITLIST.headline).toBe("This is private software.");
  });

  it("does not use the phrase AI-powered", () => {
    const blob = JSON.stringify({
      SITE_DESCRIPTION,
      HERO,
      PROBLEM,
      CASE_FILE,
      MOMENTS,
      OUTCOME,
      GHL,
      WAITLIST,
      FAQ,
    });
    expect(blob).not.toMatch(/AI-powered/i);
    expect(blob).not.toMatch(/ai powered/i);
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
    const item = FAQ.items.find((row) => row.question === "Who is this not for?");
    expect(item?.answer).toBe(
      "Businesses under roughly $8K a month, anyone selling something that closes without a conversation, and anyone whose lead volume is small enough to work by memory."
    );
  });
});
