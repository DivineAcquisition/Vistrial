import type { TouchOutcome } from "@/lib/queue/types";

export const OUTCOME_DB_NAME = "vistrial-outcomes";
export const OUTCOME_STORE = "entries";
export const OUTCOME_DB_VERSION = 2;
/** Unsent outcomes are dropped after this many days. */
export const OUTCOME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type OutcomeSyncStatus = "pending" | "syncing" | "synced" | "failed";

/**
 * What the phone may keep. No name, note, phone, email, or workspace snapshot.
 * Status fields exist only so the queue can retry.
 */
export type QueuedOutcome = {
  clientEventId: string;
  leadId: string;
  outcome: TouchOutcome;
  clientLoggedAt: string;
  status: OutcomeSyncStatus;
  lastError: string | null;
  createdAt: string;
  syncedAt: string | null;
};

export const STORED_OUTCOME_KEYS = [
  "clientEventId",
  "leadId",
  "outcome",
  "clientLoggedAt",
  "status",
  "lastError",
  "createdAt",
  "syncedAt",
] as const;

export type OutcomeSyncResult =
  | { ok: true; duplicate?: boolean; discrepancy?: string | null }
  | { ok: false; error: string; retryable: boolean };

export type OutcomeStore = {
  getAll(): Promise<QueuedOutcome[]>;
  get(id: string): Promise<QueuedOutcome | null>;
  put(entry: QueuedOutcome): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
};

export function newClientEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function storedOutcome(entry: QueuedOutcome): QueuedOutcome {
  return {
    clientEventId: entry.clientEventId,
    leadId: entry.leadId,
    outcome: entry.outcome,
    clientLoggedAt: entry.clientLoggedAt,
    status: entry.status,
    lastError: entry.lastError,
    createdAt: entry.createdAt,
    syncedAt: entry.syncedAt,
  };
}

export function isExpiredOutcome(entry: QueuedOutcome, now = Date.now()): boolean {
  if (entry.status === "synced") return false;
  const at = Date.parse(entry.createdAt || entry.clientLoggedAt);
  if (!Number.isFinite(at)) return false;
  return now - at > OUTCOME_MAX_AGE_MS;
}

export function createMemoryOutcomeStore(seed: QueuedOutcome[] = []): OutcomeStore {
  const map = new Map(seed.map((entry) => [entry.clientEventId, storedOutcome(entry)]));
  return {
    async getAll() {
      return [...map.values()].map((entry) => storedOutcome(entry));
    },
    async get(id) {
      const row = map.get(id);
      return row ? storedOutcome(row) : null;
    },
    async put(entry) {
      map.set(entry.clientEventId, storedOutcome(entry));
    },
    async remove(id) {
      map.delete(id);
    },
    async clear() {
      map.clear();
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
      if (db.objectStoreNames.contains(OUTCOME_STORE)) db.deleteObjectStore(OUTCOME_STORE);
      db.createObjectStore(OUTCOME_STORE, { keyPath: "clientEventId" });
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the outcome queue."));
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        async getAll() {
          const rows = (await runStore(db, "readonly", (store) => store.getAll())) as QueuedOutcome[];
          return rows.map((row) => storedOutcome(row));
        },
        async get(id) {
          const row = (await runStore(db, "readonly", (store) => store.get(id))) as QueuedOutcome | undefined;
          return row ? storedOutcome(row) : null;
        },
        async put(entry) {
          await runStore(db, "readwrite", (store) => store.put(storedOutcome(entry)));
        },
        async remove(id) {
          await runStore(db, "readwrite", (store) => store.delete(id));
        },
        async clear() {
          await runStore(db, "readwrite", (store) => store.clear());
        },
      });
    };
  });
}

function runStore(db: IDBDatabase, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTCOME_STORE, mode);
    const request = fn(tx.objectStore(OUTCOME_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Outcome queue write failed."));
  });
}

export async function clearOutcomeQueue(store?: OutcomeStore): Promise<void> {
  const target = store ?? (await openIndexedDbOutcomeStore());
  await target.clear();
}

export async function enqueueOutcome(
  store: OutcomeStore,
  input: Pick<QueuedOutcome, "clientEventId" | "leadId" | "outcome" | "clientLoggedAt"> & { createdAt?: string }
): Promise<QueuedOutcome> {
  const existing = await store.get(input.clientEventId);
  if (existing?.status === "synced") return existing;
  const entry = storedOutcome({
    clientEventId: input.clientEventId,
    leadId: input.leadId,
    outcome: input.outcome,
    clientLoggedAt: input.clientLoggedAt,
    status: existing?.status === "syncing" ? "syncing" : "pending",
    lastError: existing?.lastError ?? null,
    createdAt: existing?.createdAt ?? input.createdAt ?? input.clientLoggedAt,
    syncedAt: existing?.syncedAt ?? null,
  });
  await store.put(entry);
  return entry;
}

export type FlushedOutcome = QueuedOutcome & { discrepancy?: string | null };

export async function syncQueuedOutcomes(
  store: OutcomeStore,
  post: (entry: QueuedOutcome) => Promise<OutcomeSyncResult>,
  isOnline: () => boolean = () => true,
  now = Date.now()
): Promise<{ pending: FlushedOutcome[]; synced: FlushedOutcome[]; failed: FlushedOutcome[]; expired: FlushedOutcome[] }> {
  const all = await store.getAll();
  const pending: FlushedOutcome[] = [];
  const synced: FlushedOutcome[] = [];
  const failed: FlushedOutcome[] = [];
  const expired: FlushedOutcome[] = [];

  for (const entry of all) {
    if (entry.status === "synced") {
      synced.push(entry);
      continue;
    }
    if (isExpiredOutcome(entry, now)) {
      await store.remove(entry.clientEventId);
      expired.push({
        ...entry,
        status: "failed",
        lastError: "This outcome expired before it could be saved.",
      });
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
      const done = storedOutcome({
        ...syncing,
        status: "synced",
        lastError: null,
        syncedAt: new Date().toISOString(),
      });
      await store.put(done);
      synced.push({ ...done, discrepancy: result.discrepancy ?? null });
      continue;
    }
    if (result.retryable) {
      const waiting: QueuedOutcome = { ...syncing, status: "pending", lastError: result.error };
      await store.put(waiting);
      pending.push(waiting);
      continue;
    }
    const rejected: QueuedOutcome = { ...syncing, status: "failed", lastError: result.error };
    await store.put(rejected);
    failed.push(rejected);
  }

  return { pending, synced, failed, expired };
}

export function unsyncedOutcomes(entries: QueuedOutcome[]): QueuedOutcome[] {
  return entries.filter((entry) => entry.status !== "synced");
}

export function pendingOutcomeCount(entries: QueuedOutcome[]): number {
  return unsyncedOutcomes(entries).length;
}

export function isRetryableOutcomeError(status: number): boolean {
  return status === 0 || status >= 500 || status === 408 || status === 429;
}
