"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Cards lift a little on hover, with a soft spotlight that follows the pointer. Pure CSS apart from tracking
 * the pointer position; no movement when the system asks for reduced motion.
 */
export function HoverLift({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "group/lift relative isolate rounded-xl transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_14px_32px_-18px_color-mix(in_oklab,var(--color-primary)_55%,transparent)] motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty(
          "--lift-x",
          `${event.clientX - box.left}px`,
        );
        event.currentTarget.style.setProperty(
          "--lift-y",
          `${event.clientY - box.top}px`,
        );
      }}
    >
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] opacity-0 transition-opacity duration-200 group-hover/lift:opacity-100 [background:radial-gradient(220px_circle_at_var(--lift-x,50%)_var(--lift-y,50%),color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_70%)]"
      />
    </div>
  );
}
