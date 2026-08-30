import { describe, expect, it } from "vitest";

import { batchActivityEvents, canBatchActivity } from "@/lib/activity/batch";
import { activityFiltersHref, parseActivityFilters } from "@/lib/activity/filters";
import { parseActivityEvent, parseActivityPage } from "@/lib/activity/parse";
import type { ActivityEvent } from "@/lib/activity/types";

function event(over: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: over.id ?? "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    orgName: null,
    occurredAt: over.occurredAt ?? "2026-08-25T12:00:00.000Z",
    category: over.category ?? "inbound",
    kind: over.kind ?? "lead_received",
    headline: over.headline ?? "Lead arrived from Facebook",
    actorLabel: over.actorLabel ?? "LeadConnector",
    actorKind: "integration",
    actorUserId: null,
    integration: "gohighlevel",
    leadId: over.leadId ?? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
    leadName: over.leadName ?? "Maya Chen",
    href: "/app/cases/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
    result: over.result ?? "succeeded",
    resultReason: null,
    retryable: false,
    retryKind: null,
    retryId: null,
    isSyncNoise: over.isSyncNoise ?? false,
    detail: over.detail ?? {},
    ...over,
  };
}

describe("activity filters", () => {
  it("reads filter state from the URL", () => {
    const filters = parseActivityFilters({
      category: "user",
      actor: "11111111-1111-4111-8111-111111111111",
      integration: "gohighlevel",
      failures: "1",
      sync: "1",
      routine: "true",
      q: "Maya",
      from: "2026-08-01",
      to: "2026-08-20",
    });
    expect(filters.category).toBe("user");
    expect(filters.failuresOnly).toBe(true);
    expect(filters.includeSync).toBe(true);
    expect(filters.includeRoutine).toBe(true);
    expect(filters.q).toBe("Maya");
    expect(activityFiltersHref(filters)).toContain("category=user");
    expect(activityFiltersHref(filters)).toContain("failures=1");
    expect(activityFiltersHref(filters, "/app/ops")).toMatch(/^\/app\/ops\?/);
  });

  it("ignores unknown categories and malformed ids", () => {
    expect(parseActivityFilters({ category: "debug", actor: "not-a-uuid" })).toMatchObject({
      category: null,
      actorUserId: null,
    });
  });
});

describe("activity parse", () => {
  it("reads a plain-language event and keeps outbound body only", () => {
    const parsed = parseActivityEvent({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      orgId: "22222222-2222-4222-8222-222222222222",
      occurredAt: "2026-08-25T12:00:00.000Z",
      category: "system",
      kind: "dispatch_sent",
      headline: "Message dispatched on text",
      actorLabel: "Dev Owner",
      actorKind: "person",
      href: "/app/cases/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb02",
      result: "succeeded",
      detail: {
        outboundBody: "See you Thursday.",
        payload: { secret: "nope" },
        token: "sk-live",
      },
    });
    expect(parsed?.headline).toBe("Message dispatched on text");
    expect(parsed?.detail.outboundBody).toBe("See you Thursday.");
    expect(parsed?.detail.payload).toBeUndefined();
    expect(parsed?.detail.token).toBeUndefined();
  });

  it("never treats a bare system actor as display copy — it becomes Workspace", () => {
    const parsed = parseActivityEvent({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      orgId: "22222222-2222-4222-8222-222222222222",
      occurredAt: "2026-08-25T12:00:00.000Z",
      category: "user",
      kind: "settings_changed",
      headline: "Settings changed · scoring · update",
      actorLabel: "system",
      href: "/app/settings",
      result: "succeeded",
      detail: {},
    });
    expect(parsed?.actorLabel).toBe("Workspace");
  });

  it("drops retry unless it is a dispatch with an id", () => {
    const parsed = parseActivityEvent({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      orgId: "22222222-2222-4222-8222-222222222222",
      occurredAt: "2026-08-25T12:00:00.000Z",
      category: "system",
      kind: "extraction_failed",
      headline: "Extraction failed",
      actorLabel: "Vistrial extraction",
      href: "/app/calls",
      result: "failed",
      retryable: true,
      retryKind: "extraction",
      retryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
    });
    expect(parsed?.retryable).toBe(false);
  });

  it("parses a page", () => {
    const page = parseActivityPage({
      events: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
          orgId: "22222222-2222-4222-8222-222222222222",
          occurredAt: "2026-08-25T12:00:00.000Z",
          category: "inbound",
          kind: "lead_received",
          headline: "Lead arrived from Facebook",
          actorLabel: "LeadConnector",
          href: "/app/cases/x",
          result: "succeeded",
        },
      ],
      hasMore: true,
    });
    expect(page.events).toHaveLength(1);
    expect(page.hasMore).toBe(true);
  });
});

describe("activity batching", () => {
  it("batches lead arrivals of the same category into one expandable line", () => {
    const lines = batchActivityEvents([
      event({ id: "1", kind: "lead_received", occurredAt: "2026-08-25T12:02:00.000Z" }),
      event({ id: "2", kind: "lead_received", occurredAt: "2026-08-25T12:01:00.000Z" }),
      event({ id: "3", kind: "lead_received", occurredAt: "2026-08-25T12:00:00.000Z" }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.type).toBe("batch");
    if (lines[0]?.type === "batch") {
      expect(lines[0].headline).toBe("3 leads arrived");
      expect(lines[0].events).toHaveLength(3);
    }
  });

  it("never batches a failure, a dispatch, or a user action", () => {
    expect(
      canBatchActivity(
        event({ category: "system", kind: "dispatch_failed", result: "failed" })
      )
    ).toBe(false);
    expect(
      canBatchActivity(event({ category: "system", kind: "dispatch_sent", result: "succeeded" }))
    ).toBe(false);
    expect(
      canBatchActivity(event({ category: "user", kind: "outcome_logged", result: "succeeded" }))
    ).toBe(false);
  });

  it("never batches across categories even when kinds match in volume", () => {
    const lines = batchActivityEvents([
      event({
        id: "a",
        category: "inbound",
        kind: "lead_received",
        occurredAt: "2026-08-25T12:02:00.000Z",
      }),
      event({
        id: "b",
        category: "system",
        kind: "dispatch_failed",
        result: "failed",
        headline: "Dispatch failed",
        occurredAt: "2026-08-25T12:01:30.000Z",
      }),
      event({
        id: "c",
        category: "inbound",
        kind: "lead_received",
        occurredAt: "2026-08-25T12:01:00.000Z",
      }),
    ]);
    const batches = lines.filter((line) => line.type === "batch");
    const singles = lines.filter((line) => line.type === "single");
    expect(batches).toHaveLength(1);
    expect(singles).toHaveLength(1);
    expect(singles[0] && singles[0].type === "single" && singles[0].event.result).toBe("failed");
  });
});
