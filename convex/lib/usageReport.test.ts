import { describe, expect, it } from "vitest";

import { breakdown, daily, forecast, matches, periodDays, quantile, typicalUse, workItems, type UsageRow } from "./usageReport";

const NOW = Date.UTC(2026, 10, 13, 15);
const row = (over: Partial<UsageRow>): UsageRow => ({
  workspaceId: "w1",
  source: "run",
  ref: "r1",
  day: "2026-11-13",
  model: "claude-opus-5-5",
  priceCents: 10,
  firstAt: NOW,
  lastAt: NOW,
  startedBy: "nora",
  agentSlug: "growth-architect",
  skillSlug: "market-intelligence",
  ...over,
});

describe("usage arithmetic", () => {
  it("adds credits per key, largest first, with shares and pieces of work", () => {
    const rows = [row({ priceCents: 30 }), row({ ref: "r2", priceCents: 10, skillSlug: "offer-intelligence" }), row({ model: "claude-haiku-5-5", priceCents: 20 })];
    expect(breakdown(rows, "skill")).toEqual([
      { key: "market-intelligence", credits: 50, share: 50 / 60, items: 1 },
      { key: "offer-intelligence", credits: 10, share: 10 / 60, items: 1 },
    ]);
    expect(breakdown(rows, "model").map((slice) => slice.key)).toEqual(["claude-opus-5-5", "claude-haiku-5-5"]);
    // Work for no client is the organization's own; a tool call has no model.
    expect(breakdown([row({ model: "" })], "model")[0].key).toBe("none");
    expect(breakdown([row({})], "client")[0].key).toBe("none");
  });

  it("filters on every dimension but the one being listed", () => {
    const opus = row({});
    const haiku = row({ model: "claude-haiku-5-5" });
    expect(matches(haiku, { model: "claude-opus-5-5" })).toBe(false);
    expect(matches(haiku, { model: "claude-opus-5-5" }, "model")).toBe(true);
    expect(matches(opus, { client: "none", person: "nora" })).toBe(true);
  });

  it("gives every day of the period a bar, zero when nothing ran", () => {
    const days = periodDays("7d", NOW);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe("2026-11-13");
    const { bars, keys } = daily([row({ priceCents: 4 }), row({ agentSlug: "closer", priceCents: 6, day: "2026-11-10" })], days);
    expect(keys).toEqual(["closer", "growth-architect"]);
    expect(bars.map((bar) => bar.total)).toEqual([0, 0, 0, 6, 0, 0, 4]);
  });

  it("starts this month on the plan's reset day", () => {
    const days = periodDays("month", NOW, Date.UTC(2026, 10, 4, 9));
    expect(days[0]).toBe("2026-11-04");
    expect(days.at(-1)).toBe("2026-11-13");
    expect(periodDays("month", NOW, null)[0]).toBe("2026-11-01");
  });

  it("folds a run's days and models into one piece of work", () => {
    const items = workItems([row({ priceCents: 5 }), row({ day: "2026-11-12", model: "claude-haiku-5-5", priceCents: 2, firstAt: NOW - 86_400_000 }), row({ ref: "r2", priceCents: 1, lastAt: NOW + 1 })]);
    expect(items).toHaveLength(2);
    expect(items[0].ref).toBe("r2");
    expect(items[1]).toMatchObject({ credits: 7, models: ["claude-opus-5-5", "claude-haiku-5-5"], firstAt: NOW - 86_400_000 });
  });

  it("states typical use as the middle half of real pieces of work", () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    const rows = [100, 140, 180, 220, 400].map((credits, index) => row({ ref: `r${index}`, priceCents: credits }));
    expect(typicalUse(rows)[0]).toMatchObject({ key: "market-intelligence", count: 5, low: 140, median: 180, high: 220 });
  });

  it("forecasts when the balance runs out at the last fortnight's pace", () => {
    const reset = NOW + 20 * 86_400_000;
    expect(forecast({ balance: 1400, usedLast14Days: 1400, now: NOW, resetAt: reset })).toEqual({ kind: "until", at: NOW + 14 * 86_400_000 });
    expect(forecast({ balance: 14_000, usedLast14Days: 1400, now: NOW, resetAt: reset })).toEqual({ kind: "pastReset" });
    expect(forecast({ balance: 14_000, usedLast14Days: 0, now: NOW, resetAt: reset })).toEqual({ kind: "none" });
  });
});
