import type { TouchChannel, TouchDirection, TouchOutcome } from "@/lib/queue/types";
import type { ClientSurface } from "@/lib/mobile/surface";

export const OUTCOME_DB_NAME = "vistrial-outcomes";
export const OUTCOME_STORE = "entries";
export const OUTCOME_DB_VERSION = 1;

export type OutcomeSyncStatus = "pending" | "syncing" | "synced" | "failed";

export type QueuedOutcome = {
  clientEventId: string;
  leadId: string;
  leadName: string;
  orgId: string;
  channel: TouchChannel;
  direction: TouchDirection;
  outcome: TouchOutcome;
  note: string;
  actorMemberId: string;
  clientLoggedAt: string;
  queuedOffline: boolean;
  clientSurface: ClientSurface;
  expectedLeadStatus: string | null;
  expectedLastTouchAt: string | null;
  expectedFirstHumanTouchAt: string | null;
  status: OutcomeSyncStatus;
  lastError: string | null;
  discrepancy: string | null;
  createdAt: string;
  syncedAt: string | null;
};

export type OutcomeSyncResult =
  | { ok: true; duplicate?: boolean; discrepancy?: string | null }
  | { ok: false; error: string; retryable: boolean };

export type OutcomeStore = {
  getAll(): Promise<QueuedOutcome[]>;
  get(id: string): Promise<QueuedOutcome | null>;
  put(entry: QueuedOutcome): Promise<void>;
  remove(id: string): Promise<void>;
};

export function newClientEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createMemoryOutcomeStore(seed: QueuedOutcome[] = []): OutcomeStore {
  const map = new Map(seed.map((entry) => [entry.clientEventId, { ...entry }]));
  return {
    async getAll() {
      return [...map.values()].map((entry) => ({ ...entry }));
    },
    async get(id) {
      const row = map.get(id);
      return row ? { ...row } : null;
    },
    async put(entry) {
      map.set(entry.clientEventId, { ...entry });
    },
    async remove(id) {
      map.delete(id);
    },
  };
}

export function openIndexedDbOutcomeStore(): Promise<OutcomeStore> {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(createMemoryOutcomeStore());
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTCOME_DB_NAME, OUTCOME_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTCOME_STORE)) {
        db.createObjectStore(OUTCOME_STORE, { keyPath: "clientEventId" });
      }
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the outcome queue."));
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        async getAll() {
          return runStore(db, "readonly", (store) => store.getAll()) as Promise<QueuedOutcome[]>;
        },
        async get(id) {
          const row = (await runStore(db, "readonly", (store) => store.get(id))) as
            | QueuedOutcome
            | undefined;
          return row ?? null;
        },
        async put(entry) {
          await runStore(db, "readwrite", (store) => store.put(entry));
        },
        async remove(id) {
          await runStore(db, "readwrite", (store) => store.delete(id));
        },
      });
    };
  });
}

function runStore(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTCOME_STORE, mode);
    const request = fn(tx.objectStore(OUTCOME_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Outcome queue write failed."));
  });
}

/**
 * Persist first, then attempt the network. A queued row is never dropped, and
 * it is never marked synced until the server says the write landed.
 */
export async function enqueueOutcome(
  store: OutcomeStore,
  input: Omit<QueuedOutcome, "status" | "lastError" | "discrepancy" | "createdAt" | "syncedAt"> & {
    createdAt?: string;
  }
): Promise<QueuedOutcome> {
  const existing = await store.get(input.clientEventId);
  if (existing?.status === "synced") return existing;
  const entry: QueuedOutcome = {
    ...input,
    status: existing?.status === "syncing" ? "syncing" : "pending",
    lastError: existing?.lastError ?? null,
    discrepancy: existing?.discrepancy ?? null,
    createdAt: existing?.createdAt ?? input.createdAt ?? input.clientLoggedAt,
    syncedAt: existing?.syncedAt ?? null,
  };
  await store.put(entry);
  return entry;
}

export async function syncQueuedOutcomes(
  store: OutcomeStore,
  post: (entry: QueuedOutcome) => Promise<OutcomeSyncResult>,
  isOnline: () => boolean = () => true
): Promise<{ pending: QueuedOutcome[]; synced: QueuedOutcome[]; failed: QueuedOutcome[] }> {
  const all = await store.getAll();
  const pending: QueuedOutcome[] = [];
  const synced: QueuedOutcome[] = [];
  const failed: QueuedOutcome[] = [];

  for (const entry of all) {
    if (entry.status === "synced") {
      synced.push(entry);
      continue;
    }
    if (!isOnline()) {
      const waiting: QueuedOutcome = { ...entry, status: "pending" };
      await store.put(waiting);
      pending.push(waiting);
      continue;
    }

    const syncing: QueuedOutcome = { ...entry, status: "syncing", lastError: null };
    await store.put(syncing);
    const result = await post(syncing);
    if (result.ok) {
      const done: QueuedOutcome = {
        ...syncing,
        status: "synced",
        lastError: null,
        discrepancy: result.discrepancy ?? null,
        syncedAt: new Date().toISOString(),
      };
      await store.put(done);
      synced.push(done);
      continue;
    }
    if (result.retryable) {
      const waiting: QueuedOutcome = {
        ...syncing,
        status: "pending",
        lastError: result.error,
      };
      await store.put(waiting);
      pending.push(waiting);
      continue;
    }
    const rejected: QueuedOutcome = {
      ...syncing,
      status: "failed",
      lastError: result.error,
    };
    await store.put(rejected);
    failed.push(rejected);
  }

  return { pending, synced, failed };
}

export function unsyncedOutcomes(entries: QueuedOutcome[]): QueuedOutcome[] {
  return entries.filter((entry) => entry.status !== "synced");
}

export function isRetryableOutcomeError(status: number): boolean {
  return status === 0 || status >= 500 || status === 408 || status === 429;
}
