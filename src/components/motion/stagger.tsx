"use client";

import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";

const list = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

const item = {
  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.18 } },
};

type Tag = "ul" | "ol" | "div";

/** A list whose items cascade in one after another. New items slide in, removed ones fade out, the rest move into place. */
export function Stagger({
  as = "ul",
  className,
  children,
}: {
  as?: Tag;
  className?: string;
  children: ReactNode;
}) {
  const Component = motion[as];
  return (
    <Component
      variants={list}
      initial="hidden"
      animate="show"
      className={className}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {children}
      </AnimatePresence>
    </Component>
  );
}

/** One item in a Stagger list. Give it a stable key. */
export function StaggerItem({
  as = "li",
  className,
  children,
  ...rest
}: { as?: "li" | "div"; className?: string; children: ReactNode } & Omit<
  HTMLMotionProps<"li">,
  "children"
>) {
  const Component = as === "li" ? motion.li : motion.div;
  return (
    <Component
      layout
      variants={item}
      exit="exit"
      className={className}
      {...(rest as object)}
    >
      {children}
    </Component>
  );
}
