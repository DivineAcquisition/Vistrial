import { describe, expect, it } from "vitest";

import { PLATFORM_CEILING, SKILL_CAPS, capScale, scaleCaps } from "./caps";
import { MODELS } from "./models";
import { PRICES } from "./modelRouter";

describe("caps on a dearer model", () => {
  it("scales by the model's price over the price the caps were sized for", () => {
    expect(capScale(PRICES["claude-opus-5-5"])).toBe(1);
    expect(capScale(PRICES["openai/gpt-6-astra"])).toBe(2.5);
    expect(capScale({ input: 8, output: 20 })).toBe(1.5);
  });

  it("never lowers a cap for a cheaper model, an unknown one, or none", () => {
    expect(capScale(PRICES["claude-sonnet-5-5"])).toBe(1);
    expect(capScale(PRICES["openai/gpt-6-luna"])).toBe(1);
    expect(capScale(undefined)).toBe(1);
    expect(capScale(null)).toBe(1);
    for (const row of MODELS) expect(capScale(PRICES[row.id])).toBeGreaterThanOrEqual(1);
    const caps = SKILL_CAPS["market-intelligence"];
    expect(scaleCaps(caps, 1)).toBe(caps);
    expect(scaleCaps(caps, 0.2)).toBe(caps);
    expect(scaleCaps(caps, Number.NaN)).toBe(caps);
  });

  it("raises the run cap, and the day cap only as far as one run needs, leaving steps and time alone", () => {
    // Where a skill sets the day cap equal to the run cap, the day cap rises just enough for one run to fit.
    const trends = SKILL_CAPS["industry-trends"];
    expect(scaleCaps(trends, 2.5)).toEqual({ ...trends, maxCostCentsPerRun: 300, maxCostCentsPerDay: 300 });
    // An organization's day budget is its own control: a dearer model never multiplies it.
    const research = SKILL_CAPS["market-intelligence"];
    expect(scaleCaps(research, 2.5)).toEqual({ ...research, maxCostCentsPerRun: 750, maxCostCentsPerDay: research.maxCostCentsPerDay });
    expect(scaleCaps({ maxCostCentsPerRun: 25, maxCostCentsPerDay: 200, maxSteps: 40, maxDurationMs: 1000 }, 2.5).maxCostCentsPerDay).toBe(200);
  });

  it("stops at the platform ceiling", () => {
    const raised = scaleCaps({ maxCostCentsPerRun: 600, maxCostCentsPerDay: 9000, maxSteps: 10, maxDurationMs: 1000 }, 2.5);
    expect(raised.maxCostCentsPerRun).toBe(PLATFORM_CEILING.maxCostCentsPerRun);
    expect(raised.maxCostCentsPerDay).toBe(9000);
  });
});
