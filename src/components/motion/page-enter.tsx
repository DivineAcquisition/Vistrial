"use client";

import { MotionConfig, motion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Each page fades and un-blurs in when you open it. Keyed by the caller (the pathname) so it plays on every
 * navigation. MotionConfig honours the system's reduced-motion setting for everything inside.
 */
export function PageEnter({
  children,
  id,
}: {
  children: ReactNode;
  id: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={id}
        initial={{ opacity: 0, y: 8, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="min-w-0"
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
