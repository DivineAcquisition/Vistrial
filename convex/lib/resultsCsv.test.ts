import Papa from "papaparse";
import { describe, expect, it } from "vitest";

import { MAX_GROUPS, isPersonalHeader, normalizeHeader, readDay, readNumber, summarizeResults } from "./resultsCsv";

function parse(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true });
  return summarizeResults(parsed.meta.fields ?? [], parsed.data);
}

describe("results files", () => {
  it("reads a Meta Ads Manager export: totals, campaigns, dates", () => {
    const outcome = parse(`
Reporting starts,Campaign name,Amount spent (USD),Impressions,Link clicks,Results,CTR (all)
2026-10-01,Spring Deep Clean,"$1,200.50",40000,800,24,2.00%
2026-10-15,Spring Deep Clean,300,10000,150,6,1.50%
2026-10-20,Move-out Special,450.25,15000,300,12,2.00%
`);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.summary).toMatchObject({
      rows: 3,
      dateStart: "2026-10-01",
      dateStop: "2026-10-20",
      metrics: ["spend", "impressions", "clicks", "conversions"],
      totals: { spend: 1950.75, impressions: 65000, clicks: 1250, conversions: 42 },
      groupBy: "Campaign name",
      otherGroups: 0,
      ignoredColumns: [],
    });
    expect(outcome.summary.groups).toEqual([
      { name: "Spring Deep Clean", spend: 1500.5, impressions: 50000, clicks: 950, conversions: 30 },
      { name: "Move-out Special", spend: 450.25, impressions: 15000, clicks: 300, conversions: 12 },
    ]);
  });

  it("reads a Google Ads export with cost and conversion value", () => {
    const outcome = parse(`
Day,Campaign,Cost,Impr.,Clicks,Conversions,Conv. value
2026-09-01,Search - Brand,120.00,3000,240,10,2500
2026-09-02,Search - Generic,80.00,5000,100,2,400
`);
    expect(outcome.ok && outcome.summary.metrics).toEqual(["spend", "impressions", "clicks", "conversions", "revenue"]);
    expect(outcome.ok && outcome.summary.totals).toEqual({ spend: 200, impressions: 8000, clicks: 340, conversions: 12, revenue: 2900 });
  });

  it("drops personal columns unread, and keeps the results", () => {
    const outcome = parse(`
Date,Source,Customer email,Phone,Revenue,Bookings
2026-10-01,Referral,a@b.com,555-0100,300,1
2026-10-02,Google,c@d.com,555-0101,450,1
`);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.summary.ignoredColumns).toEqual(["Customer email", "Phone"]);
    expect(outcome.summary.totals).toEqual({ conversions: 2, revenue: 750 });
    // No value from a personal column appears anywhere in what is kept.
    expect(JSON.stringify(outcome.summary)).not.toMatch(/@|555-/);
  });

  it("refuses a customer list: contact details and nothing to count", () => {
    const outcome = parse(`
First name,Last name,Email,Phone
Ann,Lee,ann@x.com,555-0100
`);
    expect(outcome).toEqual({ ok: false, code: "personal_data", ignoredColumns: ["First name", "Last name", "Email", "Phone"] });
  });

  it("refuses a file with no results columns, and an empty file", () => {
    expect(parse("Notes,Color\nhello,blue")).toMatchObject({ ok: false, code: "no_metrics" });
    expect(summarizeResults(["Spend"], [])).toMatchObject({ ok: false, code: "empty" });
  });

  it("keeps the largest campaigns and counts the rest", () => {
    const lines = ["Campaign,Spend"];
    for (let index = 0; index < MAX_GROUPS + 5; index += 1) lines.push(`C${index},${index + 1}`);
    const outcome = parse(lines.join("\n"));
    expect(outcome.ok && outcome.summary.groups.length).toBe(MAX_GROUPS);
    expect(outcome.ok && outcome.summary.groups[0]).toEqual({ name: `C${MAX_GROUPS + 4}`, spend: MAX_GROUPS + 5 });
    expect(outcome.ok && outcome.summary.otherGroups).toBe(5);
    // Every row still counts in the totals.
    expect(outcome.ok && outcome.summary.totals.spend).toBe(((MAX_GROUPS + 5) * (MAX_GROUPS + 6)) / 2);
  });

  it("reads numbers and days defensively", () => {
    expect(readNumber("$1,234.50")).toBe(1234.5);
    expect(readNumber("(25.00)")).toBe(-25);
    expect(readNumber("2.5%")).toBeNull();
    expect(readNumber("n/a")).toBeNull();
    expect(readNumber("1.2.3")).toBeNull();
    expect(readDay("2026-10")).toBe("2026-10-01");
    expect(readDay("Oct 3, 2026")).toBe("2026-10-03");
    expect(readDay("1899-01-01")).toBeNull();
    expect(readDay("soon")).toBeNull();
  });

  it("names columns the same however they are written", () => {
    expect(normalizeHeader("Amount Spent (USD)")).toBe("amount spent");
    expect(normalizeHeader("amount_spent_usd")).toBe("amount spent");
    expect(isPersonalHeader("E-mail")).toBe(true);
    expect(isPersonalHeader("Campaign name")).toBe(false);
    expect(isPersonalHeader("Customer")).toBe(true);
    expect(isPersonalHeader("Source / Medium")).toBe(false);
  });
});
