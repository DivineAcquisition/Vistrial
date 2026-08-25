import { postQueuedOutcome } from "@/lib/mobile/post-outcome";
import {
  openIndexedDbOutcomeStore,
  syncQueuedOutcomes,
  type QueuedOutcome,
} from "@/lib/mobile/outcome-queue";

export function emitOutcomeSyncEvent(): void {
  window.dispatchEvent(new Event("vistrial-outcome-sync"));
}

export async function flushQueuedOutcomes(): Promise<{
  pending: QueuedOutcome[];
  synced: QueuedOutcome[];
  failed: QueuedOutcome[];
}> {
  const store = await openIndexedDbOutcomeStore();
  const result = await syncQueuedOutcomes(store, postQueuedOutcome, () => navigator.onLine);
  emitOutcomeSyncEvent();
  return result;
}
