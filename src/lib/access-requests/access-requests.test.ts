import { describe, expect, it } from "vitest";

import { businessDaysSince } from "@/lib/access-requests/business-days";
import { emailHasOnlyFixedText, renderRequestEmail } from "@/lib/access-requests/email-template";
import { DEFAULT_FIT_RULES, fitLines } from "@/lib/access-requests/fit";
import { parseAccessForm } from "@/lib/access-requests/validate";
import { CLAIMS, SECTIONS } from "@/lib/marketing/content";
import { PRICING_DISPLAY } from "@/lib/marketing/pricing";

function accessForm(extra?: Record<string, string>): FormData {
  const form = new FormData();
  form.set("full_name", "Ada Owner");
  form.set("email", "Ada@Northline.example");
  form.set("business_name", "Northline");
  form.set("business_type", "med-spa");
  form.set("team_size", "2_5");
  form.set("deal_value", "2500_10000");
  form.set("calls_per_week", "5_20");
  form.set("leads_per_month", "20_100");
  form.set("crm", "gohighlevel");
  form.set("consent", "yes");
  form.set("page_path", "/request");
  for (const [key, value] of Object.entries(extra ?? {})) form.set(key, value);
  return form;
}

describe("access form validation", () => {
  it("accepts a private access request and lowercases the email", () => {
    const parsed = parseAccessForm(accessForm(), "private_access");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.email).toBe("ada@northline.example");
    expect(parsed.value.honeypot).toBe("");
  });

  it("requires consent and a real email", () => {
    const parsed = parseAccessForm(accessForm({ email: "not-an-email", consent: "" }), "private_access");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.email).toBeTruthy();
    expect(parsed.errors.consent).toBeTruthy();
  });

  it("rejects a problem longer than 1000 characters", () => {
    const parsed = parseAccessForm(accessForm({ problem: "a".repeat(1001) }), "private_access");
    expect(parsed.ok).toBe(false);
  });

  it("keeps unusual characters and strips control characters", () => {
    const parsed = parseAccessForm(accessForm({ full_name: "José\u0000 Álvarez" }), "private_access");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fullName).toBe("José Álvarez");
  });

  it("requires what you need on the custom form", () => {
    const form = new FormData();
    form.set("full_name", "Ada");
    form.set("email", "ada@example.com");
    form.set("business_name", "Northline");
    form.set("consent", "yes");
    expect(parseAccessForm(form, "custom").ok).toBe(false);
    form.set("need", "More leads than Private Access.");
    expect(parseAccessForm(form, "custom").ok).toBe(true);
  });
});

describe("confirmation email", () => {
  const template = "Hello {{name}},\n\nWe received your request.\n\nVistrial";

  it("inserts only the name", () => {
    const rendered = renderRequestEmail(template, "Ada");
    expect(rendered).toBe("Hello Ada,\n\nWe received your request.\n\nVistrial");
    expect(emailHasOnlyFixedText(rendered ?? "", "Ada", template)).toBe(true);
  });

  it("refuses a template that would send visitor text", () => {
    expect(renderRequestEmail("Hello {{name}} {{problem}}", "Ada")).toBeNull();
  });

  it("does not let a name add extra lines", () => {
    expect(renderRequestEmail(template, "Ada\nBcc: evil@example.com")).toBe(
      "Hello Ada Bcc: evil@example.com,\n\nWe received your request.\n\nVistrial"
    );
  });
});

describe("fit summary", () => {
  it("uses the visible rules and does not hide a score", () => {
    const lines = fitLines(
      { business_type: "med-spa", crm: "gohighlevel", deal_value: "2500_10000", calls_per_week: "under_5" },
      DEFAULT_FIT_RULES
    );
    expect(lines).toContain("Industry matches a template.");
    expect(lines).toContain("CRM is supported.");
    expect(lines).toContain("Sales calls per week are outside the usual range.");
  });
});

describe("business day reminders", () => {
  it("counts weekdays and skips the weekend", () => {
    const friday = new Date("2026-10-16T15:00:00.000Z");
    const tuesday = new Date("2026-10-20T15:00:00.000Z");
    expect(businessDaysSince(friday.toISOString(), tuesday, "America/New_York")).toBe(2);
  });
});

describe("public claims", () => {
  const copy = JSON.stringify({ CLAIMS, SECTIONS, PRICING_DISPLAY });

  it("keeps the price as a starting price and off billing", () => {
    expect(PRICING_DISPLAY.connectedToBilling).toBe(false);
    expect(PRICING_DISPLAY.privateAccess.price).toContain("Starting at $97");
    expect(copy).not.toMatch(/checkout/i);
  });

  it("has no em dash and no invented proof", () => {
    expect(copy).not.toContain("\u2014");
    expect(copy).not.toMatch(/10x|guaranteed|enterprise-grade|bank-level|full-funnel|attribution/i);
    expect(SECTIONS.proof).toBe(false);
  });

  it("lists a support note for every claim", () => {
    expect(CLAIMS.every((claim) => claim.statement && claim.support)).toBe(true);
  });
});
