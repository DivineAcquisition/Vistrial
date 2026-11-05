import { describe, expect, it } from "vitest";

import { submissionEmail } from "./lib/submissionEmail";

describe("submission alert email", () => {
  const row = {
    kind: "custom",
    name: "Sam <script>",
    email: "sam@example.com",
    business: "Acme\nBcc: x@y.z",
    summary: "Need help",
    fields: [{ label: "What they need", value: "<b>calls</b>" }],
    pagePath: "/contact",
    createdAt: Date.UTC(2026, 10, 5, 9, 30),
  };

  it("keeps the subject on one line and names the form", () => {
    const { subject } = submissionEmail(row, "https://example.com/admin");
    expect(subject.startsWith("New Custom contact: ")).toBe(true);
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("escapes submitted text in the HTML body", () => {
    const { html, text } = submissionEmail(row, "https://example.com/admin");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;b&gt;calls&lt;/b&gt;");
    expect(text).toContain("What they need: <b>calls</b>");
    expect(text).toContain("2026-11-05 09:30 UTC");
  });
});
