import { describe, expect, it } from "vitest";

import { HERO, NAV, SITE_DESCRIPTION } from "@/lib/marketing/copy";
import { FAQ, SECTIONS } from "@/lib/marketing/content";
import { PRICING_DISPLAY } from "@/lib/marketing/pricing";

describe("public landing copy", () => {
  it("uses the acquisition-record headline and a sign-in link to the app", () => {
    expect(HERO.headline).toBe("The acquisition record for high-ticket sales teams.");
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(40);
    expect(NAV.signInHref).toBe("https://app.vistrial.io/login");
    expect(NAV.links.map((link) => link.label)).toEqual([
      "How it works",
      "Agents",
      "Safety",
      "Pricing",
      "FAQ",
    ]);
  });

  it("answers the product questions without a payment step", () => {
    expect(FAQ.items.map((item) => item.q)).toEqual([
      "Does it replace my CRM?",
      "Which CRMs work with it?",
      "Will it text my leads on its own?",
      "What does it do with my data?",
      "How long does setup take?",
      "Who is Private Access for?",
      "What happens after I request access?",
      "Can I cancel?",
    ]);
    expect(PRICING_DISPLAY.custom.price).toBe("Let us talk.");
    expect(SECTIONS.hero).toBe(true);
  });
});
