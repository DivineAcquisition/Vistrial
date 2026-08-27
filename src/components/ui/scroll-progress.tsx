"use client";

import { motion, useScroll, type MotionProps, type MotionValue } from "motion/react";
import type { RefObject } from "react";

import { cn } from "@/lib/utils";

type ScrollProgressProps = Omit<React.HTMLAttributes<HTMLElement>, keyof MotionProps> & {
  ref?: React.Ref<HTMLDivElement>;
  /** Scroll container. Window when omitted. */
  container?: RefObject<HTMLElement | null>;
  /** Stick to the viewport top, or sit inside a relative parent. */
  attached?: "viewport" | "container";
};

export function ScrollProgress({
  className,
  ref,
  container,
  attached = "viewport",
  ...props
}: ScrollProgressProps) {
  const { scrollYProgress } = useScroll(
    container ? { container: container as RefObject<HTMLElement> } : undefined,
  );

  return (
    <motion.div
      ref={ref}
      className={cn(
        "z-50 h-px origin-left bg-linear-to-r from-brand-400 via-brand-500 to-brand-300",
        attached === "viewport" ? "fixed inset-x-0 top-0" : "sticky top-0",
        className,
      )}
      style={{ scaleX: scrollYProgress as MotionValue<number> }}
      {...props}
    />
  );
}
