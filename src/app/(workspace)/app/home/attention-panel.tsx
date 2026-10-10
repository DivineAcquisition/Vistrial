"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, ChevronRight, CircleCheck, Info } from "lucide-react";

import { refreshAttention } from "@/app/(workspace)/app/home/portal-actions";
import { Card } from "@/components/ui/card";
import type { AttentionState, AttentionTone } from "@/lib/portal/attention";
import { cn } from "@/lib/utils";

const POLL_MS = 60_000;

const TONE: Record<AttentionTone, { icon: typeof Info; className: string }> = {
  danger: { icon: AlertTriangle, className: "bg-destructive/12 text-destructive-foreground" },
  warning: { icon: AlertTriangle, className: "bg-warning/12 text-warning" },
  info: { icon: Info, className: "bg-brand-500/12 text-brand-300" },
};

function updatedLabel(iso: string, now: number): string {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  return minutes < 1 ? "Updated just now" : `Updated ${minutes} min ago`;
}

/**
 * What needs someone now. Refreshes every minute while the tab is open and
 * visible, so counts stay current without a reload.
 */
export function AttentionPanel({ initial }: { initial: AttentionState }) {
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(() => Date.parse(initial.loadedAt));
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const tick = () => {
      setNow(Date.now());
      if (document.visibilityState !== "visible") return;
      startTransition(async () => {
        try {
          setState(await refreshAttention());
        } catch {
          // Keep the last counts; the next tick tries again.
        }
      });
    };
    const timer = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return (
    <section aria-labelledby="home-attention" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-attention" className="font-heading text-base text-card-foreground">
          Needs attention
        </h2>
        <p className="text-xs text-muted-foreground" aria-live="polite" aria-busy={pending}>
          {updatedLabel(state.loadedAt, now)}
        </p>
      </div>
      {state.items.length === 0 ? (
        <Card className="flex-row items-center gap-3 p-4">
          <CircleCheck className="size-5 shrink-0 text-success" aria-hidden />
          <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
        </Card>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {state.items.map((item) => {
            const tone = TONE[item.tone];
            const Icon = tone.icon;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", tone.className)}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-card-foreground">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
