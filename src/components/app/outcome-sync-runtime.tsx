"use client";

import { useEffect, useState } from "react";

import { flushQueuedOutcomes } from "@/lib/mobile/flush-outcomes";
import { pendingOutcomeCount, openIndexedDbOutcomeStore } from "@/lib/mobile/outcome-queue";

export function OutcomeSyncRuntime() {
  const [updateReady, setUpdateReady] = useState(false);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function flush() {
      await flushQueuedOutcomes();
      if (cancelled) return;
      const store = await openIndexedDbOutcomeStore();
      setPending(pendingOutcomeCount(await store.getAll()));
    }

    function watchUpdate(registration: ServiceWorkerRegistration) {
      if (registration.waiting) setUpdateReady(true);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) setUpdateReady(true);
        });
      });
    }

    async function register() {
      if (!("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      watchUpdate(registration);
      const sync = (
        registration as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        }
      ).sync;
      await sync?.register("outcome-sync").catch(() => undefined);
    }

    void register();
    void flush();

    const onOnline = () => void flush();
    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === "outcome-sync-complete") void flush();
    };
    window.addEventListener("online", onOnline);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  return (
    <>
      {updateReady ? (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-[min(100%-1.5rem,28rem)] items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
          <p>Update available</p>
          <button
            type="button"
            className="rounded-md border border-border px-3 py-2"
            onClick={() => {
              navigator.serviceWorker?.controller?.postMessage({ type: "skip-waiting" });
              window.location.reload();
            }}
          >
            Reload
          </button>
        </div>
      ) : null}
      {pending > 0 ? (
        <p className="sr-only" aria-live="polite">
          {pending} outcome{pending === 1 ? "" : "s"} waiting to sync
        </p>
      ) : null}
    </>
  );
}
