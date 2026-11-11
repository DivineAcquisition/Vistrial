import { describe, expect, it } from "vitest";

import * as options from "@/lib/access-requests/options";
import { submissionFields } from "@/lib/access-requests/summary";
import { parseAccessForm } from "@/lib/access-requests/validate";

function form(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
}

const COMPLETE = {
  full_name: "Sam Rivera",
  email: "sam@northlight.example",
  business_name: "Northlight Growth",
  consent: "yes",
  business_type: "agency",
  team_size: "2_5",
  client_count: "6_20",
  channels: ["meta_ads", "referrals"],
  ad_spend: "5000_20000",
  offer_price: "2500_10000",
  first_want: "offer_analysis",
  figures: "meta",
};

describe("the private access request form", () => {
  it("accepts a complete request and labels every answer for the team", () => {
    const parsed = parseAccessForm(form(COMPLETE), "private_access");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const fields = Object.fromEntries(submissionFields(parsed.value).map((row) => [row.label, row.value]));
    expect(fields).toMatchObject({
      "Business type": "Agency",
      "Team size": "2 to 5",
      "Works for": "6 to 20 clients",
      "Where customers come from": "Meta ads, Referrals",
      "Monthly ad spend": "$5,000 to $20,000",
      "Price of main offer": "$2,500 to $10,000",
      "Wants first": "My offer set beside competitors'",
      "Figures they could share": "A Meta ad account",
    });
  });

  it("asks for the answers the team needs to review the fit", () => {
    const parsed = parseAccessForm(form({ full_name: "Sam Rivera", email: "sam@northlight.example", business_name: "Northlight Growth", consent: "yes" }), "private_access");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(Object.keys(parsed.errors).sort()).toEqual(["ad_spend", "business_type", "client_count", "first_want", "offer_price", "team_size"]);
  });

  it("drops a channel that is not on the form", () => {
    const parsed = parseAccessForm(form({ ...COMPLETE, channels: ["meta_ads", "crm"] }), "private_access");
    expect(parsed.ok && parsed.value.channels).toEqual(["meta_ads"]);
  });

  it("no longer asks the earlier product's questions", () => {
    const lists = Object.values(options).filter((entry): entry is never => Array.isArray(entry)) as unknown as unknown[][];
    const labels = lists.flatMap((list) => list.map((row) => (typeof row === "string" ? row : (row as { label: string }).label))).join("\n");
    expect(labels).not.toMatch(/CRM|GoHighLevel|HubSpot|Salesforce|dialer|recordings|lead/i);
  });
});
