"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { recordVisitAction, setAgenticHomeAction } from "@/app/(workspace)/app/home/workspace-actions";
import { Switch } from "@/components/ui/switch";

const BACKGROUND_REFRESH_MS = 60_000;
const PULL_DISTANCE = 72;

/**
 * Records the visit once the page has painted, refreshes saved state when the
 * person comes back from the background, and supports pull to refresh. Live
 * events keep flowing through the live channel in between.
 */
export function WorkspaceRuntime() {
  const router = useRouter();
  const hiddenAt = useRef<number | null>(null);
  const [pull, setPull] = useState(0);

  useEffect(() => {
    void recordVisitAction();
  }, []);

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        return;
      }
      if (hiddenAt.current && Date.now() - hiddenAt.current > BACKGROUND_REFRESH_MS) router.refresh();
      hiddenAt.current = null;
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [router]);

  useEffect(() => {
    let startY: number | null = null;
    let distance = 0;
    function onStart(event: TouchEvent) {
      startY = window.scrollY <= 0 ? event.touches[0].clientY : null;
      distance = 0;
    }
    function onMove(event: TouchEvent) {
      if (startY === null) return;
      distance = Math.max(0, event.touches[0].clientY - startY);
      setPull(Math.min(distance, PULL_DISTANCE * 1.5));
    }
    function onEnd() {
      if (startY !== null && distance >= PULL_DISTANCE) router.refresh();
      startY = null;
      distance = 0;
      setPull(0);
    }
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [router]);

  if (pull < 16) return null;
  return (
    <p role="status" className="pointer-events-none fixed inset-x-0 top-16 z-40 mx-auto w-fit rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
      {pull >= PULL_DISTANCE ? "Release to refresh" : "Pull to refresh"}
    </p>
  );
}

/** Vistrial staff switch the new workspace on per business during Private Access. */
export function AgenticHomeSwitch({ enabled, available }: { enabled: boolean; available: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-brand-500/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-card-foreground">New agent workspace for this business</p>
        <p className="text-xs text-muted-foreground">
          {available ? "Only the Vistrial team sees this switch." : "The workspace settings store is not reachable, so the current Home stays on."}
        </p>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </div>
      <Switch
        checked={on}
        disabled={pending || !available}
        aria-label="New agent workspace"
        onCheckedChange={(next) => {
          setOn(next);
          setError(null);
          start(async () => {
            const result = await setAgenticHomeAction(next);
            if (!result.ok) {
              setOn(!next);
              setError(result.error);
            } else router.refresh();
          });
        }}
      />
    </div>
  );
}
