import { describe, expect, it } from "vitest";

import { canAssignLeadTo } from "@/lib/auth/permissions";
import { ghlConversationUrl } from "@/lib/queue/crm-url";
import { formatQueueDuration } from "@/lib/queue/duration";
import { defaultAssignedFilter, parseQueueFilters } from "@/lib/queue/filters";
import { queueEmptyKind } from "@/lib/queue/parse";

describe("queue durations", () => {
  const now = "2026-08-20T12:00:00.000Z";

  it("renders elapsed minutes and days, never a timestamp", () => {
    expect(formatQueueDuration("2026-08-20T11:41:00.000Z", now)).toBe("19 min");
    expect(formatQueueDuration("2026-08-14T12:00:00.000Z", now)).toBe("6 days");
    expect(formatQueueDuration(null, now)).toBe("never");
    expect(formatQueueDuration("2026-08-20T12:00:00.000Z", now)).toBe("just now");
  });
});

describe("queue filters", () => {
  it("defaults setters to assigned-to-me-or-unassigned and owners to everyone", () => {
    expect(defaultAssignedFilter("setter")).toBe("me_or_unassigned");
    expect(defaultAssignedFilter("closer")).toBe("me_or_unassigned");
    expect(defaultAssignedFilter("owner")).toBe("all");
    expect(defaultAssignedFilter("admin")).toBe("all");
    expect(defaultAssignedFilter("setter", true)).toBe("all");
  });

  it("reads filter state from the URL", () => {
    const filters = parseQueueFilters(
      {
        assigned: "unassigned",
        track: "ready",
        status: "working",
        source: "facebook",
        scoreMin: "40",
        scoreMax: "90",
      },
      { role: "setter" }
    );
    expect(filters).toEqual({
      assigned: "unassigned",
      track: "ready",
      status: "working",
      source: "facebook",
      scoreMin: 40,
      scoreMax: 90,
    });
  });
});

describe("CRM conversation link", () => {
  it("builds a GHL conversation URL from location and contact ids", () => {
    expect(ghlConversationUrl("loc_1", "ct_9")).toBe(
      "https://app.gohighlevel.com/v2/location/loc_1/conversations/all?contactId=ct_9"
    );
    expect(ghlConversationUrl(null, "ct_9")).toBeNull();
  });
});

describe("queue empty states", () => {
  const base = {
    ghlLocationId: null,
    unfilteredActionableCount: 0,
    alarm: [] as [],
    queue: [] as [],
    hasMore: false,
    members: [],
    sources: [] as string[],
  };

  it("treats a missing CRM with no leads as not connected, not as no-leads-yet", () => {
    expect(queueEmptyKind({ ...base, crmStatus: "missing", orgLeadCount: 0 })).toBe("not_connected");
    expect(queueEmptyKind({ ...base, crmStatus: "active", orgLeadCount: 0 })).toBe("no_leads");
    expect(queueEmptyKind({ ...base, crmStatus: "broken", orgLeadCount: 0 })).toBe("broken");
  });

  it("does not hide an existing queue behind a missing CRM", () => {
    expect(
      queueEmptyKind({
        ...base,
        crmStatus: "missing",
        orgLeadCount: 4,
        unfilteredActionableCount: 2,
      })
    ).toBeNull();
    expect(
      queueEmptyKind({
        ...base,
        crmStatus: "active",
        orgLeadCount: 4,
        unfilteredActionableCount: 0,
      })
    ).toBe("nothing_to_work");
  });
});

describe("assignment permission", () => {
  it("lets a setter assign to themselves and refuses assigning to others", () => {
    expect(
      canAssignLeadTo({
        role: "setter",
        actorMemberId: "me",
        targetMemberId: "me",
      })
    ).toBe(true);
    expect(
      canAssignLeadTo({
        role: "setter",
        actorMemberId: "me",
        targetMemberId: "other",
      })
    ).toBe(false);
    expect(
      canAssignLeadTo({
        role: "setter",
        actorMemberId: "me",
        targetMemberId: null,
      })
    ).toBe(false);
    expect(
      canAssignLeadTo({
        role: "owner",
        actorMemberId: "me",
        targetMemberId: "other",
      })
    ).toBe(true);
  });
});
