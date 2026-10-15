import { describe, expect, it } from "vitest";

import { describeOutcomeDiscrepancy } from "@/lib/mobile/discrepancy";
import {
  createMemoryOutcomeStore,
  enqueueOutcome,
  isExpiredOutcome,
  OUTCOME_MAX_AGE_MS,
  pendingOutcomeCount,
  STORED_OUTCOME_KEYS,
  storedOutcome,
  syncQueuedOutcomes,
  unsyncedOutcomes,
  type OutcomeSyncResult,
  type QueuedOutcome,
} from "@/lib/mobile/outcome-queue";
import { detectClientSurface } from "@/lib/mobile/surface";

function draft(overrides: Partial<Pick<QueuedOutcome, "clientEventId" | "leadId" | "outcome" | "clientLoggedAt" | "createdAt">> = {}) {
  return {
    clientEventId: overrides.clientEventId ?? "evt",
    leadId: overrides.leadId ?? "lead-1",
    outcome: overrides.outcome ?? "connected",
    clientLoggedAt: overrides.clientLoggedAt ?? new Date().toISOString(),
    createdAt: overrides.createdAt,
  } as const;
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
  it("stores only the lead id, outcome code, and time", async () => {
    const store = createMemoryOutcomeStore();
    const entry = await enqueueOutcome(store, draft({ clientEventId: "evt-1" }));
    expect(Object.keys(storedOutcome(entry)).sort()).toEqual([...STORED_OUTCOME_KEYS].sort());
    expect(JSON.stringify(await store.get("evt-1"))).not.toMatch(/Jordan|note|@|phone/i);
    expect(entry.status).toBe("pending");
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
    const first = await syncQueuedOutcomes(store, async () => ({ ok: false, error: "offline", retryable: true }), () => false);
    expect(first.pending).toHaveLength(1);
    expect(await store.get("evt-3")).not.toBeNull();
    const second = await syncQueuedOutcomes(store, async () => ({ ok: true, discrepancy: null }), () => true);
    expect(second.synced[0]?.clientEventId).toBe("evt-3");
  });

  it("does not drop a failed row and leaves it retryable", async () => {
    const store = createMemoryOutcomeStore();
    await enqueueOutcome(store, draft({ clientEventId: "evt-4" }));
    await syncQueuedOutcomes(
      store,
      async () => ({ ok: false, error: "You can no longer open that lead, so this outcome was not saved.", retryable: false }),
      () => true
    );
    const row = await store.get("evt-4");
    expect(row?.status).toBe("failed");
    expect(unsyncedOutcomes(await store.getAll())).toHaveLength(1);
    expect(pendingOutcomeCount(await store.getAll())).toBe(1);
  });

  it("returns a discrepancy in memory and does not store it", async () => {
    const store = createMemoryOutcomeStore();
    await enqueueOutcome(store, draft({ clientEventId: "evt-5" }));
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
    expect(result.synced[0]?.discrepancy).toMatch(/still recorded/);
    expect(JSON.stringify(await store.get("evt-5"))).not.toMatch(/discrepancy|working/);
  });

  it("drops an outcome that stayed unsent past the limit", async () => {
    const store = createMemoryOutcomeStore();
    const old = new Date(Date.now() - OUTCOME_MAX_AGE_MS - 1000).toISOString();
    await enqueueOutcome(store, draft({ clientEventId: "evt-old", clientLoggedAt: old, createdAt: old }));
    expect(isExpiredOutcome((await store.get("evt-old"))!)).toBe(true);
    const result = await syncQueuedOutcomes(store, async () => ({ ok: true }), () => true);
    expect(result.expired).toHaveLength(1);
    expect(await store.get("evt-old")).toBeNull();
  });

  it("clears every row", async () => {
    const store = createMemoryOutcomeStore();
    await enqueueOutcome(store, draft({ clientEventId: "evt-6" }));
    await store.clear();
    expect(await store.getAll()).toEqual([]);
  });
});
