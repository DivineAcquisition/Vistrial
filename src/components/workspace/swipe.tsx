"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { motionAllowsSwipe, swipeIntent } from "@/lib/workspace/swipe";
import { DECISION_COPY, WORK_COPY } from "@/lib/workspace/voice";
import { cn } from "@/lib/utils";

function interactiveTarget(event: ReactPointerEvent): boolean {
  return (event.target as HTMLElement | null)?.closest("button, a, input, textarea, select, summary, label") !== null;
}

/** Drag far enough and the row asks for one more tap. Buttons stay available either way. */
export function useSwipe(enabled: boolean, directions: "both" | "right" = "both") {
  const origin = useRef<number | null>(null);
  const dxRef = useRef(0);
  const [dx, setDx] = useState(0);
  const [intent, setIntent] = useState<"right" | "left" | null>(null);

  function onPointerDown(event: ReactPointerEvent) {
    if (!enabled || intent || !motionAllowsSwipe() || interactiveTarget(event)) return;
    origin.current = event.clientX;
  }
  function onPointerMove(event: ReactPointerEvent) {
    if (origin.current === null) return;
    const next = Math.max(-140, Math.min(140, event.clientX - origin.current));
    dxRef.current = next;
    setDx(next);
  }
  function finish() {
    if (origin.current === null) return;
    const chosen = swipeIntent(dxRef.current);
    origin.current = null;
    dxRef.current = 0;
    setDx(0);
    if (chosen === "left" && directions === "right") return;
    if (chosen) setIntent(chosen);
  }
  return {
    dx,
    intent,
    clear: () => setIntent(null),
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: () => {
      origin.current = null;
      dxRef.current = 0;
      setDx(0);
    },
  };
}

export function swipeMotion(dx: number): { transform?: string; touchAction: "pan-y" } {
  return { touchAction: "pan-y", ...(dx ? { transform: `translateX(${dx}px)` } : {}) };
}

/** Swipe right on a work row asks before calling. The Call button stays. */
export function SwipeCall({
  name,
  phone,
  className,
  children,
}: {
  name: string;
  phone: string | null;
  className?: string;
  children: ReactNode;
}) {
  const swipe = useSwipe(Boolean(phone), "right");
  return (
    <div
      className={cn(className, swipe.dx !== 0 && "relative z-10")}
      style={swipeMotion(swipe.dx)}
      onPointerDown={swipe.onPointerDown}
      onPointerMove={swipe.onPointerMove}
      onPointerUp={swipe.onPointerUp}
      onPointerCancel={swipe.onPointerCancel}
    >
      {children}
      {swipe.intent === "right" && phone ? (
        <div role="group" aria-label={WORK_COPY.swipeCall(name)} className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/80 p-2">
          <p className="min-w-0 flex-1 text-sm text-card-foreground">{WORK_COPY.swipeCall(name)}</p>
          <Button size="sm" render={<a href={`tel:${phone}`} />}>
            Call
          </Button>
          <Button size="sm" variant="ghost" onClick={swipe.clear}>
            {DECISION_COPY.cancel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
