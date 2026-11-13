"use client";

import { Globe } from "@/components/icons";
import { motion, useReducedMotion } from "motion/react";

import { VistrialMark } from "@/components/brand/vistrial-mark";
import { PlatformLogo } from "@/components/marketing/platform-logo";
import { cn } from "@/lib/utils";

/** The places the agent reads from, drawn with their real logos around the orb. */
const SOURCES: { key: string; logo: string | null; label: string }[] = [
  { key: "web", logo: null, label: "Web" },
  { key: "youtube", logo: "youtube", label: "YouTube" },
  { key: "instagram", logo: "instagram", label: "Instagram" },
  { key: "tiktok", logo: "tiktok", label: "TikTok" },
  { key: "meta", logo: "meta", label: "Meta" },
];

const ORBIT_SECONDS = 28;

/**
 * The agent, ready to work: the Vistrial orb breathing at the centre, a scanning sweep, and the real sources it
 * researches circling it. Purely decorative; holds still when the system asks for reduced motion.
 */
export function AgentScene({
  className,
  label = "Strategist is ready",
  sources = SOURCES,
  tint,
}: {
  className?: string;
  label?: string;
  /** Logos circling the orb; defaults to the research sources. */
  sources?: { key: string; logo: string | null; label: string }[];
  /** The agent's own colour; defaults to the brand. */
  tint?: string;
}) {
  const still = useReducedMotion();
  const radius = 64;
  return (
    <div aria-hidden className={cn("grid justify-items-center gap-3", className)} style={tint ? ({ "--color-primary": tint, "--primary": tint } as React.CSSProperties) : undefined}>
      <div className="relative size-44">
        {/* Soft halo and two orbit rings */}
        <div className="absolute inset-6 rounded-full bg-primary/15 blur-2xl" />
        <div className="absolute inset-[22px] rounded-full border border-dashed border-primary/25" />
        <div className="absolute inset-[46px] rounded-full border border-primary/15" />

        {/* Scanning sweep */}
        <motion.div
          className="absolute inset-[22px] rounded-full [background:conic-gradient(from_0deg,transparent_0deg,color-mix(in_oklab,var(--color-primary)_22%,transparent)_40deg,transparent_80deg)]"
          animate={still ? undefined : { rotate: 360 }}
          transition={{ duration: 6, ease: "linear", repeat: Infinity }}
        />

        {/* Sources circling the orb, each kept upright */}
        <motion.div
          className="absolute inset-0"
          animate={still ? undefined : { rotate: 360 }}
          transition={{ duration: ORBIT_SECONDS, ease: "linear", repeat: Infinity }}
        >
          {sources.map((source, index) => {
            const angle = (index / sources.length) * Math.PI * 2 - Math.PI / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            return (
              <motion.span
                key={source.key}
                className="absolute top-1/2 left-1/2 flex size-8 items-center justify-center rounded-xl border border-border bg-card shadow-sm"
                style={{ x: x - 16, y: y - 16 }}
                animate={still ? undefined : { rotate: -360 }}
                transition={{ duration: ORBIT_SECONDS, ease: "linear", repeat: Infinity }}
              >
                {source.logo ? <PlatformLogo id={source.logo} size={16} decorative /> : <Globe className="size-4 text-muted-foreground" />}
              </motion.span>
            );
          })}
        </motion.div>

        {/* The orb */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            className="relative"
            animate={still ? undefined : { scale: [1, 1.06, 1] }}
            transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
          >
            <span className="absolute -inset-2 rounded-full bg-primary/20 blur-md" />
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20 [animation-duration:2.4s] motion-reduce:hidden" />
            <VistrialMark size="md" className="relative size-14 p-2 ring-primary/30 shadow-[0_12px_32px_-12px_color-mix(in_oklab,var(--color-primary)_70%,transparent)]" />
          </motion.div>
        </div>
      </div>
      <span className="inline-flex items-center gap-2 rounded-[6px] border border-primary/20 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
          <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
        </span>
        {label}
      </span>
    </div>
  );
}
