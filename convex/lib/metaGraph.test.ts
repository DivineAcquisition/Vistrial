import { describe, expect, it } from "vitest";

import { dailySeries, fillDays, graphErrorCode, isAdAccountId, joinCampaigns, observe, resultsFor, safeReturnOrigin, totalsOf } from "./metaGraph";

describe("Meta Graph helpers", () => {
  it("counts the result each objective is judged by", () => {
    expect(resultsFor("OUTCOME_LEADS", [{ action_type: "link_click", value: "40" }, { action_type: "lead", value: "7" }])).toEqual({ label: "Leads", count: 7 });
    expect(resultsFor("OUTCOME_TRAFFIC", [{ action_type: "link_click", value: "40" }])).toEqual({ label: "Link clicks", count: 40 });
    expect(resultsFor("OUTCOME_LEADS", [])).toEqual({ label: "Leads", count: 0 });
    expect(resultsFor("OUTCOME_AWARENESS", [])).toBeNull();
  });

  it("joins campaigns to insights, keeps undelivered ones, and marks archived ones", () => {
    const rows = joinCampaigns(
      [
        { id: "1", name: "Leads", effective_status: "ACTIVE", objective: "OUTCOME_LEADS" },
        { id: "2", name: "Idle", effective_status: "PAUSED", objective: "OUTCOME_TRAFFIC" },
      ],
      [
        { campaign_id: "1", spend: "100.50", impressions: "1000", clicks: "50", actions: [{ action_type: "lead", value: "5" }] },
        { campaign_id: "3", campaign_name: "Old", spend: "20", impressions: "100", clicks: "4" },
      ],
    );
    expect(rows.map((row) => [row.id, row.status])).toEqual([["1", "ACTIVE"], ["3", "ARCHIVED"], ["2", "PAUSED"]]);
    expect(rows[0]).toMatchObject({ spend: 100.5, results: 5, costPerResult: 20.1, ctr: 0.05, cpc: 2.01 });
    expect(rows[2]).toMatchObject({ spend: 0, ctr: null, cpc: null, costPerResult: null });
    expect(totalsOf(rows)).toMatchObject({ spend: 120.5, clicks: 54, impressions: 1100, active: 1 });
  });

  it("orders the series and ignores rows without a date", () => {
    expect(dailySeries([{ date_start: "2026-11-02", spend: "2" }, { spend: "9" }, { date_start: "2026-11-01", spend: "1" }]).map((row) => row.date)).toEqual(["2026-11-01", "2026-11-02"]);
  });

  it("maps Graph errors to short codes", () => {
    expect(graphErrorCode({ error: { code: 190, error_subcode: 463 } })).toBe("token_expired");
    expect(graphErrorCode({ error: { code: 190 } })).toBe("token_rejected");
    expect(graphErrorCode({ error: { code: 10 } })).toBe("permission_missing");
    expect(graphErrorCode({ error: { code: 272 } })).toBe("permission_missing");
    expect(graphErrorCode({ error: { code: 17 } })).toBe("rate_limited");
    expect(graphErrorCode(null)).toBe("provider_error");
  });

  it("only returns people to Vistrial's own origins", () => {
    expect(safeReturnOrigin("https://app.vistrial.io/app/x")).toBe("https://app.vistrial.io");
    expect(safeReturnOrigin("https://vistrial-git-x-divine-acquisition.vercel.app")).toBe("https://vistrial-git-x-divine-acquisition.vercel.app");
    expect(safeReturnOrigin("http://localhost:3000")).toBe("http://localhost:3000");
    expect(safeReturnOrigin("https://evil.example.com")).toBeNull();
    expect(safeReturnOrigin("https://vistrial.io.evil.com")).toBeNull();
    expect(safeReturnOrigin("http://app.vistrial.io")).toBeNull();
    expect(isAdAccountId("act_123456")).toBe(true);
    expect(isAdAccountId("123456")).toBe(false);
  });
});

describe("what the account's own numbers show", () => {
  const row = (id: string, spend: number, extra: Partial<Parameters<typeof observe>[0][number]> = {}) => ({
    id,
    name: `C${id}`,
    status: "PAUSED",
    objective: "OUTCOME_LEADS",
    spend,
    impressions: 10000,
    reach: 5000,
    clicks: 100,
    ctr: 0.01,
    cpc: spend / 100,
    resultLabel: "Leads",
    results: 10,
    costPerResult: spend / 10,
    ...extra,
  });

  it("names the big spender, the cheapest result, the spread and spend with no results", () => {
    const campaigns = [row("1", 400), row("2", 100), row("3", 50, { results: 0, costPerResult: null })];
    const found = observe(campaigns, { spend: 550, active: 0 }, "USD");
    expect(found.map((item) => item.kind)).toEqual(["share", "best", "spread", "noResults", "clickRate", "idle"]);
    expect(found[0].title).toBe("73% of spend went to one campaign");
    expect(found[1].title).toBe("Cheapest lead: $10.00");
    expect(found[2].title).toBe("Cost per lead ranges 4.0×");
    expect(found[3].campaignIds).toEqual(["3"]);
  });

  it("says nothing when nothing was spent", () => {
    expect(observe([row("1", 0)], { spend: 0, active: 0 }, "USD")).toEqual([]);
  });

  it("fills the last 15 days, oldest first", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    const days = fillDays([{ day: "2026-11-05", ok: 4, failed: 1 }], now);
    expect(days).toHaveLength(15);
    expect(days[0].day).toBe("2026-10-22");
    expect(days.at(-1)).toEqual({ day: "2026-11-05", ok: 4, failed: 1 });
  });
});
