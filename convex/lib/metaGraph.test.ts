import { describe, expect, it } from "vitest";

import { dailySeries, graphErrorCode, isAdAccountId, joinCampaigns, resultsFor, safeReturnOrigin, totalsOf } from "./metaGraph";

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
