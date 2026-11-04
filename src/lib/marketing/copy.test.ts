import { describe, expect, it } from "vitest";

import { HERO, NAV, SITE_DESCRIPTION } from "@/lib/marketing/copy";
import { FAQ, SECTIONS } from "@/lib/marketing/content";
import { PRICING_DISPLAY } from "@/lib/marketing/pricing";

describe("public landing copy", () => {
  it("uses the agentic-workforce headline and a sign-in link to the app", () => {
    expect(HERO.headline).toBe("The agentic workforce for business growth.");
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(40);
    expect(NAV.signInHref).toBe("https://app.vistrial.io/login");
    expect(NAV.links.map((link) => link.label)).toEqual([
      "How it works",
      "Growth Architect",
      "Agents",
      "Pricing",
      "FAQ",
    ]);
  });

  it("answers the product questions without a payment step", () => {
    expect(FAQ.items.map((item) => item.q)).toEqual([
      "What is Growth Architect?",
      "Where does the research come from?",
      "Can I trust what it says?",
      "Will it post or spend on its own?",
      "What does it do with my data?",
      "Who is Private Access for?",
      "What happens after I request access?",
      "Can I cancel?",
    ]);
    expect(PRICING_DISPLAY.custom.price).toBe("Let us talk.");
    expect(SECTIONS.hero).toBe(true);
  });
});
