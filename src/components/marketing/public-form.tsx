"use client";

import { BorderBeam } from "@/components/ui/border-beam";

/** Solid near-black panel with a purple glow on the edge. */
export const publicFormClass =
  "relative overflow-hidden space-y-4 rounded-[12px] border border-border bg-muted p-5 shadow-[0_0_72px_-20px_rgba(154,136,252,0.85)] sm:p-6";

/** Rectangle with rounded corners, just lighter than the page. */
export const publicFieldClass =
  "rounded-[8px]! border-border! bg-muted! shadow-none! before:rounded-[7px]! before:shadow-none! hover:border-border! dark:bg-muted!";

export const publicCheckClass = "border-border! bg-muted! dark:bg-muted!";

/** One submit control, the full width of the form box. */
export const publicSubmitClass = "mt-0! h-12! w-full rounded-[8px]! before:rounded-[7px]!";

export function FormGlow() {
  return (
    <div className="pointer-events-none absolute inset-0 mt-0! motion-safe:block motion-reduce:hidden" aria-hidden>
      <BorderBeam duration={8} size={120} borderWidth={1} colorFrom="#9A88FC" colorTo="#6650D8" />
    </div>
  );
}
