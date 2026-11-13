import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { EvidenceLabel } from "./evidence-label";
import { ModelMark } from "./model-mark";

export type Count = { value: string; words: string; hint?: string };

/** A result's title line: what it is, when, its review status, and the slot for the model that ran. */
export function ResultHeader({ title, meta, status, model, level = 2 }: { title: string; meta?: ReactNode; status?: ReactNode; model?: string | null; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <Heading className="font-heading text-lg break-words text-card-foreground">{title}</Heading>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {meta}
          <ModelMark model={model} />
        </p>
      </div>
      {status}
    </div>
  );
}

/**
 * Layer one: the answer. A sentence or two, the evidence label of the weakest thing it rests on, and a few
 * counts. Each count is a number of things with words saying what was counted; none is a score.
 */
export function VerdictStrip({ eyebrow = "The answer", text, label, counts = [], children, className }: { eyebrow?: string; text: string; label: string | null; counts?: Count[]; children?: ReactNode; className?: string }) {
  return (
    <section aria-label={eyebrow} className={cn("grid gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4 sm:p-5", className)}>
      <div className="grid gap-1.5">
        <p className="flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-wide text-primary uppercase">
          {eyebrow}
          {label ? <EvidenceLabel label={label} className="tracking-normal normal-case" /> : null}
        </p>
        <p className="max-w-3xl font-heading text-base leading-snug text-card-foreground sm:text-lg">{text}</p>
      </div>
      {counts.length > 0 ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {counts.map((count) => (
            <div key={count.words} className="grid gap-0" title={count.hint}>
              <dd className="font-heading text-xl leading-tight text-card-foreground tabular-nums">{count.value}</dd>
              <dt className="text-xs text-muted-foreground">{count.words}</dt>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </section>
  );
}
