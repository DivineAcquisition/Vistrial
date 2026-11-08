"use client";

import type React from "react";
import { ChevronDown } from "@/components/icons";

/** Solid near-black panel with a purple glow on the edge. */
export const publicFormClass =
  "relative overflow-hidden space-y-4 rounded-[12px] border border-border bg-muted p-5 shadow-[0_0_72px_-20px_rgba(154,136,252,0.85)] sm:p-6";

/** Rectangle with rounded corners, just lighter than the page. */
export const publicFieldClass =
  "rounded-[8px]! border-border! bg-muted! shadow-none! before:rounded-[7px]! before:shadow-none! hover:border-border! dark:bg-muted!";

export const publicCheckClass = "border-border! bg-muted! dark:bg-muted!";

/** One submit control, the full width of the form box. */
export const publicSubmitClass = "mt-0! h-12! w-full rounded-[8px]! before:rounded-[7px]!";

/** A soft violet wash along the top edge. Static, so it never reads as a broken border mid-animation. */
export function FormGlow() {
  return <div className="pointer-events-none absolute inset-x-0 top-0 mt-0! h-20 bg-gradient-to-b from-brand-500/12 to-transparent" aria-hidden />;
}

/** Selectable chip for a checkbox: the whole row is the target, and it lights up when checked. */
export const publicChipClass =
  "flex cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-strong transition-colors hover:border-brand-400/40 has-[:checked]:border-brand-500/60 has-[:checked]:bg-brand-500/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40";

/** A numbered group of fields, so a long form reads as a few short steps. */
export function FormSection({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-0! space-y-4 border-t border-border pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <legend className="float-left mb-4 flex w-full items-center gap-2.5">
        <span className="inline-flex size-6 items-center justify-center rounded-full border border-brand-400/50 bg-brand-500/10 font-heading text-[11px] text-brand-300 tabular-nums">
          {step}
        </span>
        <span className="font-heading text-base tracking-tight text-strong">{title}</span>
      </legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}

/** Two short fields side by side from small screens up. */
export function FieldPair({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/** Native select with the same chevron as the rest of the site's selects. */
export function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
