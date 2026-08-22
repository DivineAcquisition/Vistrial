import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A toggle for a setting that takes effect on its own, with no save step.
 * Where the change only lands on submit, use a checkbox: a switch that has not
 * done anything yet is a lie about the state of the system.
 *
 * Built on a native checkbox so it is keyboard operable and announced as a
 * checked state without any extra wiring.
 */
export function Switch({
  className,
  label,
  description,
  ...props
}: React.ComponentProps<"input"> & {
  label: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3", className)}>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" role="switch" className="peer sr-only" {...props} />
        <span
          aria-hidden
          className="h-5 w-9 rounded-full border border-white/20 bg-white/[0.06] transition-colors peer-checked:border-brand-500 peer-checked:bg-brand-500 peer-disabled:opacity-50 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-500/70"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-0.5 size-4 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4 peer-checked:bg-ink-950"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm text-white">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-dim">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
