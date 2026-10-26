"use client";

import type { ReactNode } from "react";

import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BorderBeam } from "@/components/ui/border-beam";
import { MagicCard } from "@/components/ui/magic-card";
import { marketingPanel } from "@/lib/marketing/ui";
import { cn } from "@/lib/utils";

const cardGlow = "shadow-[0_0_72px_-28px_rgba(154,136,252,0.8)]";

function TravelingBeam({ delay = 0 }: { delay?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 motion-safe:block motion-reduce:hidden">
      <BorderBeam delay={delay} duration={8} size={110} borderWidth={1} colorFrom="#9A88FC" colorTo="#6650D8" />
    </div>
  );
}

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

/** A product frame. Glow adds a purple wash and a beam that travels the edge. */
export function BeamFrame({
  children,
  className,
  glow = false,
  beamDelay = 0,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  beamDelay?: number;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-5 sm:p-6",
        glow ? cardGlow : "shadow-[0_24px_50px_-28px_rgba(0,0,0,0.85)]",
        className,
      )}
    >
      {glow ? (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-brand-500/25 to-transparent" />
          <TravelingBeam delay={beamDelay} />
        </>
      ) : null}
      <div className="relative">{children}</div>
    </div>
  );
}

export function GlowPanel({
  children,
  className,
  beamDelay = 0,
}: {
  children: ReactNode;
  className?: string;
  beamDelay?: number;
}) {
  return (
    <div className={cn("relative overflow-hidden", cardGlow, marketingPanel, className)}>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-brand-500/20 to-transparent" />
      <TravelingBeam delay={beamDelay} />
      <div className="relative">{children}</div>
    </div>
  );
}

export function SpotlightCard({
  children,
  className,
  glow = false,
  beamDelay = 0,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  beamDelay?: number;
}) {
  return (
    <MagicCard className={cn("h-full overflow-hidden p-5", marketingPanel, glow && cardGlow, className)}>
      {glow ? (
        <>
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-brand-500/20 to-transparent" />
          <TravelingBeam delay={beamDelay} />
        </>
      ) : null}
      <div className="relative">{children}</div>
    </MagicCard>
  );
}
