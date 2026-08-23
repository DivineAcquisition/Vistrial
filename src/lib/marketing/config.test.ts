import { describe, expect, it } from "vitest";

import { bookingHref, withWidgetPrefill } from "@/lib/marketing/config";

describe("bookingHref", () => {
  it("tags every CTA with a section position", () => {
    expect(bookingHref("hero")).toBe("/book?from=hero");
    expect(bookingHref("nav")).toBe("/book?from=nav");
    expect(bookingHref("audit")).toBe("/book?from=audit");
  });
});

describe("withWidgetPrefill", () => {
  it("passes name and email into the GHL widget query", () => {
    const src = withWidgetPrefill("https://link.msgsndr.com/widget/booking/abc", {
      firstName: "Alex",
      lastName: "Morgan",
      email: "alex@northline.example",
      phone: "4155550199",
    });
    const url = new URL(src);
    expect(url.searchParams.get("first_name")).toBe("Alex");
    expect(url.searchParams.get("email")).toBe("alex@northline.example");
  });
});
