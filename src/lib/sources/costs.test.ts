import { describe, expect, it } from "vitest";

import { costCentsUnflattering, costPerUnit, dollarsToCentsUnflattering } from "@/lib/sources/costs";

describe("cost figures", () => {
  it("ceils so a cost never looks cheaper than it is", () => {
    expect(costCentsUnflattering(100, 3)).toBe(34);
    expect(costCentsUnflattering(100, 3)).not.toBe(33);
  });

  it("suppresses cost-per below the rate minimum", () => {
    const small = costPerUnit({ spendCents: 100000, count: 29 });
    expect(small.tooSmall).toBe(true);
    expect(small.cents).toBeNull();
    const ok = costPerUnit({ spendCents: 100000, count: 30 });
    expect(ok.tooSmall).toBe(false);
    expect(ok.cents).toBe(Math.ceil(100000 / 30));
  });

  it("ceils dollars to cents", () => {
    expect(dollarsToCentsUnflattering(1.001)).toBe(101);
  });
});
