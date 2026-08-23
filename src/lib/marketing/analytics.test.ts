import { describe, expect, it } from "vitest";

import { parseMarketingEvent } from "@/lib/marketing/analytics";

describe("parseMarketingEvent", () => {
  it("keeps CTA clicks distinguishable by section position", () => {
    const event = parseMarketingEvent({
      type: "cta_click",
      path: "/",
      position: "audit",
      href: "/book?from=audit",
      occurredAt: "2026-08-23T00:00:00.000Z",
    });
    expect(event).toEqual({
      type: "cta_click",
      path: "/",
      position: "audit",
      href: "/book?from=audit",
      occurredAt: "2026-08-23T00:00:00.000Z",
    });
  });

  it("rejects a CTA click without a known position", () => {
    expect(
      parseMarketingEvent({
        type: "cta_click",
        path: "/",
        position: "sidebar",
        href: "/book",
      })
    ).toBeNull();
  });

  it("accepts scroll depth buckets", () => {
    expect(parseMarketingEvent({ type: "scroll_depth", path: "/", depth: 75 })?.type).toBe(
      "scroll_depth"
    );
    expect(parseMarketingEvent({ type: "scroll_depth", path: "/", depth: 10 })).toBeNull();
  });
});
