import { describe, expect, it } from "vitest";
import { creditCount, creditWords, creditsForCost, dollarWords, wholeCredits } from "./credits";
import { EXTRA_ORG, PLAN, priceFor } from "./billing";

describe("credits in words", () => {
  it("one credit is one cent of balance: the plan's $150 is 15,000 credits", () => {
    expect(creditWords(PLAN.includedCents)).toBe("15,000 credits");
    expect(creditWords(EXTRA_ORG.includedCents)).toBe("5,000 credits");
  });

  it("writes whole numbers with separators and the right word", () => {
    expect(creditWords(0)).toBe("0 credits");
    expect(creditWords(1)).toBe("1 credit");
    expect(creditWords(2)).toBe("2 credits");
    expect(creditWords(1234567)).toBe("1,234,567 credits");
    expect(creditCount(2500)).toBe("2,500");
  });

  it("rounds a fraction up, as a charge does, and says 'under 1' only below one credit", () => {
    expect(creditWords(0.4)).toBe("under 1 credit");
    expect(creditWords(1.2)).toBe("2 credits");
    expect(creditWords(125.01)).toBe("126 credits");
    expect(wholeCredits(0.4)).toBe(1);
  });

  it("does not turn floating point noise into an extra credit", () => {
    expect(wholeCredits(42 * 3 + 1e-12)).toBe(126);
    expect(wholeCredits(0.1 * 3 * 10)).toBe(3);
  });

  it("shows a balance below zero and survives bad numbers", () => {
    expect(creditWords(-120)).toBe("-120 credits");
    expect(creditWords(Number.NaN)).toBe("0 credits");
  });

  it("turns what work cost into the credits charged for it, matching the ledger", () => {
    expect(creditsForCost(42, 3)).toBe(126);
    expect(creditsForCost(0, 3)).toBe(0);
    expect(creditsForCost(-5, 3)).toBe(0);
    for (const cost of [0.2, 1, 41.7, 300]) expect(wholeCredits(creditsForCost(cost, 3))).toBe(priceFor(cost, 3));
  });
});

describe("money that is charged", () => {
  it("stays in dollars", () => {
    expect(dollarWords(PLAN.priceCents)).toBe("$179");
    expect(dollarWords(EXTRA_ORG.priceCents)).toBe("$99");
    expect(dollarWords(950)).toBe("$9.50");
    expect(dollarWords(123456)).toBe("$1,234.56");
    expect(dollarWords(-1000)).toBe("-$10");
  });
});
