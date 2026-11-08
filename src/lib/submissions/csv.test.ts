import { describe, expect, it } from "vitest";

import { submissionsCsv, type SubmissionRow } from "@/lib/submissions/csv";

const base: SubmissionRow = {
  id: "1",
  kind: "private_access",
  name: "Jordan Lee",
  email: "jordan@example.com",
  business: "Glow, Inc.",
  summary: "",
  fields: [{ label: "Main problem", value: 'Leads say "later"\nthen vanish' }],
  pagePath: "/request",
  status: "new",
  emailStatus: "sent",
  emailError: "",
  createdAt: Date.UTC(2026, 10, 5, 12, 0, 0),
};

describe("submissionsCsv", () => {
  it("quotes commas, quotes, and line breaks, and gives each answer a column", () => {
    const csv = submissionsCsv([base, { ...base, id: "2", fields: [{ label: "What they need", value: "A call" }] }]);
    const [header, first, second] = csv.replace("﻿", "").split("\r\n");
    expect(header).toBe("Received (UTC),Type,Name,Email,Business,Status,Email status,Page,Main problem,What they need");
    expect(first).toContain('"Glow, Inc."');
    expect(first).toContain('"Leads say ""later""\nthen vanish"');
    expect(second.endsWith(",A call")).toBe(true);
  });

  it("neutralizes spreadsheet formulas", () => {
    const csv = submissionsCsv([{ ...base, name: "=HYPERLINK(\"x\")" }]);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
