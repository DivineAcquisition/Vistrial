import { describe, expect, it } from "vitest";

import { describeOutcomeDiscrepancy } from "@/lib/mobile/discrepancy";
import {
  createMemoryOutcomeStore,
  enqueueOutcome,
  newClientEventId,
  syncQueuedOutcomes,
  unsyncedOutcomes,
  type QueuedOutcome,
  type OutcomeSyncResult,
} from "@/lib/mobile/outcome-queue";
import { detectClientSurface } from "@/lib/mobile/surface";

function draft(overrides: Partial<QueuedOutcome> = {}): Omit<
  QueuedOutcome,
  "status" | "lastError" | "discrepancy" | "createdAt" | "syncedAt"
> {
  return {
    clientEventId: newClientEventId(),
    leadId: "lead-1",
    leadName: "Jordan",
    orgId: "org-1",
    channel: "call",
    direction: "outbound",
    outcome: "connected",
    note: "",
    actorMemberId: "member-1",
    clientLoggedAt: "2026-08-25T12:00:00.000Z",
    queuedOffline: true,
    clientSurface: "mobile",
    expectedLeadStatus: "new",
    expectedLastTouchAt: null,
    expectedFirstHumanTouchAt: null,
    ...overrides,
  };
}

describe("client surface", () => {
  it("treats a home-screen install and a coarse pointer as a phone", () => {
    expect(detectClientSurface({ standalone: true, innerWidth: 1200 })).toBe("mobile");
    expect(detectClientSurface({ pointerCoarse: true, innerWidth: 900 })).toBe("mobile");
    expect(detectClientSurface({ innerWidth: 390, maxTouchPoints: 5 })).toBe("mobile");
    expect(detectClientSurface({ innerWidth: 1280, maxTouchPoints: 0 })).toBe("desktop");
  });
});

describe("offline outcome queue", () => {
  it("writes pending before any network call", async () => {
    const store = createMemoryOutcomeStore();
    const posted: string[] = [];
    const entry = await enqueueOutcome(store, draft({ clientEventId: "evt-1" }));
    expect(entry.status).toBe("pending");
    expect((await store.get("evt-1"))?.status).toBe("pending");
    expect(posted).toEqual([]);
  });

  it("never marks synced until the server confirms", async () => {
    const store = createMemoryOutcomeStore();
    await enqueueOutcome(store, draft({ clientEventId: "evt-2" }));
    let resolvePost: (value: OutcomeSyncResult) => void = () => undefined;
    const hanging = new Promise<OutcomeSyncResult>((resolve) => {
      resolvePost = resolve;
    });
    const running = syncQueuedOutcomes(store, () => hanging, () => true);
    await Promise.resolve();
    expect((await store.get("evt-2"))?.status).toBe("syncing");
    resolvePost({ ok: true, discrepancy: null });
    const result = await running;
    expect(result.synced).toHaveLength(1);
    expect(result.synced[0]?.status).toBe("synced");
  });

  it("keeps a row pending when the network is down and never drops it", async () => {
    const store = createMemoryOutcomeStore();
    await enqueueOutcome(store, draft({ clientEventId: "evt-3" }));
    const first = await syncQueuedOutcomes(
      store,
      async () => ({ ok: false, error: "offline", retryable: true }),
      () => false
    );
    expect(first.pending).toHaveLength(1);
    expect(first.synced).toHaveLength(0);
    expect(await store.get("evt-3")).not.toBeNull();

    const second = await syncQueuedOutcomes(
      store,
      async () => ({ ok: true, discrepancy: null }),
      () => true
    );
    expect(second.synced).toHaveLength(1);
    expect(second.synced[0]?.clientEventId).toBe("evt-3");
  });

  it("does not drop a failed row and leaves it retryable", async () => {
    const store = createMemoryOutcomeStore();
    await enqueueOutcome(store, draft({ clientEventId: "evt-4" }));
    await syncQueuedOutcomes(
      store,
      async () => ({ ok: false, error: "That lead is not in this workspace.", retryable: false }),
      () => true
    );
    const row = await store.get("evt-4");
    expect(row?.status).toBe("failed");
    expect(row?.lastError).toMatch(/not in this workspace/);
    expect(unsyncedOutcomes(await store.getAll())).toHaveLength(1);

    const retried = await syncQueuedOutcomes(
      store,
      async () => ({ ok: true, discrepancy: null }),
      () => true
    );
    expect(retried.synced).toHaveLength(1);
  });

  it("syncs anyway when the lead changed and surfaces the discrepancy", async () => {
    const store = createMemoryOutcomeStore();
    await enqueueOutcome(store, draft({ clientEventId: "evt-5", expectedLeadStatus: "new" }));
    const result = await syncQueuedOutcomes(
      store,
      async () => ({
        ok: true,
        discrepancy: describeOutcomeDiscrepancy(
          { status: "new", lastTouchAt: null, firstHumanTouchAt: null },
          { status: "working", lastTouchAt: "2026-08-25T12:01:00.000Z", firstHumanTouchAt: "2026-08-25T12:01:00.000Z" }
        ),
      }),
      () => true
    );
    expect(result.synced).toHaveLength(1);
    expect(result.synced[0]?.discrepancy).toMatch(/still recorded/);
    expect(result.synced[0]?.discrepancy).toMatch(/status was new, now working/);
  });

  it("treats a duplicate client event as synced rather than inserting twice", async () => {
    const store = createMemoryOutcomeStore();
    await enqueueOutcome(store, draft({ clientEventId: "evt-6" }));
    const result = await syncQueuedOutcomes(
      store,
      async () => ({ ok: true, duplicate: true, discrepancy: null }),
      () => true
    );
    expect(result.synced[0]?.status).toBe("synced");
  });
});

describe("discrepancy copy", () => {
  it("says nothing when the snapshot matches", () => {
    expect(
      describeOutcomeDiscrepancy(
        { status: "new", lastTouchAt: null, firstHumanTouchAt: null },
        { status: "new", lastTouchAt: null, firstHumanTouchAt: null }
      )
    ).toBeNull();
  });
});
