"use client";

import type { ReactNode } from "react";

import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BorderBeam } from "@/components/ui/border-beam";
import { MagicCard } from "@/components/ui/magic-card";
import { Particles } from "@/components/ui/particles";
import { marketingPanel } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

/** Soft brand field behind the hero. Motion stays inside the existing particle component. */
export function HeroAtmosphere({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-0 -z-10 size-[28rem] rounded-full bg-brand-500/25 blur-3xl motion-safe:animate-pulse"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0 -z-10 size-[22rem] rounded-full bg-[#6650D8]/20 blur-3xl motion-safe:animate-pulse"
      />
      <Particles
        className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full motion-safe:block"
        quantity={72}
        color="#9A88FC"
        ease={70}
        size={0.55}
        staticity={28}
      />
      {children}
    </div>
  );
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
        "relative overflow-hidden rounded-xl border border-[#8a86a3] bg-[#1c1a27] p-5 shadow-[0_24px_50px_-28px_rgba(0,0,0,0.85)] sm:p-6",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 motion-safe:block motion-reduce:hidden">
        <BorderBeam colorFrom="#9A88FC" colorTo="#6650D8" size={120} duration={9} />
      </div>
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
