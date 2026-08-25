"use client";

import { useEffect } from "react";

import { flushQueuedOutcomes } from "@/lib/mobile/flush-outcomes";

export function OutcomeSyncRuntime() {
  useEffect(() => {
    let cancelled = false;

    async function flush() {
      await flushQueuedOutcomes();
      if (cancelled) return;
    }

    async function register() {
      if (!("serviceWorker" in navigator)) return;
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
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

  return null;
}
