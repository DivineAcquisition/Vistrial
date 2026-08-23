import { describe, expect, it } from "vitest";

import {
  ghlWebhookBody,
  isHoneypot,
  parseContact,
  parseQualification,
  QualificationError,
} from "@/lib/marketing/qualify";

const valid = {
  fullName: "Alex Morgan",
  email: "alex@northline.example",
  phone: "(415) 555-0199",
  companyName: "Northline Coaching",
  monthlyRevenue: "$20–50k",
  usesGhl: "Yes",
  whoWorksLeads: "Setters and closers",
  offerPrice: "$5–10k",
};

describe("parseQualification", () => {
  it("accepts a complete survey and records the CTA position", () => {
    const payload = parseQualification({
      ...valid,
      tracking: { from: "hero", utm_source: "slack" },
    });
    expect(payload.firstName).toBe("Alex");
    expect(payload.lastName).toBe("Morgan");
    expect(payload.email).toBe("alex@northline.example");
    expect(payload.ctaPosition).toBe("hero");
    expect(payload.source).toBe("Lead Leak Audit");
    expect(ghlWebhookBody(payload).cta_position).toBe("hero");
    expect(ghlWebhookBody(payload).utm_source).toBe("slack");
  });

  it("rejects a short phone number", () => {
    expect(() => parseQualification({ ...valid, phone: "123" })).toThrow(QualificationError);
  });

  it("treats a filled website field as a honeypot", () => {
    expect(isHoneypot({ website: "https://spam.example" })).toBe(true);
    expect(isHoneypot({ website: "  " })).toBe(false);
  });
});

describe("parseContact", () => {
  it("accepts a short message", () => {
    const payload = parseContact({
      fullName: "Alex Morgan",
      email: "alex@northline.example",
      message: "Can we do the audit next week?",
    });
    expect(payload.source).toBe("Vistrial contact");
  });
});
