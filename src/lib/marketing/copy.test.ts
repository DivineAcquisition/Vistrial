import { describe, expect, it } from "vitest";

import {
  AUDIT,
  CASE_FILE,
  FAQ,
  HERO,
  OUTCOME,
  PROBLEM,
  SITE_DESCRIPTION,
  TOOLS,
  WHAT_IT_DOES,
  WHO,
} from "@/lib/marketing/copy";
import { DEMO_CASE } from "@/lib/marketing/demo-case";

const landingBlob = JSON.stringify({
  SITE_DESCRIPTION,
  HERO,
  PROBLEM,
  WHAT_IT_DOES,
  TOOLS,
  OUTCOME,
  WHO,
  AUDIT,
  FAQ,
  CASE_FILE,
  DEMO_CASE,
});

describe("landing copy", () => {
  it("keeps the specified headlines in argument order", () => {
    expect(HERO.headline).toBe("Every lead gets worked. Every call gets remembered.");
    expect(PROBLEM.headline).toBe("The leads are fine. What happens after isn't.");
    expect(WHAT_IT_DOES.headline).toBe(
      "One system that tracks who to call, what to say, and what happened.",
    );
    expect(TOOLS.headline).toBe("It works with the tools you already use.");
    expect(OUTCOME.headline).toBe("We track one number: how many of your leads become clients.");
    expect(WHO.headline).toBe("Built for teams that sell on a conversation.");
    expect(AUDIT.headline).toBe("Find out what you're leaking.");
  });

  it("does not name a CRM, platform, or industry", () => {
    expect(landingBlob).not.toMatch(/AI-powered/i);
    expect(landingBlob).not.toMatch(/ai powered/i);
    expect(landingBlob).not.toMatch(/HighLevel/i);
    expect(landingBlob).not.toMatch(/LeadConnector/i);
    expect(landingBlob).not.toMatch(/\bGHL\b/);
    expect(landingBlob).not.toMatch(/coach/i);
    expect(landingBlob).not.toMatch(/agenc/i);
    expect(landingBlob).not.toMatch(/consultant/i);
  });

  it("keeps the honesty line unsoftened", () => {
    expect(OUTCOME.honesty).toBe(
      "We don't make the calls. Your team does. Vistrial makes sure every lead gets worked, and that whoever works it knows what they're walking into.",
    );
  });

  it("names who this is not for, without a dollar floor", () => {
    expect(WHO.notFor).toBe(
      "If your product sells itself with no call involved, or your lead volume is small enough to track from memory, you don't need this yet.",
    );
  });

  it("keeps the headline accent as a substring of the headline", () => {
    expect(HERO.headline).toContain(HERO.headlineAccent);
  });

  it("uses the audit as the only public CTA", () => {
    expect(HERO.primaryCta).toMatch(/Lead Leak Audit/);
    expect(AUDIT.cta).toBe("Book the audit");
  });
});

describe("landing type recipes", () => {
  it("sets marketing titles in the display serif", async () => {
    const { marketingDisplayTitle, marketingHeroTitle, marketingSectionTitle } =
      await import("@/lib/marketing/ui");
    expect(marketingDisplayTitle).toContain("font-display");
    expect(marketingHeroTitle).toContain("font-display");
    expect(marketingSectionTitle).toContain("font-display");
  });
});
