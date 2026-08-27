"use client";

import {
  useCallback,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";

import { cn } from "@/lib/utils";

type MagicCardProps = {
  children?: ReactNode;
  className?: string;
  gradientSize?: number;
  gradientColor?: string;
  gradientOpacity?: number;
};

/**
 * Pointer-follow spotlight for landing cards.
 * The coss Card (or Panel) underneath is the surface — this layer never
 * paints an opaque fill, so titles and body copy stay visible.
 */
export function MagicCard({
  children,
  className,
  gradientSize = 240,
  gradientColor = "rgba(154, 136, 252, 0.22)",
  gradientOpacity = 0.85,
}: MagicCardProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const hover = useMotionValue(0);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      mouseX.set(event.clientX - rect.left);
      mouseY.set(event.clientY - rect.top);
    },
    [mouseX, mouseY],
  );

  const spotlight = useMotionTemplate`radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px, ${gradientColor}, transparent 68%)`;

  return (
    <div
      className={cn("relative", className)}
      onPointerEnter={() => hover.set(gradientOpacity)}
      onPointerLeave={() => hover.set(0)}
      onPointerMove={onPointerMove}
    >
      {children}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit]"
        style={{ background: spotlight, opacity: hover }}
      />
    </div>
  );
}
