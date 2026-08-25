"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Notice } from "@/components/ui/states";
import { flushQueuedOutcomes } from "@/lib/mobile/flush-outcomes";
import {
  openIndexedDbOutcomeStore,
  unsyncedOutcomes,
  type QueuedOutcome,
} from "@/lib/mobile/outcome-queue";
import { TOUCH_OUTCOME_LABELS } from "@/lib/queue/types";
import { btnSecondary, btnSizeSm } from "@/lib/ui";

export function ConnectionStatus() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [pending, setPending] = useState<QueuedOutcome[]>([]);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const refresh = () => setOnline(navigator.onLine);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const store = await openIndexedDbOutcomeStore();
      const rows = unsyncedOutcomes(await store.getAll());
      if (!cancelled) setPending(rows);
    }
    void load();
    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "outcome-sync-complete") void load();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    window.addEventListener("vistrial-outcome-sync", load);
    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      window.removeEventListener("vistrial-outcome-sync", load);
    };
  }, [online]);

  async function retry() {
    setRetrying(true);
    try {
      await flushQueuedOutcomes();
    } finally {
      setRetrying(false);
    }
  }

  if (online && pending.length === 0) return null;

  const failed = pending.filter((row) => row.status === "failed");
  const waiting = pending.filter((row) => row.status !== "failed");

  return (
    <div className="mb-4 space-y-2 print:hidden">
      {!online ? (
        <Notice tone="warning" title="No signal">
          Outcomes you log now stay pending on this phone until it can reach the server. They are
          not logged yet.
        </Notice>
      ) : null}
      {waiting.length > 0 ? (
        <Notice
          tone="warning"
          title={waiting.length === 1 ? "1 outcome pending" : `${waiting.length} outcomes pending`}
          action={
            online ? (
              <button
                type="button"
                className={`${btnSecondary} ${btnSizeSm}`}
                disabled={retrying}
                onClick={() => void retry()}
              >
                {retrying ? "Retrying…" : "Retry"}
              </button>
            ) : (
              <Link href="/app/log" className={`${btnSecondary} ${btnSizeSm}`}>
                Open log
              </Link>
            )
          }
        >
          Waiting to sync. Not shown as logged until the server confirms.
          {waiting[0]?.leadName ? ` ${waiting[0].leadName}: ${TOUCH_OUTCOME_LABELS[waiting[0].outcome]}.` : null}
        </Notice>
      ) : null}
      {failed.length > 0 ? (
        <Notice
          tone="critical"
          title={failed.length === 1 ? "1 outcome failed" : `${failed.length} outcomes failed`}
          action={
            <button
              type="button"
              className={`${btnSecondary} ${btnSizeSm}`}
              disabled={retrying}
              onClick={() => void retry()}
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          }
        >
          {failed[0]?.lastError || "Still on this phone. Retry to send it."}
        </Notice>
      ) : null}
    </div>
  );
}
