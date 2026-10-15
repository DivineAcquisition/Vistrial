"use client";

import type { ReactNode } from "react";

import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BorderBeam } from "@/components/ui/border-beam";
import { MagicCard } from "@/components/ui/magic-card";
import { Particles } from "@/components/ui/particles";
import { cn } from "@/lib/utils";

/** Soft brand field behind the hero. Motion stays inside the existing particle component. */
export function HeroAtmosphere({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <Particles
        className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full motion-safe:block"
        quantity={36}
        color="#9A88FC"
        ease={80}
        size={0.45}
        staticity={40}
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
    <div className={cn("relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6", className)}>
      <div className="pointer-events-none absolute inset-0 motion-safe:block motion-reduce:hidden">
        <BorderBeam colorFrom="#9A88FC" colorTo="#6650D8" size={80} duration={10} />
      </div>
      {children}
    </div>
  );
}

export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <MagicCard className={cn("h-full rounded-2xl border border-white/10 p-5", className)}>
      {children}
    </MagicCard>
  );
}
