import { describe, expect, it } from "vitest";

import { canAssignLeadTo } from "@/lib/auth/permissions";
import { ghlConversationUrl } from "@/lib/queue/crm-url";
import { formatQueueDuration } from "@/lib/queue/duration";
import { defaultAssignedFilter, parseQueueFilters } from "@/lib/queue/filters";
import { queueEmptyKind } from "@/lib/queue/parse";
import { queuePrimaryAction, queueRowAlreadyWorked } from "@/lib/queue/worked";

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
      },
      { role: "setter" }
    );
    expect(filters).toEqual({
      assigned: "unassigned",
      track: "ready",
      status: "working",
      source: "facebook",
      breached: false,
    });
  });

  it("reads the breach filter from the URL", () => {
    expect(parseQueueFilters({ breached: "1" }, { role: "setter" }).breached).toBe(true);
    expect(parseQueueFilters({ focus: "breached" }, { role: "owner" }).breached).toBe(true);
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

describe("the one button (Prompt 7, Part 4)", () => {
  it("opens the CRM for a never-contacted lead with a conversation to open", () => {
    expect(
      queuePrimaryAction({ firstHumanTouchAt: null, crmUrl: "https://app.gohighlevel.com/x" })
    ).toEqual({ kind: "open_crm", href: "https://app.gohighlevel.com/x" });
  });

  it("logs an outcome once a human has ever reached this person", () => {
    expect(
      queuePrimaryAction({
        firstHumanTouchAt: "2026-08-01T00:00:00.000Z",
        crmUrl: "https://app.gohighlevel.com/x",
      })
    ).toEqual({ kind: "log_outcome" });
  });

  it("logs an outcome when there is nowhere to open, even if never contacted", () => {
    expect(queuePrimaryAction({ firstHumanTouchAt: null, crmUrl: null })).toEqual({
      kind: "log_outcome",
    });
  });

  it("ignores a system touch: a robot texting someone is not 'already worked'", () => {
    expect(queueRowAlreadyWorked({ firstHumanTouchAt: null })).toBe(false);
    expect(queueRowAlreadyWorked({ firstHumanTouchAt: "2026-08-01T00:00:00.000Z" })).toBe(true);
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
    pendingDrafts: [] as [],
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
    expect(
      queueEmptyKind({
        ...base,
        crmStatus: "active",
        orgLeadCount: 4,
        unfilteredActionableCount: 0,
        pendingDrafts: [
          {
            id: "d1",
            leadId: "l1",
            leadName: "Maya",
            callId: "c1",
            branch: "ghost_risk",
            channel: "sms",
            status: "pending",
            lowConfidence: false,
            lowConfidenceReason: null,
            expiresAt: "2026-08-25T12:00:00.000Z",
            createdAt: "2026-08-20T12:00:00.000Z",
            sequencePosition: 1,
            sequenceRunId: null,
            stale: false,
            failureReason: null,
          },
        ],
      })
    ).toBeNull();
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
