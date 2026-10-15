"use client";

import type { ReactNode } from "react";

import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { MagicCard } from "@/components/ui/magic-card";
import { marketingPanel } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/** The page glow lives on the shell. The hero itself stays on that solid field. */
export function HeroAtmosphere({ children }: { children: ReactNode }) {
  return <div className="relative">{children}</div>;
}

export function ShinyLabel({ children }: { children: ReactNode }) {
  return (
    <AnimatedShinyText className="mb-4 inline-flex text-[11px] font-semibold tracking-[0.16em] text-brand-200 uppercase">
      {children}
    </AnimatedShinyText>
  );
}

/** A product frame with a moving edge. Reduced motion keeps the still border. */
export function BeamFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-[#2a2833] bg-[#1c1a27] p-5 shadow-[0_24px_50px_-28px_rgba(0,0,0,0.85)] sm:p-6",
        className,
      )}
    >
      <div className="relative">{children}</div>
    </div>
  );
}

export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <MagicCard className={cn("h-full p-5", marketingPanel, className)}>
      {children}
    </MagicCard>
  );
}
