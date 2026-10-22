"use client";

import { Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type OnboardCardProps = {
  duration?: number;
  /** Completed step, drawn at the bottom of the stack. */
  step1?: string;
  /** Step in progress, drawn in the middle. */
  step2?: string;
  /** Upcoming step, drawn faded at the top. */
  step3?: string;
  className?: string;
};

const surface =
  "flex w-full max-w-72 min-w-0 flex-col justify-center gap-2 rounded-md border border-border bg-gradient-to-br from-secondary to-card py-2 pl-3 pr-12";

/**
 * Stacked agent-setup progress. The loop returns to 0 before the next run
 * so the bar replays instead of sticking at full.
 */
export function OnboardCard({
  duration = 3000,
  step1 = "Agent setup",
  step2 = "Verifying connections",
  step3 = "Ready to draft",
  className,
}: OnboardCardProps) {
  const [progress, setProgress] = useState(0);
  const [animateKey, setAnimateKey] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      const show = window.setTimeout(() => setProgress(100), 0);
      return () => window.clearTimeout(show);
    }
    const forward = window.setTimeout(() => setProgress(100), 80);
    const reset = window.setTimeout(() => {
      setProgress(0);
      setAnimateKey((key) => key + 1);
    }, duration + 2000);
    return () => {
      window.clearTimeout(forward);
      window.clearTimeout(reset);
    };
  }, [animateKey, duration]);

  return (
    <div className={cn("relative flex w-full max-w-72 flex-col items-center justify-center gap-1 p-1", className)} aria-hidden>
      <div className={cn(surface, "scale-90 opacity-80")}>
        <div className="flex items-center justify-start gap-2 text-xs text-primary">
          <Loader2 className="size-3.5" />
          <div>{step3}</div>
        </div>
        <div className="ml-5 h-1.5 overflow-hidden rounded-full bg-muted" />
      </div>
      <div className={surface}>
        <div className="flex items-center justify-start gap-1.5 text-xs text-primary">
          <Loader2 className="size-3.5 animate-spin" />
          <div>{step2}</div>
        </div>
        <div className="ml-5 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            key={animateKey}
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: duration / 1000, ease: "easeInOut" }}
          />
        </div>
      </div>
      <div className={cn(surface, "scale-90 opacity-80")}>
        <div className="flex items-center justify-start text-xs text-primary">
          <span className="relative grid size-5 place-items-center">
            <span className="size-2.5 rounded-full bg-primary" />
            <Check className="absolute size-2 text-primary-foreground" />
          </span>
          <div>{step1}</div>
        </div>
        <div className="ml-5 h-1.5 overflow-hidden rounded-full bg-primary" />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-background from-20% to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-background from-20% to-transparent" />
    </div>
  );
}

export default OnboardCard;
