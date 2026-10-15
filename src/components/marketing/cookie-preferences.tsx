"use client";

import { useRef, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  globalPrivacyControlOn,
  measurementChoice,
  setMeasurementChoice,
  type MeasurementChoice,
} from "@/lib/marketing/consent";

type MeasurementSnap = {
  ready: boolean;
  choice: MeasurementChoice;
  gpc: boolean;
};

const SERVER_SNAP: MeasurementSnap = { ready: false, choice: "unset", gpc: false };

function useMeasurement(): MeasurementSnap {
  const box = useRef<{
    snap: MeasurementSnap;
    listeners: Set<() => void>;
    scheduled: boolean;
  } | null>(null);
  if (box.current == null) {
    box.current = { snap: SERVER_SNAP, listeners: new Set(), scheduled: false };
  }

  return useSyncExternalStore(
    (onChange) => {
      const current = box.current;
      if (!current) return () => undefined;
      current.listeners.add(onChange);
      const refresh = () => {
        const next: MeasurementSnap = {
          ready: true,
          choice: measurementChoice(),
          gpc: globalPrivacyControlOn(),
        };
        const prev = current.snap;
        if (prev.ready === next.ready && prev.choice === next.choice && prev.gpc === next.gpc) return;
        current.snap = next;
        current.listeners.forEach((listener) => listener());
      };
      if (!current.scheduled) {
        current.scheduled = true;
        queueMicrotask(refresh);
      }
      window.addEventListener("vistrial-measurement", refresh);
      window.addEventListener("storage", refresh);
      return () => {
        current.listeners.delete(onChange);
        window.removeEventListener("vistrial-measurement", refresh);
        window.removeEventListener("storage", refresh);
      };
    },
    () => box.current?.snap ?? SERVER_SNAP,
    () => SERVER_SNAP,
  );
}

export function CookieBar() {
  const { ready, choice, gpc } = useMeasurement();
  if (!ready || gpc || choice !== "unset") return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink-950/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-relaxed text-silver">
          This public site can count page views on our own servers. It does not use advertising pixels. Nothing is counted until you allow it.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMeasurementChoice("off")}>
            No thanks
          </Button>
          <Button type="button" size="sm" variant="gradient" onClick={() => setMeasurementChoice("on")}>
            Allow
          </Button>
        </div>
      </div>
    </div>
  );
}

export function CookiePreferences() {
  const { ready, choice, gpc } = useMeasurement();
  return (
    <details className="mt-4 max-w-md text-xs leading-relaxed text-silver">
      <summary className="cursor-pointer text-dim">Cookie preferences</summary>
      {!ready ? <p className="mt-2">Site measurement stays off until you allow it.</p> : null}
      {ready && gpc ? <p className="mt-2">Your browser sent Global Privacy Control. Site measurement stays off.</p> : null}
      {ready && !gpc ? (
        <p className="mt-2">
          Site measurement is {choice === "on" ? "on" : "off"}. It counts pages on this website only. It is not used after you sign in.
        </p>
      ) : null}
      {ready && !gpc ? (
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setMeasurementChoice("off")}>
            Turn off
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setMeasurementChoice("on")}>
            Turn on
          </Button>
        </div>
      ) : null}
    </details>
  );
}
